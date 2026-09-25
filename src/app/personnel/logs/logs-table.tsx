"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TablePager, FIXED_PAGE_SIZE } from "@/components/personnel/TablePager";
import {
  DataTableSkeleton,
  PagerSkeleton,
} from "@/components/personnel/skeletons";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import { getLogModules, getMyLogsPage } from "./actions";
import styles from "../dashboard/page.module.css";
import air from "../inspections/air-section.module.css";

function fmtTimestamp(iso: string | null) {
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

function prettyAction(action: string) {
  return action.replace(/[:_]+/g, " ").replace(/\s+/g, " ").trim();
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function LogsTable({ onTotalChange }: { onTotalChange?: (total: number) => void }) {
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  // Fixed 20 rows/page (no selector) — the DB returns only this window.
  const pageSize = FIXED_PAGE_SIZE;
  const [page, setPage] = useState(1);
  // Debounced server search — the DB query fires only after typing pauses.
  const debouncedQuery = useDebouncedValue(query, 250);
  const searching = query.trim() !== debouncedQuery.trim();

  const { data, loading, isValidating } = useCachedAction(
    `${CLIENT_CACHE_KEYS.logs}:${page}:${debouncedQuery}:${moduleFilter}`,
    () =>
      getMyLogsPage({
        page,
        pageSize,
        q: debouncedQuery,
        module: moduleFilter,
      }),
    { staleTime: 30_000 }
  );
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const total = data?.total ?? 0;

  const { data: modulesData } = useCachedAction(
    `${CLIENT_CACHE_KEYS.logs}-modules`,
    getLogModules,
    { staleTime: 300_000 }
  );
  const modules = useMemo(
    () => ["all", ...((modulesData ?? []) as string[])],
    [modulesData]
  );

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);

  useEffect(() => {
    onTotalChange?.(total);
  }, [total, onTotalChange]);

  if (loading && rows.length === 0) {
    return (
      <div aria-busy="true" aria-label="Loading logs">
        <div className={air.controls} aria-hidden="true">
          <div className={`${air.search} h-9 animate-pulse rounded-md bg-navy-100`} />
          <div className="h-9 w-44 animate-pulse rounded-md bg-navy-100" />
        </div>
        <DataTableSkeleton
          headers={["Action", "Module", "Purpose", "Details", "Timestamp"]}
          cols={5}
          rows={10}
          label="Loading logs"
        />
        <PagerSkeleton />
      </div>
    );
  }

  return (
    <div>
      <div className={air.controls}>
        <Input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search action, purpose, module…"
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
                {m === "all" ? "Module: All" : cap(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {(isValidating || searching) ? (
        <p className={styles.panelSub} role="status">Updating…</p>
      ) : null}

      {rows.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.panelSub}>
            {total === 0
              ? "No activity logged under your account yet — actions you take (deliveries, inspections, requests, repairs, issuances, inventory) will appear here."
              : "No logs match your search or filter."}
          </p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Action</th>
                <th>Module</th>
                <th>Purpose</th>
                <th>Details</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className={styles.status} data-tone="info">
                      {cap(prettyAction(r.action))}
                    </span>
                  </td>
                  <td>{cap(r.module)}</td>
                  <td className="whitespace-pre-wrap">{r.purpose ?? "—"}</td>
                  <td className="whitespace-pre-wrap">
                    {r.summary ?? "—"}
                    {r.reference_id ? (
                      <span className={styles.pagerInfo}>
                        {" "}
                        · Ref {r.reference_id.slice(0, 8).toUpperCase()}
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap">
                    {fmtTimestamp(r.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 ? (
        <TablePager
          id="logs"
          total={total}
          page={safePage}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
