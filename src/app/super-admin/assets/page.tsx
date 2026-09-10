"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
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
import { browseAssets, browseCategories } from "../browse/actions";
import type { UnifiedAssetRow } from "@/app/personnel/assets/actions";
import { AddAssetDialog, ImportAssetsDialog } from "@/app/personnel/assets/asset-dialogs";
import { usePageSize } from "@/hooks/use-page-size";
import styles from "@/app/personnel/dashboard/page.module.css";
import airStyles from "@/app/personnel/inspections/air-section.module.css";
import assetStyles from "@/app/personnel/assets/page.module.css";

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

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

function distinctValues(rows: UnifiedAssetRow[], pick: (r: UnifiedAssetRow) => string | null) {
  const map = new Map<string, string>();
  for (const r of rows) {
    const raw = (pick(r) ?? "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!map.has(key)) map.set(key, raw);
  }
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

function pageWindow(current: number, total: number) {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  const pages: number[] = [];
  for (let p = Math.max(1, end - 4); p <= end; p++) pages.push(p);
  return { pages: pages.filter((p) => p >= start), start };
}

export default function SuperAdminAssetsPage() {
  const [rows, setRows] = useState<UnifiedAssetRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [pageSize, setPageSize] = usePageSize(
    "pgso:admin:page-size:assets",
    PAGE_SIZES[0]
  );
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([browseAssets(), browseCategories()]).then(([data, cats]) => {
      setRows(data);
      setCategories(cats);
      setLoading(false);
    });
  }, []);

  const reload = () => {
    setLoading(true);
    void Promise.all([browseAssets(), browseCategories()]).then(([data, cats]) => {
      setRows(data);
      setCategories(cats);
      setLoading(false);
    });
  };

  const resetPage = () => {
    setPage(1);
    setSelectedId(null);
  };

  const conditionOptions = useMemo(() => distinctValues(rows, (r) => r.condition), [rows]);
  const unitOptions = useMemo(() => distinctValues(rows, (r) => r.unit), [rows]);
  const assetTypeOptions = useMemo(() => distinctValues(rows, (r) => r.category), [rows]);

  const hasActiveFilters =
    query.trim() !== "" ||
    statusFilter !== "all" ||
    conditionFilter !== "all" ||
    unitFilter !== "all" ||
    assetTypeFilter !== "all";

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
          a.condition,
          a.unit,
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
      if (statusFilter !== "all" && norm(a.status) !== statusFilter) return false;
      if (conditionFilter !== "all" && norm(a.condition) !== conditionFilter) return false;
      if (unitFilter !== "all" && norm(a.unit) !== unitFilter) return false;
      if (assetTypeFilter !== "all" && norm(a.category) !== assetTypeFilter) return false;
      return true;
    });
  }, [rows, query, statusFilter, conditionFilter, unitFilter, assetTypeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const { pages } = pageWindow(safePage, pageCount);

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Assets</p>
      <div className={styles.headerRow}>
        <div>
          <h1 className={styles.title}>Assets</h1>
          <p className={styles.subtitle}>
            {rows.length} {rows.length === 1 ? "asset" : "assets"} registered
            {hasActiveFilters ? ` · ${filtered.length} shown` : ""}
          </p>
        </div>
        <div className={styles.actions}>
          <AddAssetDialog categories={categories} onSuccess={reload} />
          <ImportAssetsDialog onSuccess={reload} />
        </div>
      </div>

      <Card className={styles.panel}>
        <div className={airStyles.controls}>
          <div className={assetStyles.topRow}>
            <div className={assetStyles.searchWrap}>
              <Search className={assetStyles.searchIcon} size={16} />
              <Input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  resetPage();
                }}
                placeholder="Search property no., category, description…"
                className={assetStyles.search}
                aria-label="Search assets"
              />
            </div>
            <div className={assetStyles.filterGroup}>
              <label className={assetStyles.filterLabel} htmlFor="admin-assets-filter-status">
                Status
              </label>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  resetPage();
                }}
              >
                <SelectTrigger id="admin-assets-filter-status" size="sm" className={assetStyles.filterSelect}>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTERS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
              <div className={assetStyles.filterGroup}>
                <label className={assetStyles.filterLabel} htmlFor="admin-assets-filter-type">
                  Asset type
                </label>
                <Select
                  value={assetTypeFilter}
                  onValueChange={(v) => {
                    setAssetTypeFilter(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger id="admin-assets-filter-type" size="sm" className={assetStyles.filterSelect}>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {assetTypeOptions.map(([key, display]) => (
                      <SelectItem key={key} value={key}>
                        {label(display)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={assetStyles.filterGroup}>
                <label className={assetStyles.filterLabel} htmlFor="admin-assets-filter-condition">
                  Condition
                </label>
                <Select
                  value={conditionFilter}
                  onValueChange={(v) => {
                    setConditionFilter(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger id="admin-assets-filter-condition" size="sm" className={assetStyles.filterSelect}>
                    <SelectValue placeholder="All conditions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All conditions</SelectItem>
                    {conditionOptions.map(([key, display]) => (
                      <SelectItem key={key} value={key}>
                        {label(display)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className={assetStyles.filterGroup}>
                <label className={assetStyles.filterLabel} htmlFor="admin-assets-filter-unit">
                  Unit
                </label>
                <Select
                  value={unitFilter}
                  onValueChange={(v) => {
                    setUnitFilter(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger id="admin-assets-filter-unit" size="sm" className={assetStyles.filterSelect}>
                    <SelectValue placeholder="All units" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All units</SelectItem>
                    {unitOptions.map(([key, display]) => (
                      <SelectItem key={key} value={key}>
                        {label(display)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={assetStyles.filterBtn}
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                    setConditionFilter("all");
                    setUnitFilter("all");
                    setAssetTypeFilter("all");
                    resetPage();
                  }}
                >
                  Clear all
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
                ? "No assets have been registered yet. Use Add asset or Import Excel to get started."
                : "No assets match your search or filters."}
            </p>
          </div>
        ) : (
          <>
            <div className={`${styles.tableWrap} ${assetStyles.tableAuto}`}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={assetStyles.colDetails}>Details</th>
                    <th className={assetStyles.colBase}>Account Code</th>
                    <th className={assetStyles.colBase}>Property No.</th>
                    <th className={assetStyles.colWide}>Asset Type</th>
                    <th className={assetStyles.colWide}>Account Title</th>
                    <th className={assetStyles.colWide}>Account Name</th>
                    <th className={assetStyles.colBase}>Identifier</th>
                    <th className={assetStyles.colWide}>Article</th>
                    <th className={assetStyles.colNarrow}>Qty.</th>
                    <th className={assetStyles.colNarrow}>Unit</th>
                    <th className={assetStyles.colXl}>Description</th>
                    <th className={assetStyles.colBase}>Date Acquired</th>
                    <th className={assetStyles.colBase}>Location</th>
                    <th className={assetStyles.colCost}>Total Cost</th>
                    <th className={assetStyles.colCost}>Unit Cost</th>
                    <th className={assetStyles.colBase}>Condition</th>
                    <th className={assetStyles.colBase}>Status</th>
                    <th className={assetStyles.colBase}>Brand</th>
                    <th className={assetStyles.colNarrow}>Cyl.</th>
                    <th className={assetStyles.colBase}>Engine Disp.</th>
                    <th className={assetStyles.colBase}>Fuel Type</th>
                    <th className={assetStyles.colBase}>Engine #</th>
                    <th className={assetStyles.colBase}>Chassis #</th>
                    <th className={assetStyles.colBase}>Color</th>
                    <th className={assetStyles.colBase}>Plate No.</th>
                    <th className={assetStyles.colBase}>Fund</th>
                    <th className={assetStyles.colXl}>Remarks</th>
                    <th className={assetStyles.colBase}>DV Tracking #</th>
                    <th className={assetStyles.colWide}>Supplier/Payee</th>
                    <th className={assetStyles.colWide}>Account Name (Charge)</th>
                    <th className={assetStyles.colBase}>Account Number</th>
                    <th className={assetStyles.colBase}>OBR Number</th>
                    <th className={assetStyles.colBase}>DV Number</th>
                    <th className={assetStyles.colBase}>Date Received</th>
                    <th className={assetStyles.colBase}>Created</th>
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
                          className={`${assetStyles.detailsCell} ${assetStyles.colDetails}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <Link
                              href={`/super-admin/assets/${a.id}`}
                            >
                              <Button type="button" variant="outline" size="sm">
                                View Details
                              </Button>
                            </Link>
                            <span
                              className={styles.status}
                              data-tone={alreadyAssigned ? "warn" : "ok"}
                            >
                              {alreadyAssigned ? "Issued" : "Not issued"}
                            </span>
                          </span>
                        </td>
                        <td className={assetStyles.colBase}>
                          <span
                            className={assetStyles.property}
                            title={a.account_code ?? undefined}
                          >
                            {a.account_code ?? "—"}
                          </span>
                        </td>
                        <td className={assetStyles.colBase}>{a.qr_code ?? "—"}</td>
                        <td className={assetStyles.colWide}>{label(a.category)}</td>
                        <td className={assetStyles.colWide}>{label(a.account_title)}</td>
                        <td className={assetStyles.colWide}>{label(a.account_name)}</td>
                        <td className={assetStyles.colBase}>{a.identifier ?? "—"}</td>
                        <td className={assetStyles.colWide}>{label(a.article)}</td>
                        <td className={assetStyles.colNarrow}>{a.quantity ?? "—"}</td>
                        <td className={assetStyles.colNarrow}>{label(a.unit)}</td>
                        <td className={assetStyles.colXl}>{a.description ?? "—"}</td>
                        <td className={assetStyles.colBase}>{fmtDate(a.date_acquired)}</td>
                        <td className={assetStyles.colBase}>{a.location ?? "—"}</td>
                        <td className={assetStyles.colCost}>{fmtCurrency(a.total_cost)}</td>
                        <td className={assetStyles.colCost}>{fmtCurrency(a.unit_cost)}</td>
                        <td className={assetStyles.colBase}>{label(a.condition)}</td>
                        <td className={assetStyles.colBase}>
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
                        <td className={assetStyles.colBase}>{a.brand ?? "—"}</td>
                        <td className={assetStyles.colNarrow}>{a.cylinders ?? "—"}</td>
                        <td className={assetStyles.colBase}>{a.engine_displacement ?? "—"}</td>
                        <td className={assetStyles.colBase}>{label(a.fuel_type)}</td>
                        <td className={assetStyles.colBase}>{a.engine_number ?? "—"}</td>
                        <td className={assetStyles.colBase}>{a.chassis_number ?? "—"}</td>
                        <td className={assetStyles.colBase}>{label(a.color)}</td>
                        <td className={assetStyles.colBase}>{a.plate_number ?? "—"}</td>
                        <td className={assetStyles.colBase}>{a.fund ?? "—"}</td>
                        <td className={assetStyles.colXl}>{a.remarks ?? "—"}</td>
                        <td className={assetStyles.colBase}>{a.dv_tracking_number ?? "—"}</td>
                        <td className={assetStyles.colWide}>{a.supplier_payee ?? "—"}</td>
                        <td className={assetStyles.colWide}>{a.account_name_charge ?? "—"}</td>
                        <td className={assetStyles.colBase}>{a.account_number ?? "—"}</td>
                        <td className={assetStyles.colBase}>{a.obr_number ?? "—"}</td>
                        <td className={assetStyles.colBase}>{a.dv_number ?? "—"}</td>
                        <td className={assetStyles.colBase}>{fmtDate(a.date_received)}</td>
                        <td className={assetStyles.colBase}>{fmtDate(a.created_at)}</td>
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
                  <label htmlFor="admin-assets-page-size">Rows</label>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      setPageSize(Number(v));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger
                      id="admin-assets-page-size"
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
    </section>
  );
}
