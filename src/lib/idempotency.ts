import "server-only";

import type { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";

// How long a "processing" claim is trusted before it's assumed the first
// attempt crashed and the key may be reclaimed.
const PROCESSING_TIMEOUT_MS = 120_000;
// How long a duplicate waits for the in-flight attempt before giving up.
const POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 250;
// Safety bound on reclaim attempts for the same key within one call.
const MAX_ATTEMPTS = 2;

export interface IdempotentOutcome<T> {
  /** True when this key was already processed and the stored result is returned. */
  duplicate: boolean;
  result: T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Execute `fn` at most once per idempotency `key`.
 *
 * - First caller claims the key (`processing`), runs `fn`, then stores the
 *   result (`completed`).
 * - Concurrent duplicates with the same key wait for the in-flight attempt
 *   and receive its stored result — the operation still runs exactly once.
 * - If `fn` throws, the claim is released so a retry can run fresh.
 * - Stale `processing` claims (crashed attempt) are reclaimed after a timeout.
 *
 * The result must be a JSON-serializable object.
 */
export async function withIdempotency<T extends Record<string, unknown>>(
  key: string | null | undefined,
  operation: string,
  fn: () => Promise<T>
): Promise<IdempotentOutcome<T>> {
  if (!key || typeof key !== "string" || key.length < 8 || key.length > 128) {
    return { duplicate: false, result: await fn() };
  }

  // Reclaim a claim left behind by a crashed first attempt.
  await prisma.idempotencyKey
    .deleteMany({
      where: {
        key,
        status: "processing",
        updated_at: { lt: new Date(Date.now() - PROCESSING_TIMEOUT_MS) },
      },
    })
    .catch(() => undefined);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let claimed = false;
    try {
      await prisma.idempotencyKey.create({
        data: { key, operation, status: "processing" },
      });
      claimed = true;
    } catch (error) {
      if (!isConflict(error)) throw error;
    }

    if (claimed) {
      try {
        const result = await fn();
        await prisma.idempotencyKey.update({
          where: { key },
          data: { status: "completed", response: result as Prisma.InputJsonValue },
        });
        return { duplicate: false, result };
      } catch (error) {
        // Release the claim so a retry runs the operation fresh.
        await prisma.idempotencyKey
          .delete({ where: { key } })
          .catch(() => undefined);
        throw error;
      }
    }

    const existing = await prisma.idempotencyKey.findUnique({ where: { key } });
    if (existing?.status === "completed" && isRecord(existing.response)) {
      return { duplicate: true, result: existing.response as T };
    }

    // Another attempt is in flight: wait briefly for its stored result.
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let settled = false;
    let stored: unknown = null;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const row = await prisma.idempotencyKey.findUnique({ where: { key } });
      if (!row) break; // first attempt failed and released; reclaim below
      if (row.status === "completed") {
        settled = true;
        stored = row.response;
        break;
      }
    }
    if (settled && isRecord(stored)) {
      return { duplicate: true, result: stored as T };
    }
    if (!settled) continue; // key vanished (failure cleanup) → reclaim once
    throw new Error(
      "Duplicate request is still processing. Please wait a moment and try again."
    );
  }

  throw new Error(
    "Duplicate request is still processing. Please wait a moment and try again."
  );
}
