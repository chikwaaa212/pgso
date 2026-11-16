"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Maximize2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { label } from "@/lib/labels";
import { bustClientCache, CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import { resourcePrefix } from "@/lib/query-keys";
import {
  getCatalog,
  getDeletedMasterData,
  getDepartments,
  getStockTypes,
  getUnits,
  deleteMasterDataPermanently,
  restoreMasterData,
  setCatalogDeleted,
  setDepartmentDeleted,
  setStockTypeDeleted,
  setUnitDeleted,
  type CatalogRow,
  type DeletedMasterData,
  type DepartmentRow,
  type MasterDataKind,
  type RestoreSelection,
  type StockTypeRow,
  type UnitRow,
} from "./actions";
import {
  AddCatalogForm,
  AddDepartmentForm,
  AddStockTypeForm,
  AddUnitForm,
  CatalogEdit,
  CatalogToggle,
  DeleteRowButton,
  DeletedRecordsDialog,
  DepartmentToggle,
  failureDescription,
  ImportCatalogDialog,
  StockTypeToggle,
  UnitToggle,
} from "./master-forms";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey } from "@/lib/query-keys";
import MasterDataLoading from "./loading";
import styles from "./page.module.css";

interface MasterDataSnapshot {
  units: UnitRow[];
  catalog: CatalogRow[];
  departments: DepartmentRow[];
  stockTypes: StockTypeRow[];
  deleted: DeletedMasterData;
}

const EMPTY_DELETED: DeletedMasterData = {
  units: [],
  catalog: [],
  departments: [],
  stockTypes: [],
};

const byName = <T extends { name: string },>(a: T, b: T) => a.name.localeCompare(b.name);

/** Newest first, capped at the three rows a card previews. */
function latestThree<T extends { created_at: string | null }>(rows: T[]): T[] {
  return [...rows]
    .sort((a, b) => {
      const at = a.created_at ? Date.parse(a.created_at) : 0;
      const bt = b.created_at ? Date.parse(b.created_at) : 0;
      return bt - at;
    })
    .slice(0, 3);
}

const matchesName = <T extends { name: string },>(row: T, query: string) =>
  row.name.toLowerCase().includes(query);

const matchesCatalog = (row: CatalogRow, query: string) =>
  [row.account_code, row.account_title, row.account_name, row.asset_type].some((v) =>
    (v ?? "").toLowerCase().includes(query)
  );

const matchesStockHeader = (row: StockTypeRow, query: string) =>
  [row.name, row.account_code, row.account_title, row.account_name, row.asset_type].some((v) =>
    (v ?? "").toLowerCase().includes(query)
  );

const byCatalogCode = (a: CatalogRow, b: CatalogRow) => a.account_code.localeCompare(b.account_code);

/**
 * Pure optimistic patch for bulk restore: `restore = true` moves the selected
 * rows out of their Deleted group and back into the active card lists;
 * `restore = false` reverses it (used when the background write fails).
 */
