"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  BrowseTable,
  StatusPill,
  fmtDate,
  type BrowseColumn,
} from "@/components/super-admin/BrowseTable";
import { browseDeliveries, type BrowseDeliveryRow } from "../browse/actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import DeliveriesLoading from "./loading";
import { DeliveryDetailModal, InspectionDetailModal } from "./record-modals";
import styles from "./page.module.css";
import actionStyles from "@/app/personnel/dashboard/page.module.css";

export default function SuperAdminDeliveriesPage() {
  // Same client caching as the personnel deliveries page: back-navigation
  // paints instantly from memory / sessionStorage and only revalidates
  // silently when stale (30s, matching the server list cache).
  const { data, loading, isValidating } = useCachedAction(
    CLIENT_CACHE_KEYS.adminDeliveries,
    browseDeliveries,
    { staleTime: 30_000 }
  );
  const rows = data ?? [];
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

  if (loading) {
    return <DeliveriesLoading />;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Deliveries</p>
      <div>
        <h1 className={styles.title}>Deliveries</h1>
        <p className={styles.subtitle}>
          {`${rows.length} ${rows.length === 1 ? "delivery" : "deliveries"} logged by all personnel`} · read-only
        </p>
      </div>
      <Card className={styles.panel}>
        <BrowseTable rows={rows} columns={columns} searchPlaceholder="Search supplier, PO, ref, logger…" pageSizeKey="pgso:admin:deliveries" getRowKey={(r) => r.id} isValidating={isValidating} />
      </Card>
      <DeliveryDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
      <InspectionDetailModal row={inspectionRow} onClose={() => setInspectionRow(null)} />
    </section>
  );
}
