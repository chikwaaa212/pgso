"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TablePager } from "@/components/personnel/TablePager";
import { ActionButton } from "@/components/ui/action-button";
import {
  StatusPill,
  type BrowseColumn,
} from "@/components/super-admin/BrowseTable";
import { getInventoryPage, getInventoryStats } from "@/app/personnel/inventory/actions";
import { setReorderThreshold } from "./actions";
import type { InventoryRow } from "@/app/personnel/inventory/actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildQueryKey, resourcePrefix } from "@/lib/query-keys";
import { patchClientCache } from "@/lib/client-cache";
import { patchRowInPage } from "@/lib/list-patch";
import { PAGE_SIZE } from "@/lib/constants";
import InventoryLoading from "./loading";
import browseStyles from "../users/page.module.css";
import styles from "./page.module.css";

function fmtCost(v: number | null) {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(v);
}

type Level = "ok" | "low" | "critical" | "out" | "none";

function levelOf(r: InventoryRow): Level {
  if (r.quantity <= 0) return "out";
  if (r.reorder_threshold == null) return "none";
  if (r.quantity <= Math.floor(r.reorder_threshold / 2)) return "critical";
  if (r.quantity <= r.reorder_threshold) return "low";
  return "ok";
}

function levelValue(level: Level): string {
  if (level === "out") return "Out of stock";
  if (level === "critical") return "Critical";
  if (level === "low") return "Low stock";
  if (level === "ok") return "OK";
  return "No threshold";
}

function recommendationTone(level: Level): "ok" | "warn" | "bad" | "info" {
  if (level === "out" || level === "critical") return "bad";
  if (level === "low") return "warn";
  if (level === "ok") return "ok";
  return "info";
}

function recommendationFor(r: InventoryRow): { short: string; title: string; detail: string } {
  const level = levelOf(r);
  const onHand = `${r.quantity}${r.unit ? ` ${r.unit}` : ""}`;
  const threshold = r.reorder_threshold;
  if (level === "out") {
    return {
      short: "Replenish now",
      title: `${r.item_name} is out of stock`,
      detail: `No units on hand. File a supply request immediately and replenish before operations are blocked.`,
    };
  }
  if (level === "critical") {
    return {
      short: "Restock soon",
      title: `${r.item_name} is critically low`,
      detail: `Only ${onHand} left (threshold ${threshold}). Replenish this week and tell personnel to prioritize a supply request.`,
    };
  }
  if (level === "low") {
    return {
      short: "Plan reorder",
      title: `${r.item_name} is below threshold`,
      detail: `Down to ${onHand} (threshold ${threshold}). Plan a reorder soon so it doesn't turn critical.`,
    };
  }
  if (level === "none") {
    return {
      short: "Set threshold",
      title: `${r.item_name} has no threshold`,
      detail: `Set a reorder threshold for this item so the system can alert personnel before it runs out.`,
    };
  }
  return {
    short: "No action",
    title: `${r.item_name} is healthy`,
    detail: `${onHand} on hand (threshold ${threshold}). No action needed.`,
  };
}

