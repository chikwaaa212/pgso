"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Boxes,
  ChevronRight,
  CircleSlash,
  Layers3,
  PackageSearch,
  SlidersHorizontal,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TablePager } from "@/components/personnel/TablePager";
import { ActionButton } from "@/components/ui/action-button";
import { getInventoryPage, getInventoryStats } from "@/app/personnel/stocks/actions";
import { setReorderThreshold } from "./actions";
import type { InventoryRow } from "@/app/personnel/stocks/actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildQueryKey, resourcePrefix } from "@/lib/query-keys";
import { patchClientCache } from "@/lib/client-cache";
import { patchRowInPage } from "@/lib/list-patch";
import { PAGE_SIZE } from "@/lib/constants";
import { cn } from "@/lib/utils";
import InventoryLoading from "./loading";
import styles from "./page.module.css";

type Level = "ok" | "low" | "critical" | "out" | "none";

/** 24px yellow action button — same treatment as the stock ledger rows. */
const YELLOW_BTN = cn(
  "h-6 gap-1 rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold",
  "text-navy-900 transition-colors hover:border-yellow-600 hover:bg-yellow-600",
  "disabled:pointer-events-none disabled:border-navy-200 disabled:bg-navy-100 disabled:text-navy-400"
);

const LEVEL_FILTERS: Array<{ value: "all" | Level; label: string }> = [
  { value: "all", label: "All stock levels" },
  { value: "out", label: "Out of stock" },
  { value: "critical", label: "Critical" },
  { value: "low", label: "Low stock" },
  { value: "ok", label: "In stock" },
  { value: "none", label: "No threshold" },
];

const NUMBER = new Intl.NumberFormat("en-PH");
const COST = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

function fmtNumber(value: number) {
  return NUMBER.format(value);
}

function fmtCost(value: number | null) {
  if (value === null || value === undefined) return "—";
  return COST.format(value);
}

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
  if (level === "ok") return "In stock";
  return "No threshold";
}

function levelTone(level: Level): "ok" | "warn" | "bad" | "neutral" {
  if (level === "out" || level === "critical") return "bad";
  if (level === "low") return "warn";
  if (level === "ok") return "ok";
  return "neutral";
}

