"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getAllUnifiedAssets, type UnifiedAssetRow } from "./actions";
import { IssuanceEvaluateDialog } from "@/components/personnel/IssuanceDialog";
import { usePageSize } from "@/hooks/use-page-size";
import styles from "../dashboard/page.module.css";
import airStyles from "../inspections/air-section.module.css";
import assetStyles from "./page.module.css";

function tone(status: string | null) {
  if (status === "available") return "ok";
  if (status === "retired") return "warn";
  return "info";
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

function fmtCurrency(value: number | null) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "available", label: "Available" },
  { value: "in use", label: "In use" },
  { value: "maintenance", label: "Maintenance" },
  { value: "retired", label: "Retired" },
] as const;

const PAGE_SIZES = [10, 20, 50, 100];

function pageWindow(current: number, total: number) {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  const pages: number[] = [];
  for (let p = Math.max(1, end - 4); p <= end; p++) pages.push(p);
  return { pages: pages.filter((p) => p >= start), start };
}

export default function PersonnelAssetsPage() {
  const [rows, setRows] = useState<UnifiedAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = usePageSize(
    "pgso:page-size:assets",
    PAGE_SIZES[0]
  );
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [issuanceOpen, setIssuanceOpen] = useState(false);
  const [presetAssetId, setPresetAssetId] = useState<string | null>(null);

  useEffect(() => {
    void getAllUnifiedAssets().then((data) => {
      setRows(data);
      setLoading(false);
    });
  }, []);

  const reload = () => {
    setLoading(true);
    void getAllUnifiedAssets().then((data) => {
      setRows(data);
      setLoading(false);
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((a) => {
      if (q) {
        const hay = [
          a.account_code,
          a.qr_code,
          a.category,
          a.account_title,
          a.account_name,
          a.identifier,
          a.article,
          a.description,
          a.location,
          a.remarks,
          a.brand,
          a.engine_displacement,
          a.fuel_type,
          a.engine_number,
          a.chassis_number,
          a.color,
          a.plate_number,
          a.fund,
          a.status,
          a.dv_tracking_number,
          a.supplier_payee,
          a.account_name_charge,
          a.account_number,
          a.obr_number,
          a.dv_number,
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

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const { pages } = pageWindow(safePage, pageCount);

  const selectedRow = rows.find((r) => r.id === selectedId) ?? null;
  const selectedAssignable =
    selectedRow !== null &&
    (selectedRow.status ?? "available").trim().toLowerCase() === "available" &&
    !(typeof selectedRow.quantity === "number" && selectedRow.quantity <= 0) &&
    selectedRow.assigned_to == null;

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
          <Button
            type="button"
            disabled={selectedId !== null && !selectedAssignable}
            title={
              selectedId !== null && !selectedAssignable
                ? "Selected asset is already assigned or out of stock"
                : "Issue the selected asset"
            }
            onClick={() => {
              setPresetAssetId(selectedId);
              setIssuanceOpen(true);
            }}
          >
            Issue / Assign
          </Button>
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
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
                setSelectedId(null);
              }}
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
                onClick={() => {
                  setStatusFilter(f.value);
                  setPage(1);
                  setSelectedId(null);
                }}
              >
                {f.label}
              </Button>
            ))}
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={assetStyles.filterBtn}
                onClick={() => {
                  setQuery("");
                  setPage(1);
                  setSelectedId(null);
                }}
              >
                Clear
              </Button>
            )}
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
          <>
            <div className={`${styles.tableWrap} ${assetStyles.tableAuto}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Details</th>
                    <th>Account Code</th>
                    <th>Property No.</th>
                    <th>Asset Type</th>
                    <th>Account Title</th>
                    <th>Account Name</th>
                    <th>Identifier</th>
                    <th>Article</th>
                    <th>Qty.</th>
                    <th>Unit</th>
                    <th>Description</th>
                    <th>Date Acquired</th>
                    <th>Location</th>
                    <th>Total Cost</th>
                    <th>Unit Cost</th>
                    <th>Condition</th>
                    <th>Status</th>
                    <th>Brand</th>
                    <th>Cyl.</th>
                    <th>Engine Disp.</th>
                    <th>Fuel Type</th>
                    <th>Engine #</th>
                    <th>Chassis #</th>
                    <th>Color</th>
                    <th>Plate No.</th>
                    <th>Fund</th>
                    <th>Remarks</th>
                    <th>DV Tracking #</th>
                    <th>Supplier/Payee</th>
                    <th>Account Name (Charge)</th>
                    <th>Account Number</th>
                    <th>OBR Number</th>
                    <th>DV Number</th>
                    <th>Date Received</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => {
                    const isSelected = selectedId === a.id;
                    const statusKey = (a.status ?? "available")
                      .trim()
                      .toLowerCase();
                    const outOfStock =
                      typeof a.quantity === "number" && a.quantity <= 0;
                    const alreadyAssigned = a.assigned_to != null;
                    const assignable =
                      statusKey === "available" &&
                      !outOfStock &&
                      !alreadyAssigned;
                    const issueBlockReason = alreadyAssigned
                      ? "Already assigned"
                      : outOfStock
                        ? "Out of stock"
                        : statusKey !== "available"
                          ? label(a.status)
                          : null;
                    return (
                      <tr
                        key={a.id}
                        className={
                          isSelected ? assetStyles.selectedRow : assetStyles.selectableRow
                        }
                        data-selected={isSelected ? "true" : undefined}
                        aria-selected={isSelected}
                        tabIndex={0}
                        onClick={() =>
                          setSelectedId((prev) => (prev === a.id ? null : a.id))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedId((prev) =>
                              prev === a.id ? null : a.id
                            );
                          }
                        }}
                      >
                        <td
                          className={assetStyles.detailsCell}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Link href={`/personnel/assets/${a.id}`}>
                              <Button type="button" variant="outline" size="sm">
                                See Details
                              </Button>
                            </Link>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!assignable}
                              title={
                                issueBlockReason
                                  ? `Cannot issue — ${issueBlockReason.toLowerCase()}`
                                  : "Issue this asset"
                              }
                              onClick={() => {
                                setPresetAssetId(a.id);
                                setIssuanceOpen(true);
                              }}
                            >
                              Issue
                            </Button>
                          </span>
                        </td>
                        <td>
                          <span
                            className={assetStyles.property}
                            title={a.account_code ?? undefined}
                          >
                            {a.account_code ?? "—"}
                          </span>
                        </td>
                        <td>{a.qr_code ?? "—"}</td>
                        <td>{label(a.category)}</td>
                        <td>{label(a.account_title)}</td>
                        <td>{label(a.account_name)}</td>
                        <td>{a.identifier ?? "—"}</td>
                        <td>{label(a.article)}</td>
                        <td>{a.quantity ?? "—"}</td>
                        <td>{label(a.unit)}</td>
                        <td>{a.description ?? "—"}</td>
                        <td>{fmtDate(a.date_acquired)}</td>
                        <td>{a.location ?? "—"}</td>
                        <td>{fmtCurrency(a.total_cost)}</td>
                        <td>{fmtCurrency(a.unit_cost)}</td>
                        <td>{label(a.condition)}</td>
                        <td>
                          <span
                            className={styles.status}
                            data-tone={
                              outOfStock
                                ? "bad"
                                : tone(
                                    alreadyAssigned && statusKey === "available"
                                      ? "in use"
                                      : a.status
                                  )
                            }
                          >
                            {outOfStock
                              ? "Out of stock"
                              : alreadyAssigned && statusKey === "available"
                                ? "Assigned"
                                : label(a.status)}
                          </span>
                        </td>
                        <td>{a.brand ?? "—"}</td>
                        <td>{a.cylinders ?? "—"}</td>
                        <td>{a.engine_displacement ?? "—"}</td>
                        <td>{label(a.fuel_type)}</td>
                        <td>{a.engine_number ?? "—"}</td>
                        <td>{a.chassis_number ?? "—"}</td>
                        <td>{label(a.color)}</td>
                        <td>{a.plate_number ?? "—"}</td>
                        <td>{a.fund ?? "—"}</td>
                        <td>{a.remarks ?? "—"}</td>
                        <td>{a.dv_tracking_number ?? "—"}</td>
                        <td>{a.supplier_payee ?? "—"}</td>
                        <td>{a.account_name_charge ?? "—"}</td>
                        <td>{a.account_number ?? "—"}</td>
                        <td>{a.obr_number ?? "—"}</td>
                        <td>{a.dv_number ?? "—"}</td>
                        <td>{fmtDate(a.date_received)}</td>
                        <td>{fmtDate(a.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.pager}>
              <span className={styles.pagerInfo}>
                Showing {start + 1}–
                {Math.min(start + pageSize, filtered.length)} of{" "}
                {filtered.length}
              </span>
              <div className={styles.pagerControls}>
                <span className={styles.pageSizeWrap}>
                  <label htmlFor="assets-page-size">Rows</label>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      setPageSize(Number(v));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger
                      id="assets-page-size"
                      size="sm"
                      className="w-[5.5rem]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </span>
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={safePage === 1}
                  onClick={() => setPage(safePage - 1)}
                  aria-label="Previous page"
                >
                  ‹
                </button>
                {pages.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={styles.pageBtn}
                    data-active={p === safePage}
                    onClick={() => setPage(p)}
                    aria-label={`Page ${p}`}
                    aria-current={p === safePage ? "page" : undefined}
                  >
                    {p}
                  </button>
                ))}
                <button
                  type="button"
                  className={styles.pageBtn}
                  disabled={safePage === pageCount}
                  onClick={() => setPage(safePage + 1)}
                  aria-label="Next page"
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      {issuanceOpen ? (
        <IssuanceEvaluateDialog
          key={presetAssetId ?? "direct"}
          open={issuanceOpen}
          onOpenChange={(v) => {
            setIssuanceOpen(v);
            if (!v) setPresetAssetId(null);
          }}
          mode="direct"
          presetAssetId={presetAssetId}
          onSuccess={() => {
            setIssuanceOpen(false);
            setPresetAssetId(null);
            reload();
          }}
        />
      ) : null}
    </section>
  );
}
