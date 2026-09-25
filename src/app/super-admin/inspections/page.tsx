"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import {
  BrowseTable,
  StatusPill,
  fmtDate,
  type BrowseColumn,
} from "@/components/super-admin/BrowseTable";
import { browseInspections } from "../browse/actions";
import type { UnifiedInspectionRow } from "@/app/personnel/inspections/actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import InspectionsLoading from "./loading";
import {
  InspectionDetailModal,
  type ModalRecord,
} from "../deliveries/record-modals";
import actionStyles from "@/app/personnel/dashboard/page.module.css";
import styles from "./page.module.css";

function resultLabel(d: UnifiedInspectionRow) {
  if (d.inspection_status === "pending") return "Pending";
  return d.result ? d.result.charAt(0).toUpperCase() + d.result.slice(1) : "—";
}

export default function SuperAdminInspectionsPage() {
  // Same client caching as the personnel inspections page: back-navigation
  // paints instantly from memory / sessionStorage and only revalidates
  // silently when stale (30s, matching the server list cache).
  const { data, loading, isValidating } = useCachedAction(
    CLIENT_CACHE_KEYS.adminInspections,
    browseInspections,
    { staleTime: 30_000 }
  );
  const rows = data ?? [];
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

  if (loading) {
    return <InspectionsLoading />;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Inspections</p>
      <div>
        <h1 className={styles.title}>Inspections</h1>
        <p className={styles.subtitle}>
          {`${rows.length} ${rows.length === 1 ? "record" : "records"} across all personnel`} · read-only
        </p>
      </div>
      <Card className={styles.panel}>
        <BrowseTable rows={rows} columns={columns} searchPlaceholder="Search supplier, PO, inspector, AIR…" pageSizeKey="pgso:admin:inspections" getRowKey={(r) => r.delivery_id} isValidating={isValidating} />
      </Card>
      <InspectionDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
    </section>
  );
}
