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
import { getAdminLogModules, getLogsPage } from "./actions";
import { TablePager } from "@/components/personnel/TablePager";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildQueryKey } from "@/lib/query-keys";
import { PAGE_SIZE } from "@/lib/constants";
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
  // Server-paged audit window (PAGE_SIZE = 15): the DB returns only the
  // window + exact total per filter set (30s TTL; audit writes are too
  // frequent to bust per mutation).
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { data: paged, loading, isValidating } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'logs', page, filters: { q: debouncedQuery, module: moduleFilter } }),
    () => getLogsPage({ page, q: debouncedQuery, module: moduleFilter }),
    { staleTime: 30_000 }
  );
  const rows = useMemo(() => paged?.rows ?? [], [paged]);
  const total = paged?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const { data: modulesData } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'logs-modules' }),
    getAdminLogModules,
    { staleTime: 300_000 }
  );
  const modules = useMemo(
    () => ["all", ...((modulesData ?? []).filter(Boolean))],
    [modulesData]
  );
  const visible = rows;

  if (loading && rows.length === 0) {
    return <LogsLoading />;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Logs</p>
      <div>
        <h1 className={styles.title}>System Logs</h1>
        <p className={styles.subtitle}>
          {total} {total === 1 ? "entry" : "entries"} across all users — newest
          first.{isValidating ? " Updating…" : ""}
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
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className={styles.empty}>
                    No log entries match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > 0 ? (
          <TablePager
            id="admin-logs"
            total={total}
            pageSize={PAGE_SIZE}
            page={safePage}
            onPageChange={setPage}
          />
        ) : null}
      </Card>
    </section>
  );
}