function ThresholdCell({
  row,
  onOptimistic,
  onRevert,
}: {
  row: InventoryRow;
  /** Paint the save instantly (parent patches caches, no refetch). */
  onOptimistic: (id: string, threshold: number | null) => void;
  /** Roll back to the previous value on failure. */
  onRevert: (id: string, prev: number | null) => void;
}) {
  const initial = row.reorder_threshold != null ? String(row.reorder_threshold) : "";
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty = val.trim() !== initial.trim();

  async function save() {
    setError("");
    const trimmed = val.trim();
    let threshold: number | null = null;
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0) {
        setError("Whole number ≥ 0, or empty to clear.");
        return;
      }
      threshold = n;
    }
    const prev = row.reorder_threshold ?? null;
    if (threshold === prev) return;
    // Optimistic: the row (level pill, alerts, recommendations) updates
    // instantly via the parent cache patch; the cell remounts on the new
    // key with the saved value shown.
    onOptimistic(row.id, threshold);
    setSaving(true);
    try {
      const res = await setReorderThreshold(row.id, threshold);
      if (!res.success) {
        onRevert(row.id, prev);
        setError(res.error ?? "Failed to save threshold.");
        toast.error("Save failed", { description: res.error ?? "Failed to save threshold.", duration: 2000, closeButton: true });
        return;
      }
      // Reconcile with the server record (authoritative echo, no refetch).
      onOptimistic(row.id, res.record?.reorder_threshold ?? threshold);
      toast.success("Threshold saved", { description: `${row.item_name} threshold updated.`, duration: 2000, closeButton: true });
    } catch {
      onRevert(row.id, prev);
      setError("Failed to save threshold. Please try again.");
      toast.error("Save failed", { description: "Failed to save threshold. Please try again.", duration: 2000, closeButton: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
      <input
        type="number"
        min={0}
        step={1}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="—"
        aria-label={`Reorder threshold for ${row.item_name}`}
        style={{
          width: "5.5rem",
          border: "1px solid var(--color-navy-200)",
          borderRadius: "0.5rem",
          padding: "0.375rem 0.5rem",
          fontSize: "0.8125rem",
        }}
      />
      <ActionButton
        type="button"
        onClick={save}
        loadingLabel="Saving…"
        disabled={!dirty || saving}
        aria-label={`Save threshold for ${row.item_name}`}
        style={{
          fontSize: "0.75rem",
          fontWeight: 700,
          border: "1px solid var(--color-navy-700)",
          borderRadius: "9999px",
          padding: "0.375rem 0.75rem",
          backgroundColor: !dirty || saving ? "var(--color-navy-100)" : "var(--color-navy-800)",
          color: !dirty || saving ? "var(--color-navy-400)" : "#fff",
          cursor: !dirty || saving ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        Set
      </ActionButton>
      {error ? (
        <span style={{ fontSize: "0.6875rem", color: "#991b1b" }}>{error}</span>
      ) : null}
    </div>
  );
}

export default function SuperAdminInventoryPage() {
  // Server-paged window (PAGE_SIZE = 15) via the shared inventory reader:
  // the DB returns only the window + exact total per filter set (60s,
  // busted by stock/threshold writes). Header alerts read the global stats
  // snapshot (not the window) so counts stay exact while paging.
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const {
    data: paged,
    loading,
    isValidating,
    mutate: mutateRows,
  } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'inventory', page, filters: { q: debouncedQuery } }),
    () => getInventoryPage({ page, pageSize: PAGE_SIZE, q: debouncedQuery }),
    { staleTime: 60_000 }
  );
  const rows = useMemo(() => paged?.rows ?? [], [paged]);
  const total = paged?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const { data: statsData } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'inventory-stats' }),
    getInventoryStats,
    { staleTime: 60_000 }
  );
  const stats = useMemo(
    () => ({ skus: 0, units: 0, low: 0, critical: 0, out: 0, none: 0, ...statsData }),
    [statsData]
  );

  // Optimistic threshold saves (no refetch): patch this list + the
  // personnel inventory windows (same row shape); roll back on failure.
  // The cell remounts on the new `key` showing the saved value instantly.
  const patchThreshold = useCallback(
    (id: string, threshold: number | null) => {
      const patch = { reorder_threshold: threshold };
      mutateRows((prev) => (prev ? patchRowInPage(prev, id, patch) : prev));
      patchClientCache(
        ["pgso:client:inventory-items", resourcePrefix("personnel", "inventory"), resourcePrefix("personnel", "inventory-stats")],
        (d) => patchRowInPage(d, id, patch)
      );
    },
    [mutateRows]
  );

  // Dismissal is keyed to the alert count — closing hides this exact alert,
  // but a changed count (e.g. after saving a threshold) toasts again.
  const [dismissedFor, setDismissedFor] = useState<number | null>(null);

  const attention = stats.out + stats.critical + stats.low;
  const showAlert = attention > 0 && dismissedFor !== attention;

  // Per-row recommendation toast — stored as an id so it always reflects
  // the freshest row data after threshold saves.
  const [recId, setRecId] = useState<string | null>(null);
  const recRow = recId ? (rows.find((r) => r.id === recId) ?? null) : null;

  const columns: BrowseColumn<InventoryRow>[] = useMemo(
    () => [
      { key: "item", label: "Item", value: (r) => r.item_name, text: (r) => r.item_name },
      { key: "code", label: "Code", value: (r) => r.account_code ?? "—", text: (r) => r.account_code ?? "" },
      {
        key: "qty",
        label: "On hand",
        value: (r) => `${r.quantity}${r.unit ? ` ${r.unit}` : ""}`,
        text: (r) => `${r.quantity} ${r.unit ?? ""}`,
      },
      { key: "cost", label: "Unit cost", value: (r) => fmtCost(r.unit_cost), text: () => "" },
      {
        key: "status",
        label: "Status",
        value: (r) => <StatusPill value={levelValue(levelOf(r))} />,
        text: (r) => levelValue(levelOf(r)),
      },
      {
        key: "threshold",
        label: "Threshold",
        // Keyed by record + threshold so the cell resets whenever fresh
        // data arrives (replaces the old sync-on-prop-change effect).
        value: (r) => (
          <ThresholdCell
            key={`${r.id}:${r.reorder_threshold ?? ""}`}
            row={r}
            onOptimistic={(id, threshold) => patchThreshold(id, threshold)}
            onRevert={(id, prev) => patchThreshold(id, prev)}
          />
        ),
        text: (r) => (r.reorder_threshold != null ? String(r.reorder_threshold) : ""),
      },
      { key: "location", label: "Location", value: (r) => r.location ?? "—", text: (r) => r.location ?? "" },
      {
        key: "recommendation",
        label: "Recommendation",
        value: (r) => (
          <button
            type="button"
            className={styles.recBtn}
            data-tone={recommendationTone(levelOf(r))}
            aria-label={`View recommendation for ${r.item_name}`}
            onClick={() => setRecId(r.id)}
          >
            {recommendationFor(r).short}
          </button>
        ),
        text: (r) => recommendationFor(r).short,
      },
    ],
    [patchThreshold]
  );

  if (loading && rows.length === 0) {
    return <InventoryLoading />;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Stocks</p>
      <div>
        <h1 className={styles.title}>Stocks</h1>
        <p className={styles.subtitle}>
          {`${total} stock ${total === 1 ? "line" : "lines"}`} · thresholds are set by Super Admin
          {isValidating ? " · updating…" : ""}
        </p>
      </div>

      {recRow ? (
        <div role="alert" className={styles.toast}>
          <div className={styles.toastBody}>
            <p className={styles.toastTitle}>{recommendationFor(recRow).title}</p>
            <p>
              {recommendationFor(recRow).detail}{" "}
              {levelOf(recRow) !== "ok" && levelOf(recRow) !== "none" ? (
                <>
                  Review incoming requests under{" "}
                  <Link href="/super-admin/transactions" className="font-semibold underline">
                    Transactions
                  </Link>
                  .
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            className={styles.toastClose}
            aria-label="Dismiss recommendation"
            onClick={() => setRecId(null)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : showAlert ? (
        <div role="alert" className={styles.toast}>
          <div className={styles.toastBody}>
            <p className={styles.toastTitle}>
              Stock alert: {attention} item{attention !== 1 ? "s" : ""}{" "}
              at or below threshold
              {stats.out > 0 ? ` — ${stats.out} out of stock` : ""}
              {stats.critical > 0 ? `, ${stats.critical} critical` : ""}
              {stats.low > 0 ? `, ${stats.low} low` : ""}.
            </p>
            <p>
              Recommendation: tell personnel to file supply requests for these items
              and replenish before they run out. Review incoming requests under{" "}
              <Link href="/super-admin/transactions" className="font-semibold underline">
                Transactions
              </Link>
              .
            </p>
          </div>
          <button
            type="button"
            className={styles.toastClose}
            aria-label="Dismiss stock alert"
            onClick={() => setDismissedFor(attention)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {attention === 0 && stats.none > 0 ? (
        <p className={styles.panelSub} role="status">
          All stocked items are above threshold. {stats.none} item{stats.none !== 1 ? "s have" : " has"} no
          threshold yet — set one below so the system can alert personnel.
        </p>
      ) : null}

      <Card className={styles.panel}>
        <div className={browseStyles.searchRow}>
          <Input
            type="search"
            aria-label="Search stocks"
            placeholder="Search item, code, location…"
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
            id="admin-inventory"
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
