"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { label } from "@/lib/labels";
import { getAllLogs } from "./actions";
import { TablePager } from "@/components/personnel/TablePager";
import { usePageSize } from "@/hooks/use-page-size";
import { useCachedAction } from "@/hooks/use-cached-action";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import LogsLoading from "./loading";
import styles from "./page.module.css";
import air from "@/app/personnel/inspections/air-section.module.css";

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

export default function SuperAdminLogsPage() {
  // Same client caching as the personnel logs page: back-navigation
  // paints instantly from memory / sessionStorage and only revalidates
  // silently when stale (30s, matching the server list cache).
  const { data, loading } = useCachedAction(
    CLIENT_CACHE_KEYS.adminLogs,
    getAllLogs,
    { staleTime: 30_000 }
  );
  const rows = useMemo(() => data ?? [], [data]);
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [pageSize, setPageSize] = usePageSize("pgso:admin:logs", 10);
  const [page, setPage] = useState(1);

  const modules = useMemo(() => {
    const set = new Set(rows.map((r) => r.module).filter(Boolean));
    return ["all", ...[...set].sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (moduleFilter !== "all" && r.module !== moduleFilter) return false;
      if (!q) return true;
      return [r.action, r.module, r.user_name, r.purpose ?? "", r.summary ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, query, moduleFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const visible = filtered.slice(
    (safePage - 1) * pageSize,
    (safePage - 1) * pageSize + pageSize
  );

  if (loading) {
    return <LogsLoading />;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Logs</p>
      <div>
        <h1 className={styles.title}>System Logs</h1>
        <p className={styles.subtitle}>
          {filtered.length} of {rows.length}{" "}
          {rows.length === 1 ? "entry" : "entries"} across all users — newest
          first.
        </p>
      </div>

      <Card className={styles.panel}>
        <div className={air.controls}>
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search action, user, module…"
            className={air.search}
            aria-label="Search logs"
          />
          <Select
            value={moduleFilter}
            onValueChange={(v) => {
              setModuleFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44" aria-label="Filter by module">
              <SelectValue placeholder="Module: All" />
            </SelectTrigger>
            <SelectContent>
              {modules.map((m) => (
                <SelectItem key={m} value={m}>
                  {m === "all" ? "Module: All" : label(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
              {visible.map((r) => (
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    No log entries match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 ? (
          <TablePager
            id="admin-logs"
            total={filtered.length}
            pageSize={pageSize}
            page={safePage}
            onPageSizeChange={setPageSize}
            onPageChange={setPage}
          />
        ) : null}
      </Card>
    </section>
  );
}
