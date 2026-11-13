/**
 * Retention rules for soft-deleted master data (departments, units, stock
 * headers, asset headers). A deleted row stays restorable for
 * `MASTER_DATA_ARCHIVE_RETENTION_DAYS`, then it is permanently removed from
 * the database by the archive purge.
 */
export const MASTER_DATA_ARCHIVE_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

function toMs(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const ms = typeof value === "string" ? Date.parse(value) : value.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Exact moment a deleted record becomes eligible for the automatic purge. */
export function archiveExpiresAt(deletedAt: string | Date | null | undefined): Date | null {
  const ms = toMs(deletedAt);
  if (ms === null) return null;
  return new Date(ms + MASTER_DATA_ARCHIVE_RETENTION_DAYS * DAY_MS);
}

/**
 * Whole days left before auto-purge (rounded up), or `null` when the record
 * has no usable delete timestamp.
 */
export function archiveDaysLeft(
  deletedAt: string | Date | null | undefined,
  now: Date = new Date()
): number | null {
  const expires = archiveExpiresAt(deletedAt);
  if (!expires) return null;
  return Math.max(0, Math.ceil((expires.getTime() - now.getTime()) / DAY_MS));
}

/** Anything deleted at or before this timestamp is past the retention window. */
export function archiveCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - MASTER_DATA_ARCHIVE_RETENTION_DAYS * DAY_MS);
}
