"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TablePager } from "@/components/personnel/TablePager";
import { usePageSize } from "@/hooks/use-page-size";
import type { LogRow } from "./actions";
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

export function LogsTable({ rows }: { rows: LogRow[] }) {
  const [query, setQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [pageSize, setPageSize] = usePageSize("pgso:page-size:logs", 10);
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
      const haystack = [
        r.action,
        prettyAction(r.action),
        r.module,
        r.purpose ?? "",
        r.summary ?? "",
        r.reference_id ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query, moduleFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const visible = filtered.slice(
    (safePage - 1) * pageSize,
    (safePage - 1) * pageSize + pageSize
  );

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

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.panelSub}>
            {rows.length === 0
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
              {visible.map((r) => (
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

      {filtered.length > 0 ? (
        <TablePager
          id="logs"
          total={filtered.length}
          pageSize={pageSize}
          page={safePage}
          onPageSizeChange={setPageSize}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}
