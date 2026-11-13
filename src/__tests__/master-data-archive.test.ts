import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MASTER_DATA_ARCHIVE_RETENTION_DAYS,
  archiveCutoff,
  archiveDaysLeft,
  archiveExpiresAt,
} from "../lib/master-data-archive";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-01-31T00:00:00.000Z");

describe("master-data archive retention", () => {
  it("keeps records restorable for 30 days", () => {
    assert.equal(MASTER_DATA_ARCHIVE_RETENTION_DAYS, 30);
  });

  it("computes the expiry from the delete timestamp", () => {
    const expires = archiveExpiresAt("2026-01-01T00:00:00.000Z");
    assert.ok(expires);
    assert.equal(expires!.getTime(), Date.parse("2026-01-31T00:00:00.000Z"));
  });

  it("reports whole days left, rounded up", () => {
    assert.equal(archiveDaysLeft("2026-01-01T00:00:00.000Z", NOW), 0);
    assert.equal(archiveDaysLeft("2026-01-02T00:00:00.000Z", NOW), 1);
    assert.equal(archiveDaysLeft(new Date(NOW.getTime() - DAY_MS / 2), NOW), 30);
  });

  it("never reports negative days", () => {
    assert.equal(archiveDaysLeft("2025-01-01T00:00:00.000Z", NOW), 0);
  });

  it("returns null for missing or invalid timestamps", () => {
    assert.equal(archiveDaysLeft(null, NOW), null);
    assert.equal(archiveDaysLeft("", NOW), null);
    assert.equal(archiveDaysLeft("not-a-date", NOW), null);
    assert.equal(archiveExpiresAt(undefined), null);
  });

  it("computes the purge cutoff exactly 30 days back", () => {
    assert.equal(
      archiveCutoff(NOW).getTime(),
      NOW.getTime() - MASTER_DATA_ARCHIVE_RETENTION_DAYS * DAY_MS
    );
  });
});
