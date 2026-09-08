import { test } from "node:test";
import assert from "node:assert";

/**
 * Simulates the in-flight guard pattern used in useActionLoading and ActionButton.
 * Tests that duplicate calls are prevented.
 */
function createInFlightGuard() {
  let inFlight = false;
  return {
    isInFlight: () => inFlight,
    tryAcquire: () => {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    release: () => { inFlight = false; },
  };
}

test("in-flight guard prevents duplicate execution", async () => {
  const guard = createInFlightGuard();
  let executionCount = 0;

  const action = async () => {
    if (!guard.tryAcquire()) return;
    try {
      executionCount++;
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      guard.release();
    }
  };

  // First call should execute
  await action();
  assert.strictEqual(executionCount, 1, "first call executes");

  // Second call while in-flight should be prevented
  // Simulate by not releasing before second call
  guard.tryAcquire(); // acquire again
  await action(); // this should not execute because guard is already acquired
  assert.strictEqual(executionCount, 1, "duplicate call is prevented");
  guard.release();
});

test("in-flight guard allows execution after release", async () => {
  const guard = createInFlightGuard();
  let executionCount = 0;

  const action = async () => {
    if (!guard.tryAcquire()) return;
    try {
      executionCount++;
    } finally {
      guard.release();
    }
  };

  await action();
  assert.strictEqual(executionCount, 1, "first call executes");

  await action();
  assert.strictEqual(executionCount, 2, "second call executes after release");
});

test("crypto.randomUUID generates valid idempotency keys", () => {
  const key = crypto.randomUUID();
  assert.strictEqual(typeof key, "string", "key is a string");
  assert.strictEqual(key.length >= 8, true, "key has at least 8 characters");
  assert.strictEqual(key.length <= 128, true, "key has at most 128 characters");
});
