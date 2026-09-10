/**
 * Server-safe date formatting helpers (no "use client").
 * Keep pure functions here so both Server and Client Components can call them.
 * Client components may re-export from here for backwards compatibility.
 */
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}