function applyRestore(
  prev: MasterDataSnapshot,
  items: RestoreSelection[],
  restore: boolean
): MasterDataSnapshot {
  let units = prev.units;
  let catalog = prev.catalog;
  let departments = prev.departments;
  let stockTypes = prev.stockTypes;
  let deleted = prev.deleted ?? EMPTY_DELETED;

  for (const { kind, id } of items) {
    if (kind === "unit") {
      if (restore) {
        const row = deleted.units.find((u) => u.id === id);
        if (!row) continue;
        units = [...units, { ...row, deleted_at: null }].sort(byName);
        deleted = { ...deleted, units: deleted.units.filter((u) => u.id !== id) };
      } else {
        const row = units.find((u) => u.id === id);
        if (!row) continue;
        units = units.filter((u) => u.id !== id);
        deleted = {
          ...deleted,
          units: [...deleted.units, { ...row, deleted_at: new Date().toISOString() }].sort(byName),
        };
      }
    } else if (kind === "department") {
      if (restore) {
        const row = deleted.departments.find((d) => d.id === id);
        if (!row) continue;
        departments = [...departments, { ...row, deleted_at: null }].sort(byName);
        deleted = { ...deleted, departments: deleted.departments.filter((d) => d.id !== id) };
      } else {
        const row = departments.find((d) => d.id === id);
        if (!row) continue;
        departments = departments.filter((d) => d.id !== id);
        deleted = {
          ...deleted,
          departments: [...deleted.departments, { ...row, deleted_at: new Date().toISOString() }].sort(byName),
        };
      }
    } else if (kind === "stock_type") {
      if (restore) {
        const row = deleted.stockTypes.find((s) => s.id === id);
        if (!row) continue;
        stockTypes = [...stockTypes, { ...row, deleted_at: null }].sort(byName);
        deleted = { ...deleted, stockTypes: deleted.stockTypes.filter((s) => s.id !== id) };
      } else {
        const row = stockTypes.find((s) => s.id === id);
        if (!row) continue;
        stockTypes = stockTypes.filter((s) => s.id !== id);
        deleted = {
          ...deleted,
          stockTypes: [...deleted.stockTypes, { ...row, deleted_at: new Date().toISOString() }].sort(byName),
        };
      }
    } else if (kind === "catalog") {
      if (restore) {
        const row = deleted.catalog.find((c) => c.id === id);
        if (!row) continue;
        catalog = [...catalog, { ...row, deleted_at: null }].sort(byCatalogCode);
        deleted = { ...deleted, catalog: deleted.catalog.filter((c) => c.id !== id) };
      } else {
        const row = catalog.find((c) => c.id === id);
        if (!row) continue;
        catalog = catalog.filter((c) => c.id !== id);
        deleted = {
          ...deleted,
          catalog: [...deleted.catalog, { ...row, deleted_at: new Date().toISOString() }].sort(byCatalogCode),
        };
      }
    }
  }

  return { ...prev, units, catalog, departments, stockTypes, deleted };
}

/**
 * Optimistic permanent delete: drop the selected rows from their Deleted
 * groups. The caller restores the server truth with `refresh()` if the hard
 * delete fails.
 */
function applyPermanentDelete(
  prev: MasterDataSnapshot,
  items: RestoreSelection[]
): MasterDataSnapshot {
  const deleted = prev.deleted ?? EMPTY_DELETED;
  const idsFor = (kind: MasterDataKind) =>
    new Set(items.filter((item) => item.kind === kind).map((item) => item.id));

  const unitIds = idsFor("unit");
  const departmentIds = idsFor("department");
  const stockTypeIds = idsFor("stock_type");
  const catalogIds = idsFor("catalog");

  return {
    ...prev,
    deleted: {
      units: unitIds.size ? deleted.units.filter((u) => !unitIds.has(u.id)) : deleted.units,
      departments: departmentIds.size
        ? deleted.departments.filter((d) => !departmentIds.has(d.id))
        : deleted.departments,
      stockTypes: stockTypeIds.size
        ? deleted.stockTypes.filter((s) => !stockTypeIds.has(s.id))
        : deleted.stockTypes,
      catalog: catalogIds.size ? deleted.catalog.filter((c) => !catalogIds.has(c.id)) : deleted.catalog,
    },
  };
}

/**
 * Empty state for a master-data card: message centred in the card with a
 * compact 24px yellow action below, matching the personnel dashboard.
 */
function EmptyCard({ message, action }: { message: string; action: ReactNode }) {
  return (
    <div className={styles.emptyCard}>
      <p className={styles.emptyCardText}>{message}</p>
      {action}
    </div>
  );
}

/** Card shell shared by all four panels; empty Departments/catalog get a highlight. */
function panelClass(highlight: boolean) {
  return `${styles.panel} p-4${highlight ? ` ${styles.panelHighlight}` : ""}`;
}

