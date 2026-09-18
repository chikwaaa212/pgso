"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BrowseTable,
  StatusPill,
  fmtDate,
  type BrowseColumn,
} from "@/components/super-admin/BrowseTable";
import { browseRepair, browseRepairs } from "../browse/actions";
import type { RepairRow } from "@/app/personnel/repairs/actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useReceipt } from "@/hooks/use-receipt";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import { ReceiptLoading } from "@/components/personnel/ReceiptLoading";
import { ReceiptOverlay } from "@/app/personnel/documents/receipt-overlay";
import { RepairReceipt } from "@/app/personnel/repairs/repair-receipt";
import receipt from "@/app/personnel/inspections/components/receipt.module.css";
import RepairsLoading from "./loading";
import actionStyles from "@/app/personnel/dashboard/page.module.css";
import styles from "./page.module.css";

function fmtCost(v: number | null) {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(v);
}

export default function SuperAdminRepairsPage() {
  // Same client caching as the personnel repairs page: back-navigation
  // paints instantly from memory / sessionStorage and only revalidates
  // silently when stale (30s, matching the server list cache).
  const { data, loading } = useCachedAction(
    CLIENT_CACHE_KEYS.adminRepairs,
    browseRepairs,
    { staleTime: 30_000 }
  );
  const rows = useMemo(() => data ?? [], [data]);
  // Overlay receipt viewer with per-record client caching (same shared
  // scheme as personnel — admin-prefixed keys keep per-role caches
  // separate): viewing a receipt opens a modal, not a new page.
  const viewer = useReceipt<RepairRow | null>();
  const openReceipt = (id: string) =>
    viewer.open(id, `admin-repair:${id}`, () => browseRepair(id));

  if (loading) {
    return <RepairsLoading />;
  }

  const columns: BrowseColumn<RepairRow>[] = [
    {
      key: "asset",
      label: "Asset / issue",
      value: (r) => (
        <span
          style={{
            display: "inline-block",
            minWidth: "14rem",
            maxWidth: "26rem",
            whiteSpace: "normal",
          }}
        >
          {r.asset_label ?? r.description.slice(0, 60)}
        </span>
      ),
      text: (r) => `${r.asset_label ?? ""} ${r.description}`,
    },
    { key: "reporter", label: "Reported by", value: (r) => r.reporter_name, text: (r) => r.reporter_name },
    { key: "tech", label: "Technician", value: (r) => r.technician ?? "—", text: (r) => r.technician ?? "" },
    { key: "date", label: "Date", value: (r) => fmtDate(r.repair_date), text: (r) => r.repair_date },
    { key: "cost", label: "Cost", value: (r) => fmtCost(r.cost), text: () => "" },
    { key: "status", label: "Status", value: (r) => <StatusPill value={r.status} />, text: (r) => r.status ?? "" },
    {
      key: "view",
      label: "Receipt",
      // Same as personnel: receipts exist for completed repairs only.
      value: (r) =>
        (r.status ?? "pending") === "completed" ? (
          <button
            type="button"
            className={`${actionStyles.inspectLinkSecondary} cursor-pointer`}
            aria-label={`View receipt for repair ${r.id.slice(0, 8).toUpperCase()}`}
            onClick={() => openReceipt(r.id)}
          >
            View Details
          </button>
        ) : (
          <span className="text-sm text-zinc-400">—</span>
        ),
      text: () => "",
    },
  ];

  const doc = viewer.doc ?? null;

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Repairs</p>
      <div>
        <h1 className={styles.title}>Repairs</h1>
        <p className={styles.subtitle}>
          {`${rows.length} repair ${rows.length === 1 ? "ticket" : "tickets"}`} · read-only
        </p>
      </div>
      <Card className={styles.panel}>
        <BrowseTable rows={rows} columns={columns} searchPlaceholder="Search asset, reporter, technician…" pageSizeKey="pgso:admin:repairs" />
      </Card>

      <ReceiptOverlay
        open={viewer.selectedId !== null}
        title="Repair receipt"
        onClose={viewer.close}
      >
        {viewer.docLoading ? (
          <ReceiptLoading label="Loading receipt…" />
        ) : !doc ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>
              This record is no longer available.
            </p>
          </div>
        ) : (
          <div
            className={receipt.receiptStack}
            style={{ maxWidth: "none" }}
          >
            <RepairReceipt repair={doc} />
            <p className={styles.panelSub} style={{ textAlign: "center" }}>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.print()}
                className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
              >
                Print / Save PDF
              </Button>
            </p>
          </div>
        )}
      </ReceiptOverlay>
    </section>
  );
}
