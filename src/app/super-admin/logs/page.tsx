import { Card } from "@/components/ui/card";
import { label } from "@/lib/labels";
import { getAllLogs, getLogModules } from "./actions";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

export default async function SuperAdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string; q?: string }>;
}) {
  const params = await searchParams;
  const activeModule = params.module ?? "all";
  const q = params.q ?? "";
  const [modules, rows] = await Promise.all([
    getLogModules(),
    getAllLogs({ module: activeModule, q }),
  ]);

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Logs</p>
      <div>
        <h1 className={styles.title}>System Logs</h1>
        <p className={styles.subtitle}>
          {rows.length} {rows.length === 1 ? "entry" : "entries"} across all
          users — newest first.
        </p>
      </div>

      <Card className={styles.panel}>
        <form
          method="get"
          style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}
        >
          <select
            name="module"
            defaultValue={activeModule}
            aria-label="Filter by module"
            style={{
              borderRadius: "0.375rem",
              border: "1px solid var(--color-navy-300)",
              padding: "0.5rem 0.75rem",
              fontSize: "0.8125rem",
            }}
          >
            <option value="all">All modules</option>
            {modules.map((m) => (
              <option key={m} value={m}>
                {label(m)}
              </option>
            ))}
          </select>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search action or module…"
            aria-label="Search logs"
            style={{
              borderRadius: "0.375rem",
              border: "1px solid var(--color-navy-300)",
              padding: "0.5rem 0.75rem",
              fontSize: "0.8125rem",
              minWidth: "12rem",
            }}
          />
          <button
            type="submit"
            style={{
              borderRadius: "0.375rem",
              border: "1px solid var(--color-navy-600)",
              background: "var(--color-navy-900)",
              color: "#fff",
              padding: "0.5rem 1rem",
              fontSize: "0.8125rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Filter
          </button>
        </form>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Module</th>
                <th>Action</th>
                <th>Purpose / summary</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.created_at)}</td>
                  <td>{r.user_name}</td>
                  <td>{label(r.module)}</td>
                  <td>{label(r.action)}</td>
                  <td style={{ whiteSpace: "normal", minWidth: "16rem" }}>
                    {r.purpose ? <div>{r.purpose}</div> : null}
                    {r.summary ? (
                      <div style={{ color: "var(--color-navy-600)" }}>{r.summary}</div>
                    ) : null}
                    {!r.purpose && !r.summary ? "—" : null}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    No log entries match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