interface OverlayColumn<T> {
  header: string;
  render: (row: T) => ReactNode;
}

/**
 * Generic "view all" overlay for a master-data card: a 24px full-screen icon
 * button beside the card's add action, opening every record with a search
 * field at the top right.
 */
function AllRecordsDialog<T>({
  title,
  noun,
  searchPlaceholder,
  records,
  columns,
  getKey,
  matches,
  triggerIcon,
  triggerLabel,
  triggerTitle,
  triggerClassName,
}: {
  title: string;
  /** Lowercase noun used in copy, e.g. "departments". */
  noun: string;
  searchPlaceholder: string;
  records: T[];
  columns: OverlayColumn<T>[];
  getKey: (row: T) => string;
  matches: (row: T, query: string) => boolean;
  /** Optional custom trigger (defaults to the yellow full-screen icon). */
  triggerIcon?: ReactNode;
  triggerLabel?: string;
  triggerTitle?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? records.filter((row) => matches(row, q)) : records;
  }, [records, query, matches]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? styles.iconButton}
        aria-label={triggerTitle ?? `View all ${records.length} ${noun}`}
        title={triggerTitle ?? `View all ${noun}`}
      >
        {triggerIcon ?? <Maximize2 size={13} aria-hidden="true" />}
        {triggerLabel ? <span>{triggerLabel}</span> : null}
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent showCloseButton={false} className="bg-white sm:max-w-2xl dark:bg-white">
          <div className={styles.dialogHeaderRow}>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>
                All {records.length} {noun} — search to find one quickly.
              </DialogDescription>
            </DialogHeader>
            <div className={styles.dialogHeaderActions}>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className={styles.dialogSearch}
              />
              <button type="button" onClick={() => handleOpenChange(false)} className={styles.dialogClose}>
                Close
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className={styles.dialogEmpty}>
              {records.length === 0 ? `No ${noun} yet.` : `No ${noun} match “${query.trim()}”.`}
            </p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th key={col.header}>{col.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={getKey(row)}>
                      {columns.map((col) => (
                        <td key={col.header}>{col.render(row)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function SuperAdminMasterDataPage() {
  const router = useRouter();
  // Cached snapshot (units + catalog): back-navigation paints instantly
  // from memory / sessionStorage and only revalidates silently when stale
  // (60s, matching the server caches) — same SWR pattern as the other
  // admin pages. Writes bust + revalidate through the forms.
  const { data: snapshot, loading, mutate, refresh } = useCachedAction<MasterDataSnapshot>(    buildQueryKey({ module: 'super-admin', resource: 'master-data' }),
    () =>
      Promise.all([getUnits(), getCatalog(), getDepartments(), getStockTypes(), getDeletedMasterData()]).then(([units, catalog, departments, stockTypes, deleted]) => ({
        units,
        catalog,
        departments,
        stockTypes,
        deleted,
      })),
    { staleTime: 60_000 }
  );
  const units = useMemo(() => snapshot?.units ?? [], [snapshot]);
  const catalog = useMemo(() => snapshot?.catalog ?? [], [snapshot]);
  const departments = useMemo(() => snapshot?.departments ?? [], [snapshot]);
  const stockTypes = useMemo(() => snapshot?.stockTypes ?? [], [snapshot]);
  const deleted = useMemo(() => snapshot?.deleted ?? EMPTY_DELETED, [snapshot]);

  // Cards preview only the newest three rows; the rest live in the overlay
  // opened from the full-screen icon beside each card's add action.
  const recentDepartments = useMemo(() => latestThree(departments), [departments]);
  const recentUnits = useMemo(() => latestThree(units), [units]);
  const recentStockTypes = useMemo(() => latestThree(stockTypes), [stockTypes]);
  const recentCatalog = useMemo(() => latestThree(catalog), [catalog]);

  // Optimistic patches: the dialog closes the moment the user confirms, the
  // row appears instantly, and a failed background save rolls it back (the
  // form shows a toast). A successful save revalidates in the background.
  const patch = useCallback(
    (fn: (prev: MasterDataSnapshot) => MasterDataSnapshot) => {
      mutate((prev) => (prev ? fn(prev) : prev));
    },
    [mutate]
  );

  const addDepartment = useCallback(
    (row: DepartmentRow) =>
      patch((prev) => ({ ...prev, departments: [...prev.departments, row].sort(byName) })),
    [patch]
  );
  const rollbackDepartment = useCallback(
    (id: string) => patch((prev) => ({ ...prev, departments: prev.departments.filter((d) => d.id !== id) })),
    [patch]
  );
  const addUnit = useCallback(
    (row: UnitRow) => patch((prev) => ({ ...prev, units: [...prev.units, row].sort(byName) })),
    [patch]
  );
  const rollbackUnit = useCallback(
    (id: string) => patch((prev) => ({ ...prev, units: prev.units.filter((u) => u.id !== id) })),
    [patch]
  );
  const addStockType = useCallback(
    (row: StockTypeRow) => patch((prev) => ({ ...prev, stockTypes: [...prev.stockTypes, row].sort(byName) })),
    [patch]
  );
  const rollbackStockType = useCallback(
    (id: string) => patch((prev) => ({ ...prev, stockTypes: prev.stockTypes.filter((s) => s.id !== id) })),
    [patch]
  );
  const addCatalog = useCallback(
    (row: CatalogRow) =>
      patch((prev) => ({
        ...prev,
        catalog: [...prev.catalog, row].sort((a, b) => a.account_code.localeCompare(b.account_code)),
      })),
    [patch]
  );
  const rollbackCatalog = useCallback(
    (id: string) => patch((prev) => ({ ...prev, catalog: prev.catalog.filter((c) => c.id !== id) })),
    [patch]
  );
  const editCatalog = useCallback(
    (id: string, changes: Partial<CatalogRow>) =>
      patch((prev) => ({
        ...prev,
        catalog: prev.catalog.map((c) => (c.id === id ? { ...c, ...changes } : c)),
      })),
    [patch]
  );

  // Optimistic status: the Deactivate/Reactivate button calls these before the
  // server write finishes so the STATUS badge flips instantly (and rolls back
  // from the component if the write fails).
  const patchUnitStatus = useCallback(
    (id: string, status: "active" | "inactive") =>
      patch((prev) => ({
        ...prev,
        units: prev.units.map((u) => (u.id === id ? { ...u, status } : u)),
      })),
    [patch]
  );
  const patchDepartmentStatus = useCallback(
    (id: string, status: "active" | "inactive") =>
      patch((prev) => ({
        ...prev,
        departments: prev.departments.map((d) => (d.id === id ? { ...d, status } : d)),
      })),
    [patch]
  );
  const patchStockTypeStatus = useCallback(
    (id: string, status: "active" | "inactive") =>
      patch((prev) => ({
        ...prev,
        stockTypes: prev.stockTypes.map((s) => (s.id === id ? { ...s, status } : s)),
      })),
    [patch]
  );
  const patchCatalogStatus = useCallback(
    (id: string, status: "active" | "inactive") =>
      patch((prev) => ({
        ...prev,
        catalog: prev.catalog.map((c) => (c.id === id ? { ...c, status } : c)),
      })),
    [patch]
  );

  // Soft delete / restore: move the row between the active list and its
  // Deleted overlay optimistically; the same helper rolls back on failure.
  const moveUnit = useCallback(
    (row: UnitRow, toActive: boolean) =>
      patch((prev) => ({
        ...prev,
        units: toActive
          ? [...prev.units, { ...row, deleted_at: null }].sort(byName)
          : prev.units.filter((u) => u.id !== row.id),
        deleted: {
          ...prev.deleted,
          units: toActive
            ? (prev.deleted ?? EMPTY_DELETED).units.filter((u) => u.id !== row.id)
            : [...(prev.deleted ?? EMPTY_DELETED).units, { ...row, deleted_at: new Date().toISOString() }].sort(byName),
        },
      })),
    [patch]
  );

  const moveDepartment = useCallback(
    (row: DepartmentRow, toActive: boolean) =>
      patch((prev) => ({
        ...prev,
        departments: toActive
          ? [...prev.departments, { ...row, deleted_at: null }].sort(byName)
          : prev.departments.filter((d) => d.id !== row.id),
        deleted: {
          ...prev.deleted,
          departments: toActive
            ? (prev.deleted ?? EMPTY_DELETED).departments.filter((d) => d.id !== row.id)
            : [...(prev.deleted ?? EMPTY_DELETED).departments, { ...row, deleted_at: new Date().toISOString() }].sort(byName),
        },
      })),
    [patch]
  );

  const moveStockType = useCallback(
    (row: StockTypeRow, toActive: boolean) =>
      patch((prev) => ({
        ...prev,
        stockTypes: toActive
          ? [...prev.stockTypes, { ...row, deleted_at: null }].sort(byName)
          : prev.stockTypes.filter((s) => s.id !== row.id),
        deleted: {
          ...prev.deleted,
          stockTypes: toActive
            ? (prev.deleted ?? EMPTY_DELETED).stockTypes.filter((s) => s.id !== row.id)
            : [...(prev.deleted ?? EMPTY_DELETED).stockTypes, { ...row, deleted_at: new Date().toISOString() }].sort(byName),
        },
      })),
    [patch]
  );

  const moveCatalog = useCallback(
    (row: CatalogRow, toActive: boolean) =>
      patch((prev) => ({
        ...prev,
        catalog: toActive
          ? [...prev.catalog, { ...row, deleted_at: null }].sort((a, b) => a.account_code.localeCompare(b.account_code))
          : prev.catalog.filter((c) => c.id !== row.id),
        deleted: {
          ...prev.deleted,
          catalog: toActive
            ? (prev.deleted ?? EMPTY_DELETED).catalog.filter((c) => c.id !== row.id)
            : [...(prev.deleted ?? EMPTY_DELETED).catalog, { ...row, deleted_at: new Date().toISOString() }].sort((a, b) => a.account_code.localeCompare(b.account_code)),
        },
      })),
    [patch]
  );

  // Bulk restore from the Archive overlay: move every selected row back
  // immediately, then run one background write. On failure, reverse the move
  // and toast — success is silent because the UI already reflects it.
  const restoreSelected = useCallback(
    (items: RestoreSelection[]) => {
      if (!items.length) return;
      patch((prev) => applyRestore(prev, items, true));
      void restoreMasterData(items)
        .then((r) => {
          if (r.ok) {
            bustClientCache([
              CLIENT_CACHE_KEYS.adminMasterData,
              resourcePrefix("super-admin", "master-data"),
              "pgso:master-data:active",
            ]);
            toast.success("Restored", {
              description: `Restored ${items.length} record${items.length === 1 ? "" : "s"}.`,
              duration: 2500,
              closeButton: true,
            });
            router.refresh();
            return;
          }
          patch((prev) => applyRestore(prev, items, false));
          toast.error("Couldn't restore", {
            description: failureDescription(r.error),
            duration: 4000,
            closeButton: true,
          });
        })
        .catch(() => {
          patch((prev) => applyRestore(prev, items, false));
          toast.error("Couldn't restore", {
            description: "Please check your connection and try again.",
            duration: 4000,
            closeButton: true,
          });
        });
    },
    [patch, router]
  );

  // Permanent delete from the Archive overlay: drop the rows immediately,
  // then hard-delete in the background. On failure, refetch the server truth
  // (which restores the rows) and toast the reason.
  const permanentlyDeleteSelected = useCallback(
    (items: RestoreSelection[]) => {
      if (!items.length) return;
      patch((prev) => applyPermanentDelete(prev, items));
      void deleteMasterDataPermanently(items)
        .then((r) => {
          if (r.ok) {
            bustClientCache([
              CLIENT_CACHE_KEYS.adminMasterData,
              resourcePrefix("super-admin", "master-data"),
              "pgso:master-data:active",
            ]);
            toast.success("Deleted permanently", {
              description: `${items.length} record${items.length === 1 ? " was" : "s were"} removed from the database.`,
              duration: 2500,
              closeButton: true,
            });
            router.refresh();
            return;
          }
          refresh();
          toast.error("Couldn't delete permanently", {
            description: failureDescription(r.error),
            duration: 4000,
            closeButton: true,
          });
        })
        .catch(() => {
          refresh();
          toast.error("Couldn't delete permanently", {
            description: "Please check your connection and try again.",
            duration: 4000,
            closeButton: true,
          });
        });
    },
    [patch, refresh, router]
  );

  if (loading) {
    return <MasterDataLoading />;
  }

  return (
    <section className={`${styles.section} ${styles.interFont}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 className={styles.title}>Master Data</h1>
          <p className={styles.subtitle}>
            These are the lists personnel choose from. A value can&apos;t be turned
            off while it is still in use.
          </p>
        </div>
        <DeletedRecordsDialog
          deleted={deleted}
          onRestoreSelected={restoreSelected}
          onDeletePermanently={permanentlyDeleteSelected}
        />
      </div>

      <div className={styles.cardsGrid}>
        <Card className={panelClass(departments.length === 0)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className={styles.panelTitle}>Departments</h2>
              <p className={styles.panelSub}>
                The offices staff can choose from when they sign up.
              </p>
            </div>
            {departments.length > 0 ? (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
                {departments.length > 3 ? (
                  <AllRecordsDialog
                    title="Departments"
                    noun="departments"
                    searchPlaceholder="Search departments"
                    records={departments}
                    getKey={(d) => d.id}
                    matches={matchesName}
                    columns={[
                      { header: "Name", render: (d) => d.name },
                      {
                        header: "Status",
                        render: (d) => (
                          <span className={styles.status} data-tone={d.status === "active" ? "ok" : "bad"}>
                            {label(d.status)}
                          </span>
                        ),
                      },
                      {
                        header: "Action",
                        render: (d) => (
                          <div style={{ display: "flex", gap: "0.375rem", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                            <DepartmentToggle id={d.id} name={d.name} isActive={d.status === "active"} onStatusChange={patchDepartmentStatus} />
                            <DeleteRowButton
                              label={d.name}
                              onDelete={() => setDepartmentDeleted(d.id, true)}
                              onOptimisticRemove={() => moveDepartment(d, false)}
                              onRollback={() => moveDepartment(d, true)}
                            />
                          </div>
                        ),
                      },
                    ]}
                  />
                ) : null}
                <AddDepartmentForm onAdd={addDepartment} onRollback={rollbackDepartment} />
              </div>
            ) : null}
          </div>
          {departments.length === 0 ? (
            <EmptyCard
              message="No departments yet."
              action={<AddDepartmentForm triggerClassName={styles.emptyCardButton} onAdd={addDepartment} onRollback={rollbackDepartment} />}
            />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentDepartments.map((d) => (
                    <tr key={d.id}>
                      <td>{d.name}</td>
                      <td>
                        <span className={styles.status} data-tone={d.status === "active" ? "ok" : "bad"}>
                          {label(d.status)}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.375rem", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                          <DepartmentToggle id={d.id} name={d.name} isActive={d.status === "active"} onStatusChange={patchDepartmentStatus} />
                          <DeleteRowButton
                            label={d.name}
                            onDelete={() => setDepartmentDeleted(d.id, true)}
                            onOptimisticRemove={() => moveDepartment(d, false)}
                            onRollback={() => moveDepartment(d, true)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className={panelClass(false)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className={styles.panelTitle}>Units</h2>
              <p className={styles.panelSub}>
                How items are counted — for example piece, set, or box.
              </p>
            </div>
            {units.length > 0 ? (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
                {units.length > 3 ? (
                  <AllRecordsDialog
                    title="Units"
                    noun="units"
                    searchPlaceholder="Search units"
                    records={units}
                    getKey={(u) => u.id}
                    matches={matchesName}
                    columns={[
                      { header: "Name", render: (u) => u.name },
                      {
                        header: "Status",
                        render: (u) => (
                          <span className={styles.status} data-tone={u.status === "active" ? "ok" : "bad"}>
                            {label(u.status)}
                          </span>
                        ),
                      },
                      {
                        header: "Action",
                        render: (u) => (
                          <div style={{ display: "flex", gap: "0.375rem", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                            <UnitToggle id={u.id} name={u.name} isActive={u.status === "active"} onStatusChange={patchUnitStatus} />
                            <DeleteRowButton
                              label={u.name}
                              onDelete={() => setUnitDeleted(u.id, true)}
                              onOptimisticRemove={() => moveUnit(u, false)}
                              onRollback={() => moveUnit(u, true)}
                            />
                          </div>
                        ),
                      },
                    ]}
                  />
                ) : null}
                <AddUnitForm onAdd={addUnit} onRollback={rollbackUnit} />
              </div>
            ) : null}
          </div>
          {units.length === 0 ? (
            <EmptyCard
              message="No units yet."
              action={<AddUnitForm triggerClassName={styles.emptyCardButton} onAdd={addUnit} onRollback={rollbackUnit} />}
            />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentUnits.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>
                        <span className={styles.status} data-tone={u.status === "active" ? "ok" : "bad"}>
                          {label(u.status)}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.375rem", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                          <UnitToggle id={u.id} name={u.name} isActive={u.status === "active"} onStatusChange={patchUnitStatus} />
                          <DeleteRowButton
                            label={u.name}
                            onDelete={() => setUnitDeleted(u.id, true)}
                            onOptimisticRemove={() => moveUnit(u, false)}
                            onRollback={() => moveUnit(u, true)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className={panelClass(false)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className={styles.panelTitle}>Stock headers</h2>
              <p className={styles.panelSub}>
                Groups for consumable supplies, like office or cleaning materials.
              </p>
            </div>
            {stockTypes.length > 0 ? (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
                {stockTypes.length > 3 ? (
                  <AllRecordsDialog
                    title="Stock headers"
                    noun="stock headers"
                    searchPlaceholder="Search stock headers"
                    records={stockTypes}
                    getKey={(s) => s.id}
                    matches={matchesStockHeader}
                    columns={[
                      { header: "Code", render: (s) => s.account_code ?? "—" },
                      { header: "Stock type", render: (s) => s.asset_type ?? "—" },
                      { header: "Title", render: (s) => s.account_title ?? s.name },
                      {
                        header: "Status",
                        render: (s) => (
                          <span className={styles.status} data-tone={s.status === "active" ? "ok" : "bad"}>
                            {label(s.status)}
                          </span>
                        ),
                      },
                      {
                        header: "Action",
                        render: (s) => (
                          <div style={{ display: "flex", gap: "0.375rem", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                            <StockTypeToggle id={s.id} name={s.name} isActive={s.status === "active"} onStatusChange={patchStockTypeStatus} />
                            <DeleteRowButton
                              label={s.name}
                              onDelete={() => setStockTypeDeleted(s.id, true)}
                              onOptimisticRemove={() => moveStockType(s, false)}
                              onRollback={() => moveStockType(s, true)}
                            />
                          </div>
                        ),
                      },
                    ]}
                  />
                ) : null}
                <AddStockTypeForm onAdd={addStockType} onRollback={rollbackStockType} />
              </div>
            ) : null}
          </div>
          {stockTypes.length === 0 ? (
            <EmptyCard
              message="No stock headers yet."
              action={<AddStockTypeForm triggerClassName={styles.emptyCardButton} onAdd={addStockType} onRollback={rollbackStockType} />}
            />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentStockTypes.map((s) => (
                    <tr key={s.id}>
                      <td>{s.account_code ?? s.name}</td>
                      <td>
                        <span className={styles.status} data-tone={s.status === "active" ? "ok" : "bad"}>
                          {label(s.status)}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.375rem", justifyContent: "flex-end", whiteSpace: "nowrap" }}>
                          <StockTypeToggle id={s.id} name={s.name} isActive={s.status === "active"} onStatusChange={patchStockTypeStatus} />
                          <DeleteRowButton
                            label={s.name}
                            onDelete={() => setStockTypeDeleted(s.id, true)}
                            onOptimisticRemove={() => moveStockType(s, false)}
                            onRollback={() => moveStockType(s, true)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className={panelClass(catalog.length === 0)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className={styles.panelTitle}>Asset headers</h2>
              <p className={styles.panelSub}>
                The official list of items with their codes.
              </p>
            </div>
            {catalog.length > 0 ? (
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", flexShrink: 0 }}>
                {catalog.length > 3 ? (
                  <AllRecordsDialog
                    title="Account catalog"
                    noun="catalog entries"
                    searchPlaceholder="Search catalog"
                    records={catalog}
                    getKey={(c) => c.id}
                    matches={matchesCatalog}
                    columns={[
                      { header: "Code", render: (c) => c.account_code },
                      { header: "Asset type", render: (c) => c.asset_type },
                      { header: "Title", render: (c) => c.account_title },
                      {
                        header: "Status",
                        render: (c) => (
                          <span className={styles.status} data-tone={c.status === "active" ? "ok" : "bad"}>
                            {label(c.status)}
                          </span>
                        ),
                      },
                      {
                        header: "Actions",
                        render: (c) => (
                          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "nowrap", whiteSpace: "nowrap", justifyContent: "flex-end" }}>
                            <CatalogEdit id={c.id} title={c.account_title} name={c.account_name} type={c.asset_type} description={c.description} onEdited={editCatalog} />
                            <CatalogToggle id={c.id} code={c.account_code} isActive={c.status === "active"} onStatusChange={patchCatalogStatus} />
                            <DeleteRowButton
                              label={c.account_code}
                              onDelete={() => setCatalogDeleted(c.id, true)}
                              onOptimisticRemove={() => moveCatalog(c, false)}
                              onRollback={() => moveCatalog(c, true)}
                            />
                          </div>
                        ),
                      },
                    ]}
                  />
                ) : null}
                <AddCatalogForm onAdd={addCatalog} onRollback={rollbackCatalog} />
                <ImportCatalogDialog />
              </div>
            ) : null}
          </div>
          {catalog.length === 0 ? (
            <EmptyCard
              message="No catalog entries yet."
              action={<AddCatalogForm triggerClassName={styles.emptyCardButton} onAdd={addCatalog} onRollback={rollbackCatalog} />}
            />
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCatalog.map((c) => (
                    <tr key={c.id}>
                      <td>{c.account_code}</td>
                      <td>
                        <span className={styles.status} data-tone={c.status === "active" ? "ok" : "bad"}>
                          {label(c.status)}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "nowrap", whiteSpace: "nowrap", justifyContent: "flex-end" }}>
                          <CatalogEdit id={c.id} title={c.account_title} name={c.account_name} type={c.asset_type} description={c.description} onEdited={editCatalog} />
                          <CatalogToggle id={c.id} code={c.account_code} isActive={c.status === "active"} onStatusChange={patchCatalogStatus} />
                          <DeleteRowButton
                            label={c.account_code}
                            onDelete={() => setCatalogDeleted(c.id, true)}
                            onOptimisticRemove={() => moveCatalog(c, false)}
                            onRollback={() => moveCatalog(c, true)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
