"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getAssets, type AssetRow } from "./actions";
import styles from "../dashboard/page.module.css";
import airStyles from "../inspections/air-section.module.css";
import assetStyles from "./page.module.css";

function tone(status: string | null) {
  if (status === "available") return "ok";
  if (status === "assigned") return "info";
  return "warn";
}

function label(value: string | null) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "available", label: "Available" },
  { value: "assigned", label: "Assigned" },
  { value: "retired", label: "Retired" },
] as const;

export default function PersonnelAssetsPage() {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    void getAssets().then((data) => {
      setRows(data);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((a) => {
      if (q) {
        const hay = [
          a.property_number,
          a.qr_code,
          a.category,
          a.description,
          a.location,
          a.assigned_to,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== "all" && (a.status ?? "") !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [rows, query, statusFilter]);

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Personnel / Assets</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Assets</h1>
          <p className={styles.subtitle}>
            {rows.length} {rows.length === 1 ? "asset" : "assets"} registered
          </p>
        </div>
        <div className={styles.actions}>
          <span className={styles.actionSecondary}>Add asset (soon)</span>
        </div>
      </div>

      <Card className={styles.panel}>
        <div className={airStyles.controls}>
          <div className={assetStyles.searchWrap}>
            <Search className={assetStyles.searchIcon} size={16} />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search property no., category, description…"
              className={assetStyles.search}
              aria-label="Search assets"
            />
          </div>
          <div className={assetStyles.filterRow}>
            <Filter size={14} />
            {STATUS_FILTERS.map((f) => (
              <Button
                key={f.value}
                type="button"
                variant={statusFilter === f.value ? "primary" : "outline"}
                size="sm"
                className={assetStyles.filterBtn}
                data-active={statusFilter === f.value ? "true" : undefined}
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>Loading assets…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.panelSub}>
              {rows.length === 0
                ? "No assets have been registered yet."
                : "No assets match your search or filters."}
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>QR Code</th>
                  <th>Image</th>
                  <th>Property no.</th>
                  <th>Category</th>
                  <th>Description</th>
                  <th>Condition</th>
                  <th>Status</th>
                  <th>Location</th>
                  <th>Assigned to</th>
                  <th>Date acquired</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.qr_data_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.qr_data_url}
                          alt={`QR for ${a.property_number ?? a.id}`}
                          className={assetStyles.qrImg}
                        />
                      ) : (
                        <span className={styles.panelSub}>—</span>
                      )}
                    </td>
                    <td>
                      {a.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.image_url}
                          alt={a.description ?? a.property_number ?? "Asset image"}
                          className={assetStyles.thumb}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        <span className={styles.panelSub}>—</span>
                      )}
                    </td>
                    <td>
                      <span
                        className={assetStyles.property}
                        title={a.property_number ?? undefined}
                      >
                        {a.property_number ?? "—"}
                      </span>
                    </td>
                    <td>{label(a.category)}</td>
                    <td>{a.description ?? "—"}</td>
                    <td>{label(a.condition)}</td>
                    <td>
                      <span className={styles.status} data-tone={tone(a.status)}>
                        {label(a.status)}
                      </span>
                    </td>
                    <td>{a.location ?? "—"}</td>
                    <td>{a.assigned_to ?? "—"}</td>
                    <td>{fmtDate(a.date_acquired)}</td>
                    <td>{fmtDate(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
