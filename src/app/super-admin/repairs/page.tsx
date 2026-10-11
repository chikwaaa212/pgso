"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TablePager } from "@/components/personnel/TablePager";
import {
  StatusPill,
  fmtDate,
  type BrowseColumn,
} from "@/components/super-admin/BrowseTable";
import { browseRepair } from "../browse/actions";
import { getRepairsPage, type RepairRow } from "@/app/personnel/repairs/actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildQueryKey } from "@/lib/query-keys";
import { useAdminRealtime } from "@/hooks/use-admin-realtime";
import { useReceipt } from "@/hooks/use-receipt";
import { PAGE_SIZE } from "@/lib/constants";
import { ReceiptLoading } from "@/components/personnel/ReceiptLoading";
import { ReceiptOverlay } from "@/app/personnel/documents/receipt-overlay";
import { RepairReceipt } from "@/app/personnel/repairs/repair-receipt";
import receipt from "@/app/personnel/inspections/components/receipt.module.css";
import RepairsLoading from "./loading";
import actionStyles from "@/app/personnel/dashboard/page.module.css";
import browseStyles from "../users/page.module.css";
import styles from "./page.module.css";

function fmtCost(v: number | null) {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(v);
}

export default function SuperAdminRepairsPage() {
  // Server-paged window (PAGE_SIZE = 15) via the shared repairs reader
  // (super_admin scope is global there): the DB returns only the window +
  // exact total per filter set (30s, busted by repair writes).
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const { data: paged, loading, refresh, isValidating } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'repairs', page, filters: { q: debouncedQuery } }),
    () => getRepairsPage({ page, pageSize: PAGE_SIZE, q: debouncedQuery }),
    { staleTime: 30_000 }
  );
  useAdminRealtime({
    channel: "admin-repairs",
    tables: [{ table: "repair" }],
    onEvent: refresh,
  });
  const rows = useMemo(() => paged?.rows ?? [], [paged]);
  const total = paged?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  // Overlay receipt viewer with per-record client caching (same shared
  // scheme as personnel — admin-prefixed keys keep per-role caches
  // separate): viewing a receipt opens a modal, not a new page.
  const viewer = useReceipt<RepairRow | null>();
  const openReceipt = (id: string) =>
    viewer.open(id, `admin-repair:${id}`, () => browseRepair(id));

  if (loading && rows.length === 0) {
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
          {`${total} repair ${total === 1 ? "ticket" : "tickets"}`} · read-only
          {isValidating ? " · updating…" : ""}
        </p>
      </div>
      <Card className={styles.panel}>
        <div className={browseStyles.searchRow}>
          <Input
            type="search"
            aria-label="Search repairs"
            placeholder="Search asset, reporter, technician…"
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
            id="admin-repairs"
            total={total}
            pageSize={PAGE_SIZE}
            page={safePage}
            onPageChange={setPage}
          />
        ) : null}
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
