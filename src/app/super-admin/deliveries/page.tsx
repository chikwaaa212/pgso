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
import { browseDeliveriesPage, type BrowseDeliveryRow } from "../browse/actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildQueryKey } from "@/lib/query-keys";
import { PAGE_SIZE } from "@/lib/constants";
import DeliveriesLoading from "./loading";
import { DeliveryDetailModal, InspectionDetailModal } from "./record-modals";
import styles from "./page.module.css";
import browseStyles from "../users/page.module.css";
import actionStyles from "@/app/personnel/dashboard/page.module.css";

export default function SuperAdminDeliveriesPage() {
  // Server-paged window (PAGE_SIZE = 15): the DB returns only the window +
  // exact total per filter set (30s, busted by delivery/inspection writes).
  // Back-navigation paints instantly from the client cache; stale windows
  // revalidate silently with rows kept visible (no flicker).
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const { data: paged, loading, isValidating } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'deliveries', page, filters: { q: debouncedQuery } }),
    () => browseDeliveriesPage({ page, q: debouncedQuery }),
    { staleTime: 30_000 }
  );
  const rows = useMemo(() => paged?.rows ?? [], [paged]);
  const total = paged?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const [detailRow, setDetailRow] = useState<BrowseDeliveryRow | null>(null);
  const [inspectionRow, setInspectionRow] = useState<BrowseDeliveryRow | null>(null);

  // Row actions open read-only modals (no page navigation). Same buttons,
  // same positions — only the interaction changed.
  const columns: BrowseColumn<BrowseDeliveryRow>[] = useMemo(
    () => [
      { key: "ref", label: "Ref", value: (r) => r.ref, text: (r) => `${r.ref} ${r.po_reference ?? ""}` },
      { key: "supplier", label: "Supplier", value: (r) => r.supplier ?? "—", text: (r) => r.supplier ?? "" },
      { key: "po", label: "PO ref", value: (r) => r.po_reference ?? "—", text: (r) => r.po_reference ?? "" },
      { key: "date", label: "Date", value: (r) => fmtDate(r.date_delivered), text: (r) => r.date_delivered ?? "" },
      { key: "logged_by", label: "Logged By", value: (r) => r.logged_by ?? "—", text: (r) => r.logged_by ?? "" },
      { key: "status", label: "Status", value: (r) => <StatusPill value={r.delivery_status} />, text: (r) => r.delivery_status ?? "" },
      { key: "inspection", label: "Inspection", value: (r) => <StatusPill value={r.inspection_status} />, text: (r) => r.inspection_status ?? "" },
      { key: "items", label: "Items", value: (r) => r.item_count, text: () => "" },
      {
        key: "action",
        label: "Action",
        value: (r) => (
          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <button
              type="button"
              className={actionStyles.inspectLinkSecondary}
              aria-label={`View details for delivery ${r.ref}`}
              onClick={() => setDetailRow(r)}
            >
              View Details
            </button>
            <button
              type="button"
              className={actionStyles.inspectLink}
              aria-label={`View inspection record for delivery ${r.ref}`}
              onClick={() => setInspectionRow(r)}
            >
              View Inspection
            </button>
          </div>
        ),
        text: () => "",
      },
    ],
    []
  );

  if (loading && rows.length === 0) {
    return <DeliveriesLoading />;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Deliveries</p>
      <div>
        <h1 className={styles.title}>Deliveries</h1>
        <p className={styles.subtitle}>
          {`${total} ${total === 1 ? "delivery" : "deliveries"} logged by all personnel`} · read-only
          {isValidating ? " · updating…" : ""}
        </p>
      </div>
      <Card className={styles.panel}>
        <div className={browseStyles.searchRow}>
          <Input
            type="search"
            aria-label="Search deliveries"
            placeholder="Search supplier, PO, ref, logger…"
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
                <tr key={r.id}>
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
            id="admin-deliveries"
            total={total}
            pageSize={PAGE_SIZE}
            page={safePage}
            onPageChange={setPage}
          />
        ) : null}
      </Card>
      <DeliveryDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
      <InspectionDetailModal row={inspectionRow} onClose={() => setInspectionRow(null)} />
    </section>
  );
}
