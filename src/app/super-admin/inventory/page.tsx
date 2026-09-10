"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import {
  BrowseTable,
  StatusPill,
  type BrowseColumn,
} from "@/components/super-admin/BrowseTable";
import { browseInventory } from "../browse/actions";
import { setReorderThreshold } from "./actions";
import type { InventoryRow } from "@/app/personnel/inventory/actions";
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

function ThresholdCell({ row, onSaved }: { row: InventoryRow; onSaved: () => void }) {
  const initial = row.reorder_threshold != null ? String(row.reorder_threshold) : "";
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setVal(row.reorder_threshold != null ? String(row.reorder_threshold) : "");
    setError("");
  }, [row.reorder_threshold]);

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
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    void browseInventory().then((r) => {
      setRows(r);
      setLoading(false);
    });
  };

  useEffect(() => {
    reload();
  }, []);

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
        value: (r) => <ThresholdCell row={r} onSaved={reload} />,
        text: (r) => (r.reorder_threshold != null ? String(r.reorder_threshold) : ""),
      },
      { key: "location", label: "Location", value: (r) => r.location ?? "—", text: (r) => r.location ?? "" },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Stocks</p>
      <div>
        <h1 className={styles.title}>Stocks</h1>
        <p className={styles.subtitle}>
          {loading ? "Loading…" : `${rows.length} stock ${rows.length === 1 ? "line" : "lines"}`} · thresholds are set by Super Admin
        </p>
      </div>

      {!loading && alert.attention > 0 ? (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p className="font-semibold">
            Stock alert: {alert.attention} item{alert.attention !== 1 ? "s" : ""} at or
            below threshold
            {alert.out > 0 ? ` — ${alert.out} out of stock` : ""}
            {alert.critical > 0 ? `, ${alert.critical} critical` : ""}
            {alert.low > 0 ? `, ${alert.low} low` : ""}.
          </p>
          <p className="mt-1">
            Recommendation: tell personnel to file supply requests for these items and
            replenish before they run out. Review incoming requests under{" "}
            <Link href="/super-admin/transactions" className="font-semibold underline">
              Transactions
            </Link>
            .
          </p>
        </div>
      ) : null}

      {!loading && alert.attention === 0 && alert.none > 0 ? (
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
