"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TablePager } from "@/components/personnel/TablePager";
import {
  StatusPill,
  fmtDate,
  type BrowseColumn,
} from "@/components/super-admin/BrowseTable";
import { browseInspectionsPage } from "../browse/actions";
import type { UnifiedInspectionRow } from "@/app/personnel/inspections/actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildQueryKey } from "@/lib/query-keys";
import { PAGE_SIZE } from "@/lib/constants";
import InspectionsLoading from "./loading";
import {
  InspectionDetailModal,
  type ModalRecord,
} from "../deliveries/record-modals";
import actionStyles from "@/app/personnel/dashboard/page.module.css";
import browseStyles from "../users/page.module.css";
import styles from "./page.module.css";

function resultLabel(d: UnifiedInspectionRow) {
  if (d.inspection_status === "pending") return "Pending";
  return d.result ? d.result.charAt(0).toUpperCase() + d.result.slice(1) : "—";
}

export default function SuperAdminInspectionsPage() {
  // Server-paged window (PAGE_SIZE = 15): the DB returns only the window +
  // exact total per filter set (30s, busted by inspection writes).
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const { data: paged, loading, isValidating } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'inspections', page, filters: { q: debouncedQuery } }),
    () => browseInspectionsPage({ page, q: debouncedQuery }),
    { staleTime: 30_000 }
  );
  const rows = useMemo(() => paged?.rows ?? [], [paged]);
  const total = paged?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const [detailRow, setDetailRow] = useState<ModalRecord | null>(null);

  // Row action opens the read-only inspection modal (no page navigation).
  // Same button, same position — only the interaction changed.
  const columns: BrowseColumn<UnifiedInspectionRow>[] = useMemo(
    () => [
      { key: "ref", label: "Ref", value: (r) => r.delivery_ref, text: (r) => `${r.delivery_ref} ${r.po_reference ?? ""}` },
      { key: "supplier", label: "Supplier", value: (r) => r.supplier ?? "—", text: (r) => r.supplier ?? "" },
      { key: "date", label: "Delivered", value: (r) => fmtDate(r.date_delivered), text: (r) => r.date_delivered ?? "" },
      { key: "inspector", label: "Inspector", value: (r) => r.inspector_name ?? "—", text: (r) => r.inspector_name ?? "" },
      { key: "logged_by", label: "Logged By", value: (r) => r.logged_by ?? r.inspector_name ?? "—", text: (r) => r.logged_by ?? r.inspector_name ?? "" },
      { key: "result", label: "Result", value: (r) => <StatusPill value={resultLabel(r)} />, text: (r) => resultLabel(r) },
      { key: "air", label: "AIR", value: (r) => r.iar_no ?? "—", text: (r) => r.iar_no ?? "" },
      {
        key: "view",
        label: "Detail",
        value: (r) => (
          <button
            type="button"
            className={actionStyles.inspectLinkSecondary}
            aria-label={`View details for inspection ${r.delivery_ref}`}
            onClick={() => setDetailRow({ id: r.delivery_id, ref: r.delivery_ref })}
          >
            View Details
          </button>
        ),
        text: () => "",
      },
    ],
    []
  );

  if (loading && rows.length === 0) {
    return <InspectionsLoading />;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Inspections</p>
      <div>
        <h1 className={styles.title}>Inspections</h1>
        <p className={styles.subtitle}>
          {`${total} ${total === 1 ? "record" : "records"} across all personnel`} · read-only
          {isValidating ? " · updating…" : ""}
        </p>
      </div>
      <Card className={styles.panel}>
        <div className={browseStyles.searchRow}>
          <Input
            type="search"
            aria-label="Search inspections"
            placeholder="Search supplier, PO, inspector, AIR…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          {isValidating ? (
            <span role="status" aria-live="polite" style={{ fontSize: "0.75rem", color: "var(--color-navy-500)", whiteSpace: "nowrap" }}>
              Updating…
            </span>
          ) : null}
        </div>
        <div className={browseStyles.tableWrap}>
          <table className={browseStyles.table}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.delivery_id}>
                  {columns.map((c) => (
                    <td key={c.key}>{c.value(r)}</td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className={browseStyles.empty}>
                    No records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > 0 ? (
          <TablePager
            id="admin-inspections"
            total={total}
            pageSize={PAGE_SIZE}
            page={safePage}
            onPageChange={setPage}
          />
        ) : null}
      </Card>
      <InspectionDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
    </section>
  );
}
