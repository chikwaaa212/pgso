"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { TablePager } from "@/components/personnel/TablePager";
import { usePageSize } from "@/hooks/use-page-size";
import { label } from "@/lib/labels";
import { fmtDate } from "@/lib/format";
import styles from "../../app/super-admin/users/page.module.css";

export { fmtDate };

export interface BrowseColumn<T> {
  key: string;
  label: string;
  value: (row: T) => ReactNode;
  text: (row: T) => string;
}

/** Pill tone for common record statuses. Unknown values fall back to info. */
export function toneFor(status: string | null | undefined): "ok" | "warn" | "bad" | "info" {
  const s = (status ?? "").trim().toLowerCase();
  if (["completed", "passed", "available", "approved", "active", "healthy", "ok"].includes(s)) return "ok";
  if (["failed", "rejected", "retired", "inactive", "out of stock", "out", "critical"].includes(s)) return "bad";
  if (["pending", "partial", "low stock", "low", "in_progress", "in progress", "in use", "maintenance"].includes(s))
    return "warn";
  return "info";
}

export function StatusPill({ value }: { value: string | null | undefined }) {
  return (
    <span className={styles.status} data-tone={toneFor(value)}>
      {label(value)}
    </span>
  );
}

export function BrowseTable<T>({
  rows,
  columns,
  searchPlaceholder = "Search records…",
  pageSizeKey,
  getRowKey,
}: {
  rows: T[];
  columns: BrowseColumn<T>[];
  searchPlaceholder?: string;
  pageSizeKey: string;
  getRowKey?: (row: T) => string;
}) {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = usePageSize(pageSizeKey, 10);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => columns.some((c) => c.text(r).toLowerCase().includes(q)));
  }, [rows, columns, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, (safePage - 1) * pageSize + pageSize);

  return (
    <div>
      <div style={{ marginBottom: "0.75rem", maxWidth: "22rem" }}>
        <Input
          type="search"
          aria-label="Search records"
          placeholder={searchPlaceholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={getRowKey ? getRowKey(r) : `${i}`}>
                {columns.map((c) => (
                  <td key={c.key}>{c.value(r)}</td>
                ))}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className={styles.empty}>
                  No records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 0 ? (
        <TablePager
          id={pageSizeKey}
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

/** Read-only detail toolbar: back to the module list + print. No mutations. */
export function AdminToolbar({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
      <Link
        href={backHref}
        style={{
          fontSize: "0.8125rem",
          fontWeight: 600,
          border: "1px solid var(--color-navy-200)",
          borderRadius: "0.5rem",
          padding: "0.5rem 0.875rem",
          textDecoration: "none",
          color: "var(--color-navy-700)",
        }}
      >
        {backLabel}
      </Link>
      <button
        type="button"
        onClick={() => window.print()}
        style={{
          fontSize: "0.8125rem",
          fontWeight: 600,
          border: "1px solid var(--color-navy-200)",
          borderRadius: "0.5rem",
          padding: "0.5rem 0.875rem",
          background: "transparent",
          cursor: "pointer",
          color: "var(--color-navy-700)",
        }}
      >
        Print
      </button>
    </div>
  );
}
