"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  BrowseTable,
  StatusPill,
  type BrowseColumn,
} from "@/components/super-admin/BrowseTable";
import { browseInventory } from "../browse/actions";
import { setReorderThreshold } from "./actions";
import type { InventoryRow } from "@/app/personnel/inventory/actions";
import { useCachedAction } from "@/hooks/use-cached-action";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import InventoryLoading from "./loading";
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

function ThresholdCell({ row, onSaved }: { row: InventoryRow; onSaved: () => void }) {
  const initial = row.reorder_threshold != null ? String(row.reorder_threshold) : "";
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty = val.trim() !== initial.trim();

  async function save() {
    setSaving(true);
    setError("");
    const trimmed = val.trim();
    let threshold: number | null = null;
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n < 0) {
        setSaving(false);
        setError("Whole number ≥ 0, or empty to clear.");
        return;
      }
      threshold = n;
    }
    const res = await setReorderThreshold(row.id, threshold);
    setSaving(false);
    if (!res.success) {
      setError(res.error ?? "Failed to save threshold.");
      return;
    }
    onSaved();
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
      <button
        type="button"
        onClick={() => void save()}
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
        {saving ? "Saving…" : "Set"}
      </button>
      {error ? (
        <span style={{ fontSize: "0.6875rem", color: "#991b1b" }}>{error}</span>
      ) : null}
    </div>
  );
}

export default function SuperAdminInventoryPage() {
  // Same client caching as the personnel inventory page: back-navigation
  // paints instantly from memory / sessionStorage and only revalidates
  // silently when stale (60s, matching the server list cache).
  const {
    data,
    loading,
    refresh,
  } = useCachedAction(
    CLIENT_CACHE_KEYS.adminInventory,
    browseInventory,
    { staleTime: 60_000 }
  );
  const rows = useMemo(() => data ?? [], [data]);

  // Dismissal is keyed to the alert count — closing hides this exact alert,
  // but a changed count (e.g. after saving a threshold) toasts again.
  const [dismissedFor, setDismissedFor] = useState<number | null>(null);

  const alert = useMemo(() => {
    let out = 0;
    let critical = 0;
    let low = 0;
    let none = 0;
    for (const r of rows) {
      const lv = levelOf(r);
      if (lv === "out") out += 1;
      else if (lv === "critical") critical += 1;
      else if (lv === "low") low += 1;
      else if (lv === "none") none += 1;
    }
    return { out, critical, low, none, attention: out + critical + low };
  }, [rows]);

  const showAlert = alert.attention > 0 && dismissedFor !== alert.attention;

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
            onSaved={() => refresh()}
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
    [refresh]
  );

  if (loading) {
    return <InventoryLoading />;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Stocks</p>
      <div>
        <h1 className={styles.title}>Stocks</h1>
        <p className={styles.subtitle}>
          {`${rows.length} stock ${rows.length === 1 ? "line" : "lines"}`} · thresholds are set by Super Admin
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
              Stock alert: {alert.attention} item{alert.attention !== 1 ? "s" : ""}{" "}
              at or below threshold
              {alert.out > 0 ? ` — ${alert.out} out of stock` : ""}
              {alert.critical > 0 ? `, ${alert.critical} critical` : ""}
              {alert.low > 0 ? `, ${alert.low} low` : ""}.
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
            onClick={() => setDismissedFor(alert.attention)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {alert.attention === 0 && alert.none > 0 ? (
        <p className={styles.panelSub} role="status">
          All stocked items are above threshold. {alert.none} item{alert.none !== 1 ? "s have" : " has"} no
          threshold yet — set one below so the system can alert personnel.
        </p>
      ) : null}

      <Card className={styles.panel}>
        <BrowseTable rows={rows} columns={columns} searchPlaceholder="Search item, code, location…" pageSizeKey="pgso:admin:inventory" />
      </Card>
    </section>
  );
}