function recommendationFor(r: InventoryRow): {
  short: string;
  title: string;
  detail: string;
  action: "transactions" | "threshold" | null;
} {
  const level = levelOf(r);
  const onHand = `${fmtNumber(r.quantity)}${r.unit ? ` ${r.unit}` : ""}`;
  const threshold =
    r.reorder_threshold != null ? fmtNumber(r.reorder_threshold) : "—";
  if (level === "out") {
    return {
      short: "Replenish now",
      title: `${r.item_name} is out of stock`,
      detail:
        "No units on hand. Tell personnel to file a supply request and replenish before operations are blocked.",
      action: "transactions",
    };
  }
  if (level === "critical") {
    return {
      short: "Restock soon",
      title: `${r.item_name} is critically low`,
      detail: `Only ${onHand} left (threshold ${threshold}). Replenish this week and have personnel prioritize a supply request.`,
      action: "transactions",
    };
  }
  if (level === "low") {
    return {
      short: "Plan reorder",
      title: `${r.item_name} is below threshold`,
      detail: `Down to ${onHand} (threshold ${threshold}). Plan a reorder soon so it does not turn critical.`,
      action: "transactions",
    };
  }
  if (level === "none") {
    return {
      short: "Set threshold",
      title: `${r.item_name} has no threshold`,
      detail:
        "Set a reorder threshold for this item so the system can alert personnel before it runs out.",
      action: "threshold",
    };
  }
  return {
    short: "No action",
    title: `${r.item_name} is healthy`,
    detail: `${onHand} on hand (threshold ${threshold}). No action needed.`,
    action: null,
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
        toast.error("Save failed", {
          description: res.error ?? "Failed to save threshold.",
          duration: 2000,
          closeButton: true,
        });
        return;
      }
      // Reconcile with the server record (authoritative echo, no refetch).
      onOptimistic(row.id, res.record?.reorder_threshold ?? threshold);
      toast.success("Threshold saved", {
        description: `${row.item_name} threshold updated.`,
        duration: 2000,
        closeButton: true,
      });
    } catch {
      onRevert(row.id, prev);
      setError("Failed to save threshold. Please try again.");
      toast.error("Save failed", {
        description: "Failed to save threshold. Please try again.",
        duration: 2000,
        closeButton: true,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.thresholdCell}>
      <input
        type="number"
        min={0}
        step={1}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && dirty && !saving) {
            e.preventDefault();
            void save();
          }
        }}
        placeholder="—"
        aria-label={`Reorder threshold for ${row.item_name}`}
        aria-invalid={error ? true : undefined}
        className={styles.thresholdInput}
        data-dirty={dirty ? "true" : undefined}
      />
      <ActionButton
        type="button"
        onClick={save}
        loadingLabel="Saving…"
        disabled={!dirty || saving}
        aria-label={`Save threshold for ${row.item_name}`}
        className={YELLOW_BTN}
      >
        Set
      </ActionButton>
      {error ? (
        <span className={styles.thresholdError} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export default function SuperAdminInventoryPage() {
  // Server-paged window (PAGE_SIZE) via the shared inventory reader:
  // the DB returns only the window + exact total per filter set (60s,
  // busted by stock/threshold writes). Header alerts read the global stats
  // snapshot (not the window) so counts stay exact while paging.
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [level, setLevel] = useState<"all" | Level>("all");
  const [page, setPage] = useState(1);
  const {
    data: paged,
    loading,
    isValidating,
    mutate: mutateRows,
  } = useCachedAction(
    buildQueryKey({
      module: "super-admin",
      resource: "inventory",
      page,
      filters: { q: debouncedQuery, level },
    }),
    () => getInventoryPage({ page, pageSize: PAGE_SIZE, q: debouncedQuery, level }),
    { staleTime: 60_000 }
  );
  const rows = useMemo(() => paged?.rows ?? [], [paged]);
  const total = paged?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const { data: statsData } = useCachedAction(
    buildQueryKey({ module: "super-admin", resource: "inventory-stats" }),
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
        [
          "pgso:client:inventory-items",
          resourcePrefix("personnel", "inventory"),
          resourcePrefix("personnel", "inventory-stats"),
        ],
        (d) => patchRowInPage(d, id, patch)
      );
    },
    [mutateRows]
  );

  // Dismissal is keyed to the alert count — closing hides this exact alert,
  // but a changed count (e.g. after saving a threshold) shows it again.
  const [dismissedFor, setDismissedFor] = useState<number | null>(null);

  const attention = stats.out + stats.critical + stats.low;
  const showAlert = attention > 0 && dismissedFor !== attention;

  // Row recommendation opens a focused dialog rather than shifting the page.
  const [recId, setRecId] = useState<string | null>(null);
  const recRow = recId ? (rows.find((r) => r.id === recId) ?? null) : null;

  const hasFilters = query.trim() !== "" || level !== "all";

  const clearFilters = useCallback(() => {
    setQuery("");
    setLevel("all");
    setPage(1);
  }, []);

  const bannerChips = [
    stats.out > 0 ? { label: `${fmtNumber(stats.out)} out of stock`, tone: "bad" as const } : null,
    stats.critical > 0
      ? { label: `${fmtNumber(stats.critical)} critical`, tone: "bad" as const }
      : null,
    stats.low > 0 ? { label: `${fmtNumber(stats.low)} low`, tone: "warn" as const } : null,
  ].filter((c): c is { label: string; tone: "bad" | "warn" } => c !== null);

  if (loading && rows.length === 0) {
    return <InventoryLoading />;
  }

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Stocks</h1>
          <p className={styles.subtitle}>
            <strong>{fmtNumber(total)}</strong> stock {total === 1 ? "line" : "lines"} in
            the ledger · reorder thresholds are set by the Administrator
            {isValidating ? <span className={styles.updating}> · updating…</span> : null}
          </p>
        </div>
      </header>

      {/* ── Summary tiles ─────────────────────────────────────────────── */}
      <div className={styles.summary}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon} aria-hidden="true">
            <Boxes size={16} />
          </span>
          <div className={styles.summaryBody}>
            <p className={styles.summaryLabel}>Stock lines</p>
            <p className={styles.summaryValue}>{statsData ? fmtNumber(stats.skus) : "—"}</p>
            <p className={styles.summaryMeta}>Distinct items in the ledger</p>
          </div>
        </div>

        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon} aria-hidden="true">
            <Layers3 size={16} />
          </span>
          <div className={styles.summaryBody}>
            <p className={styles.summaryLabel}>Units on hand</p>
            <p className={styles.summaryValue}>{statsData ? fmtNumber(stats.units) : "—"}</p>
            <p className={styles.summaryMeta}>Total quantity across all items</p>
          </div>
        </div>

        <div
          className={styles.summaryCard}
          data-tone={attention > 0 ? (stats.out + stats.critical > 0 ? "bad" : "warn") : undefined}
        >
          <span className={styles.summaryIcon} aria-hidden="true">
            <TriangleAlert size={16} />
          </span>
          <div className={styles.summaryBody}>
            <p className={styles.summaryLabel}>Needs replenishment</p>
            <p className={styles.summaryValue}>{statsData ? fmtNumber(attention) : "—"}</p>
            <p className={styles.summaryMeta}>
              {attention > 0
                ? stats.out > 0
                  ? `${fmtNumber(stats.out)} out of stock · ${fmtNumber(stats.low + stats.critical)} low or critical`
                  : `${fmtNumber(stats.low + stats.critical)} at or below threshold`
                : "All items are above threshold"}
            </p>
          </div>
        </div>

        <div className={styles.summaryCard} data-tone={stats.none > 0 ? "info" : undefined}>
          <span className={styles.summaryIcon} aria-hidden="true">
            <SlidersHorizontal size={16} />
          </span>
          <div className={styles.summaryBody}>
            <p className={styles.summaryLabel}>Missing threshold</p>
            <p className={styles.summaryValue}>{statsData ? fmtNumber(stats.none) : "—"}</p>
            <p className={styles.summaryMeta}>
              {stats.none > 0 ? "Set a reorder point below to enable alerts" : "Every item has a reorder point"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Inline stock alert banner ─────────────────────────────────── */}
      {showAlert ? (
        <div className={styles.banner} data-tone="warn" role="alert">
          <span className={styles.bannerIcon} aria-hidden="true">
            <TriangleAlert size={17} />
          </span>
          <div className={styles.bannerBody}>
            <p className={styles.bannerTitle}>
              {fmtNumber(attention)} item{attention !== 1 ? "s" : ""} at or below threshold
            </p>
            <p className={styles.bannerText}>
              Tell personnel to file supply requests for these items and replenish before
              they run out.
            </p>
            {bannerChips.length > 0 ? (
              <div className={styles.bannerChips}>
                {bannerChips.map((chip) => (
                  <span key={chip.label} className={styles.chip} data-tone={chip.tone}>
                    {chip.label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className={styles.bannerActions}>
            <Link href="/super-admin/transactions" className={styles.bannerLink}>
              Review requests
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
            <button
              type="button"
              className={styles.bannerClose}
              aria-label="Dismiss stock alert"
              onClick={() => setDismissedFor(attention)}
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : attention === 0 && stats.none > 0 ? (
        <div className={styles.banner} data-tone="info" role="status">
          <span className={styles.bannerIcon} aria-hidden="true">
            <SlidersHorizontal size={17} />
          </span>
          <div className={styles.bannerBody}>
            <p className={styles.bannerTitle}>
              {fmtNumber(stats.none)} item{stats.none !== 1 ? "s have" : " has"} no reorder
              point yet
            </p>
            <p className={styles.bannerText}>
              All stocked items are above threshold. Set a reorder point in the table so the
              system can alert personnel before an item runs out.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── Ledger panel ──────────────────────────────────────────────── */}
      <Card className={styles.panel}>
        <div className={styles.toolbar}>
          <p className={styles.toolbarInfo} aria-live="polite">
            {hasFilters ? (
              <>
                Showing <strong>{fmtNumber(total)}</strong> matching stock{" "}
                {total === 1 ? "line" : "lines"}
              </>
            ) : (
              <>
                <strong>{fmtNumber(total)}</strong> stock {total === 1 ? "line" : "lines"}
              </>
            )}
          </p>

          <div className={styles.filters}>
            <Input
              type="search"
              aria-label="Search stocks"
              placeholder="Search item, code, location…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              className={styles.search}
            />
            <Select
              value={level}
              onValueChange={(v) => {
                setLevel(v as "all" | Level);
                setPage(1);
              }}
            >
              <SelectTrigger className={styles.levelSelect} aria-label="Filter by stock level">
                <SelectValue placeholder="Stock level" />
              </SelectTrigger>
              <SelectContent>
                {LEVEL_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters ? (
              <button type="button" className={styles.clearBtn} onClick={clearFilters}>
                Clear
              </button>
            ) : null}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              {hasFilters ? <PackageSearch size={20} /> : <CircleSlash size={20} />}
            </span>
            <p className={styles.emptyTitle}>
              {hasFilters ? "No stock matches these filters" : "No stock records yet"}
            </p>
            <p className={styles.emptyText}>
              {hasFilters
                ? "Try a different search term, account code, or stock level."
                : "Stock lines appear here automatically once a delivery passes inspection."}
            </p>
            {hasFilters ? (
              <button type="button" className={styles.emptyAction} onClick={clearFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-label="Stock ledger">
              <thead>
                <tr>
                  <th className={styles.colItem}>Item</th>
                  <th className={styles.colQty}>On hand</th>
                  <th className={styles.colCost}>Unit cost</th>
                  <th className={styles.colStatus}>Status</th>
                  <th className={styles.colThreshold}>Reorder threshold</th>
                  <th className={styles.colRecommendation}>Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const rowLevel = levelOf(r);
                  const rec = recommendationFor(r);
                  return (
                    <tr key={r.id} data-tone={levelTone(rowLevel)}>
                      <td className={styles.colItem}>
                        <span className={styles.itemCell}>
                          <span className={styles.itemName}>{r.item_name}</span>
                          <span className={styles.itemMeta}>
                            {r.account_code ? (
                              <span className={styles.itemCode}>{r.account_code}</span>
                            ) : null}
                            {r.account_code && r.location ? (
                              <span className={styles.itemDot} aria-hidden="true">
                                ·
                              </span>
                            ) : null}
                            <span>{r.location ?? "No location set"}</span>
                          </span>
                        </span>
                      </td>
                      <td className={styles.colQty}>
                        <span className={styles.qty}>
                          {fmtNumber(r.quantity)}
                          {r.unit ? <span className={styles.unit}>{r.unit}</span> : null}
                        </span>
                      </td>
                      <td className={styles.colCost}>{fmtCost(r.unit_cost)}</td>
                      <td className={styles.colStatus}>
                        <span className={styles.badge} data-tone={levelTone(rowLevel)}>
                          {levelValue(rowLevel)}
                        </span>
                      </td>
                      <td className={styles.colThreshold}>
                        <ThresholdCell
                          key={`${r.id}:${r.reorder_threshold ?? ""}`}
                          row={r}
                          onOptimistic={(id, threshold) => patchThreshold(id, threshold)}
                          onRevert={(id, prev) => patchThreshold(id, prev)}
                        />
                      </td>
                      <td className={styles.colRecommendation}>
                        <button
                          type="button"
                          className={styles.recBtn}
                          data-tone={levelTone(rowLevel)}
                          aria-label={`View recommendation for ${r.item_name}`}
                          onClick={() => setRecId(r.id)}
                        >
                          {rec.short}
                          <ChevronRight size={13} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 ? (
          <div className={styles.footer}>
            <TablePager
              id="admin-inventory"
              total={total}
              pageSize={PAGE_SIZE}
              page={safePage}
              onPageChange={setPage}
            />
          </div>
        ) : null}
      </Card>

      <Dialog
        open={recRow !== null}
        onOpenChange={(v) => {
          if (!v) setRecId(null);
        }}
      >
        <DialogContent className="bg-white sm:max-w-md dark:bg-white">
          <DialogHeader>
            <DialogTitle>
              <span className={styles.dialogTitle}>
                {recRow ? recommendationFor(recRow).title : "Recommendation"}
              </span>
            </DialogTitle>
            <DialogDescription>
              {recRow ? (
                <span className={styles.dialogMeta}>
                  <span
                    className={styles.badge}
                    data-tone={levelTone(levelOf(recRow))}
                  >
                    {levelValue(levelOf(recRow))}
                  </span>
                  <span>
                    {fmtNumber(recRow.quantity)}
                    {recRow.unit ? ` ${recRow.unit}` : ""} on hand
                  </span>
                </span>
              ) : (
                "—"
              )}
            </DialogDescription>
          </DialogHeader>
          <p className={styles.dialogText}>
            {recRow ? recommendationFor(recRow).detail : ""}
          </p>
          <DialogFooter>
            {recRow && recommendationFor(recRow).action === "transactions" ? (
              <Link
                href="/super-admin/transactions"
                className={styles.dialogPrimary}
                onClick={() => setRecId(null)}
              >
                Review requests
                <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            ) : null}
            <button
              type="button"
              className={styles.dialogGhost}
              onClick={() => setRecId(null)}
            >
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
