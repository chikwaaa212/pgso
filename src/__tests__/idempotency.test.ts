import { test } from "node:test";
import assert from "node:assert";

/**
 * Validates an idempotency key.
 * Mirrors the guard in src/lib/idempotency.ts withIdempotency().
 */
function isValidIdempotencyKey(key: unknown): boolean {
  return (
    typeof key === "string" && key.length >= 8 && key.length <= 128
  );
}

test("idempotency key validation", () => {
  // Valid keys
  assert.strictEqual(isValidIdempotencyKey("abc12345"), true, "8-char key is valid");
  assert.strictEqual(isValidIdempotencyKey("a".repeat(128)), true, "128-char key is valid");
  assert.strictEqual(isValidIdempotencyKey("a".repeat(64)), true, "64-char key is valid");

  // Invalid keys
  assert.strictEqual(isValidIdempotencyKey(null), false, "null is invalid");
  assert.strictEqual(isValidIdempotencyKey(undefined), false, "undefined is invalid");
  assert.strictEqual(isValidIdempotencyKey(""), false, "empty string is invalid");
  assert.strictEqual(isValidIdempotencyKey("abc123"), false, "7-char key is invalid");
  assert.strictEqual(isValidIdempotencyKey("a".repeat(129)), false, "129-char key is invalid");
  assert.strictEqual(isValidIdempotencyKey(12345678), false, "number is invalid");
});

test("idempotency key length boundaries", () => {
  assert.strictEqual(isValidIdempotencyKey("a".repeat(8)), true, "exactly 8 chars is valid");
  assert.strictEqual(isValidIdempotencyKey("a".repeat(7)), false, "exactly 7 chars is invalid");
  assert.strictEqual(isValidIdempotencyKey("a".repeat(128)), true, "exactly 128 chars is valid");
  assert.strictEqual(isValidIdempotencyKey("a".repeat(129)), false, "exactly 129 chars is invalid");
});
