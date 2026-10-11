/**
 * Procurement schedule parsing (quarterly calendar).
 * Observed schedule text: "July 2026", "February 2026", "01/2026",
 * "2026-06-01" (Excel dates), "April-2026", "Feb. 2026",
 * "From 01/2026 to 06/2026". Pure + deterministic.
 * Timing rule (confirmed): a line's whole budget counts in its DELIVERY
 * quarter; ranges resolve to the range's end month. Unparseable or missing
 * dates yield null (the "unscheduled" bucket) — never guessed.
 */

export interface YearMonth {
  year: number;
  /** 1-12. */
  month: number;
}

export type Quarter = 1 | 2 | 3 | 4;

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, oct: 10, nov: 11, dec: 12,
};

function monthWord(s: string): number | null {
  const m = s.toLowerCase().match(
    /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?/
  );
  if (!m) return null;
  const key = m[1].replace(/\.$/, "");
  if (key === "sept") return 9;
  return MONTHS[key] ?? null;
}

function yearNear(s: string, anchor: number): number | null {
  const years = [...s.matchAll(/((?:19|20)\d{2})/g)].map((m) => Number(m[1]));
  if (years.length === 0) return null;
  if (years.length === 1) return years[0];
  // "From 01/2026 to 06/2026": callers split ranges first; fallback to anchor.
  return years.includes(anchor) ? anchor : years[years.length - 1];
}

/**
 * Parse one schedule cell into a YearMonth. `anchorYear` (the file's fiscal
 * year) fills in bare "July"-style values only when exactly one year is in
 * context; otherwise null (ambiguous beats wrong).
 */
export function parseScheduleMonth(value: unknown, anchorYear: number | null): YearMonth | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { year: value.getFullYear(), month: value.getMonth() + 1 };
  }
  if (typeof value !== "string") return null;
  const s = value.replace(/\s+/g, " ").trim();
  if (s === "") return null;

  // ISO / date-like: 2026-06-01.
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) return { year: Number(iso[1]), month };
    return null;
  }
  // MM/YYYY: 01/2026 (also matches "From 01/2026 to ..." — first month wins
  // here; ranges are split by splitScheduleRange before delivery resolution).
  const numeric = s.match(/\b(\d{1,2})\/(\d{4})\b/);
  if (numeric) {
    const month = Number(numeric[1]);
    if (month >= 1 && month <= 12) return { year: Number(numeric[2]), month };
    return null;
  }
  // "July 2026", "Feb. 2026", "April-2026".
  const mw = monthWord(s);
  if (mw !== null) {
    const y = yearNear(s, anchorYear ?? -1);
    if (y !== null) return { year: y, month: mw };
    return null;
  }
  return null;
}

/**
 * Split "From 01/2026 to 06/2026"-style ranges into endpoints.
 * Returns [start, end]; non-ranges return [single, single].
 */
export function splitScheduleRange(value: unknown, anchorYear: number | null): (YearMonth | null)[] {
  if (typeof value === "string") {
    const m = value.match(
      /from\s+(\d{1,2}\/\d{4}|[A-Za-z]+\.?\s+\d{4})\s+to\s+(\d{1,2}\/\d{4}|[A-Za-z]+\.?\s+\d{4})/i
    );
    if (m) {
      return [parseScheduleMonth(m[1], anchorYear), parseScheduleMonth(m[2], anchorYear)];
    }
  }
  const single = parseScheduleMonth(value, anchorYear);
  return [single, single];
}

export function quarterOf(ym: YearMonth): Quarter {
  return Math.min(4, Math.max(1, Math.ceil(ym.month / 3))) as Quarter;
}

export function quarterLabel(year: number, quarter: Quarter): string {
  return `${year} Q${quarter}`;
}
