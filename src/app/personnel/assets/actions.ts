"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";

// Every Next.js revalidation also busts the Upstash personnel cache so
// Redis never serves stale lists after a write (fire-and-forget).
// Narrow: asset writes touch assets/inventory/dashboard/documents only.
function revalidatePath(path: string) {
  nextRevalidatePath(path);
  void import("@/lib/personnel-cache")
    .then((m) => m.bustPersonnelScopes(['assets', 'inventory', 'dashboard', 'documents']))
    .catch(() => {});
}
import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { generateAssetQrDataUrl, generateAssetUnitQrDataUrl, generateStockQrDataUrl } from "@/lib/qrcode";
import { ensureAssetUnits } from "@/lib/asset-units";
import { ASSET_EXCEL_HEADERS, ASSET_TEMPLATE_SHEET } from "@/lib/asset-excel";
import { findCatalogEntry, getActiveCatalogEntries, resolveUnitName, ensureCatalogEntry } from "@/lib/master-data";
import { classifyCondition } from "@/lib/reporting";
import { ACCOUNT_CODE_PREFIX, nextAccountCode } from "@/lib/account-code";
import { fetchCustomBags, type CustomBag } from "./custom-fields";

export interface EditState {
  success?: boolean;
  error?: string;
  /** Updated record — lets the client patch cache without refetch. */
  record?: unknown;
}

const ASSET_EDITABLE_KEYS = [
  "identifier",
  "account_code",
  "account_title",
  "account_name",
  "category",
  "article",
  "quantity",
  "unit",
  "description",
  "date_acquired",
  "location",
  "total_cost",
  "remarks",
  "condition",
  "unit_cost",
  "end_user",
  "brand",
  "cylinders",
  "engine_displacement",
  "fuel_type",
  "engine_number",
  "chassis_number",
  "color",
  "plate_number",
  "fund",
  "status",
  "dv_tracking_number",
  "supplier_payee",
  "account_name_charge",
  "account_number",
  "obr_number",
  "dv_number",
  "date_received",
  "qr_code",
] as const;

const NUMERIC_KEYS = new Set(["quantity", "cylinders"]);
const DECIMAL_KEYS = new Set(["total_cost", "unit_cost"]);
const DATE_KEYS = new Set(["date_acquired", "date_received"]);

/** Fields owned by the issued PAR/ICS once an item is assigned. */
const ASSIGNED_LOCKED_KEYS = [
  "quantity",
  "unit",
  "status",
  "end_user",
] as const;

export interface AssetRow {
  id: string;
  account_code: string | null;
  identifier: string | null;
  account_title: string | null;
  account_name: string | null;
  category: string | null;
  article: string | null;
  quantity: number | null;
  unit: string | null;
  description: string | null;
  date_acquired: string | null;
  location: string | null;
  total_cost: number | null;
  remarks: string | null;
  condition: string | null;
  unit_cost: number | null;
  end_user: string | null;
  brand: string | null;
  cylinders: number | null;
  engine_displacement: string | null;
  fuel_type: string | null;
  engine_number: string | null;
  chassis_number: string | null;
  color: string | null;
  plate_number: string | null;
  fund: string | null;
  status: string | null;
  dv_tracking_number: string | null;
  supplier_payee: string | null;
  account_name_charge: string | null;
  account_number: string | null;
  obr_number: string | null;
  dv_number: string | null;
  date_received: string | null;
  qr_code: string | null;
  created_at: string | null;
  assigned_to: string | null;
  qr_data_url: string;
  /** User-defined column values, keyed by custom field key. */
  custom_fields: CustomBag;
}



export async function getCategories(): Promise<string[]> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('personnel:asset-categories'), 300, async () => {
  try {
    // Strict mode: distinct asset types from the active catalog.
    const entries = await getActiveCatalogEntries();
    const types = [...new Set(entries.map((e) => e.type).filter(Boolean))].sort();
    if (types.length > 0) return types;
    // Fallback for a fresh DB before any catalog seeding.
    const result = await prisma.asset.findMany({
      where: { category: { not: null } },
      select: { category: true },
    });
    return [...new Set(result.map((r) => r.category as string))].sort();
  } catch (e) {
    console.error("[getCategories]", e);
    return [];
  }
  })
}

export interface StockRow {
  id: string;
  item_name: string | null;
  category: string | null;
  account_code: string | null;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  total_cost: number | null;
  reorder_threshold: number | null;
  location: string | null;
  updated_at: string | null;
  qr_data_url: string;
  /** User-defined column values, keyed by custom field key. */
  custom_fields: CustomBag;
}

/** One employee an item was issued to (PAR/ICS), newest first. */
export interface AssetAssignee {
  /** Profile id, when the record carries one. */
  id: string | null;
  name: string;
  doc_type: string | null;
  doc_no: string | null;
  date: string | null;
  /** True for the holder flagged on the asset record. */
  current: boolean;
}

export interface UnifiedAssetRow {
  id: string;
  source: "asset" | "stock";
  account_code: string | null;
  identifier: string | null;
  account_title: string | null;
  account_name: string | null;
  category: string | null;
  article: string | null;
  quantity: number | null;
  unit: string | null;
  description: string | null;
  date_acquired: string | null;
  location: string | null;
  total_cost: number | null;
  remarks: string | null;
  condition: string | null;
  unit_cost: number | null;
  end_user: string | null;
  brand: string | null;
  cylinders: number | null;
  engine_displacement: string | null;
  fuel_type: string | null;
  engine_number: string | null;
  chassis_number: string | null;
  color: string | null;
  plate_number: string | null;
  fund: string | null;
  status: string | null;
  dv_tracking_number: string | null;
  supplier_payee: string | null;
  account_name_charge: string | null;
  account_number: string | null;
  obr_number: string | null;
  dv_number: string | null;
  date_received: string | null;
  created_at: string | null;
  qr_code: string | null;
  assigned_to: string | null;
  qr_data_url: string;
  /** Employees issued this item (via PAR/ICS or the holder flag). */
  assignees: AssetAssignee[];
  /** User-defined column values, keyed by custom field key. */
  custom_fields: CustomBag;
}

/**
 * Master Data row behind an asset/stock code. Matches the catalog code
 * exactly first, then the base of a generated `<base>-NNNN` code, so a
 * sequenced code still resolves to its account title/name.
 */
async function catalogForAccountCode(accountCode: string | null | undefined) {
  const code = String(accountCode ?? '').trim()
  if (!code) return null
  const bases = [code]
  const seq = /^(.+)-(\d{1,6})$/.exec(code)
  if (seq) bases.push(seq[1])
  const rows = await prisma.accountCatalog
    .findMany({
      where: {
        status: 'active',
        OR: bases.map((base) => ({ account_code: { equals: base, mode: 'insensitive' } })),
      },
      select: {
        account_code: true,
        account_title: true,
        account_name: true,
        asset_type: true,
      },
    })
    .catch(() => [])
  const norm = (v: string | null | undefined) => (v ?? '').trim().toLowerCase()
  const exact = rows.find((r) => norm(r.account_code) === norm(code))
  return exact ?? rows.find((r) => bases.some((b) => norm(r.account_code) === norm(b))) ?? rows[0] ?? null
}

function mapStockToUnified(stock: StockRow): UnifiedAssetRow {
  // Inventory has no title/name columns: a passed inspection stores the
  // delivery's catalog Account Title in `custom_fields`, and older rows are
  // resolved from Master Data by `getUnifiedAsset`.
  const bag = stock.custom_fields ?? {}
  const bagText = (key: string) => {
    const value = (bag as Record<string, unknown>)[key]
    return typeof value === 'string' && value.trim() ? value.trim() : null
  }
  return {
    id: stock.id,
    source: "stock",
    account_code: stock.account_code,
    identifier: null,
    account_title: bagText('account_title'),
    account_name: bagText('account_name'),
    category: stock.category,
    article: stock.item_name,
    quantity: stock.quantity,
    unit: stock.unit,
    description: null,
    date_acquired: null,
    location: stock.location,
    total_cost: stock.total_cost,
    remarks: stock.reorder_threshold !== null ? `Reorder: ${stock.reorder_threshold}` : null,
    condition: null,
    unit_cost: stock.unit_cost,
    end_user: null,
    brand: null,
    cylinders: null,
    engine_displacement: null,
    fuel_type: null,
    engine_number: null,
    chassis_number: null,
    color: null,
    plate_number: null,
    fund: null,
    status: "available",
    dv_tracking_number: null,
    supplier_payee: null,
    account_name_charge: null,
    account_number: null,
    obr_number: null,
    dv_number: null,
    date_received: null,
    created_at: stock.updated_at,
    qr_code: null,
    assigned_to: null,
    qr_data_url: stock.qr_data_url,
    assignees: [],
    custom_fields: stock.custom_fields,
  };
}

function mapAssetToUnified(asset: AssetRow): UnifiedAssetRow {
  return {
    ...asset,
    source: "asset",
    assignees: [],
  };
}

export async function getAsset(id: string): Promise<AssetRow | null> {
  try {
    const a = await prisma.asset.findUnique({
      where: { id },
      select: {
        id: true,
        account_code: true,
        identifier: true,
        account_title: true,
        account_name: true,
        category: true,
        article: true,
        quantity: true,
        unit: true,
        description: true,
        date_acquired: true,
        location: true,
        total_cost: true,
        remarks: true,
        condition: true,
        unit_cost: true,
        end_user: true,
        brand: true,
        cylinders: true,
        engine_displacement: true,
        fuel_type: true,
        engine_number: true,
        chassis_number: true,
        color: true,
        plate_number: true,
        fund: true,
        status: true,
        dv_tracking_number: true,
        supplier_payee: true,
        account_name_charge: true,
        account_number: true,
        obr_number: true,
        dv_number: true,
        date_received: true,
        qr_code: true,
        created_at: true,
        assigned_to: true,
      },
    })

    if (!a) return null

    const bags = await fetchCustomBags([a.id], []);

    return {
      id: a.id,
      account_code: a.account_code,
      identifier: a.identifier,
      account_title: a.account_title,
      account_name: a.account_name,
      category: a.category,
      article: a.article,
      quantity: a.quantity,
      unit: a.unit,
      description: a.description,
      date_acquired: a.date_acquired?.toISOString().slice(0, 10) ?? null,
      location: a.location,
      total_cost: a.total_cost !== null && a.total_cost !== undefined ? Number(a.total_cost) : null,
      remarks: a.remarks,
      condition: a.condition,
      unit_cost: a.unit_cost !== null && a.unit_cost !== undefined ? Number(a.unit_cost) : null,
      end_user: a.end_user,
      brand: a.brand,
      cylinders: a.cylinders,
      engine_displacement: a.engine_displacement,
      fuel_type: a.fuel_type,
      engine_number: a.engine_number,
      chassis_number: a.chassis_number,
      color: a.color,
      plate_number: a.plate_number,
      fund: a.fund,
      status: a.status,
      dv_tracking_number: a.dv_tracking_number,
      supplier_payee: a.supplier_payee,
      account_name_charge: a.account_name_charge,
      account_number: a.account_number,
      obr_number: a.obr_number,
      dv_number: a.dv_number,
      date_received: a.date_received?.toISOString().slice(0, 10) ?? null,
      qr_code: a.qr_code,
      created_at: a.created_at?.toISOString() ?? null,
      assigned_to: a.assigned_to,
      qr_data_url: await generateAssetQrDataUrl(a.id),
      custom_fields: bags.get(`asset:${a.id}`) ?? {},
    }
  } catch (e) {
    console.error("[getAsset]", e)
    return null
  }
}

export async function getStock(id: string): Promise<StockRow | null> {
  try {
    const item = await prisma.inventoryItem.findUnique({
      where: { id },
      select: {
        id: true,
        item_name: true,
        category: true,
        account_code: true,
        quantity: true,
        unit: true,
        unit_cost: true,
        reorder_threshold: true,
        location: true,
        updated_at: true,
      },
    });

    if (!item) return null

    const bags = await fetchCustomBags([], [item.id]);

    return {
      id: item.id,
      item_name: item.item_name,
      category: item.category,
      account_code: item.account_code,
      quantity: item.quantity,
      unit: item.unit,
      unit_cost: item.unit_cost != null ? Number(item.unit_cost) : null,
      total_cost: item.unit_cost != null ? Number(item.unit_cost) * item.quantity : null,
      reorder_threshold: item.reorder_threshold,
      location: item.location,
      updated_at: item.updated_at?.toISOString() ?? null,
      qr_data_url: await generateStockQrDataUrl(item.id),
      custom_fields: bags.get(`stock:${item.id}`) ?? {},
    }
  } catch (e) {
    console.error("[getStock]", e)
    return null
  }
}

export async function updateAsset(
  _prevState: EditState,
  formData: FormData
): Promise<EditState> {
  let actor: { userId: string | null };
  try {
    const { requirePersonnelScope } = await import('@/lib/personnel-scope')
    actor = await requirePersonnelScope()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Not authenticated.'
    return { success: false, error: msg.startsWith('Forbidden') ? 'Forbidden: Personnel only.' : 'Not authenticated.' }
  }
  const id = String(formData.get("id") ?? "").trim().slice(0, 36);
  if (!id) {
    return { success: false, error: "Missing asset id." };
  }

  const data: Record<string, unknown> = {};

  for (const key of ASSET_EDITABLE_KEYS) {
    const raw = formData.get(key);
    if (raw === null || raw === undefined || raw === "") {
      data[key] = null;
      continue;
    }
    const val = String(raw).trim().slice(0, 500);
    if (NUMERIC_KEYS.has(key)) {
      const n = Number(val);
      data[key] = Number.isNaN(n) ? null : n;
    } else if (DECIMAL_KEYS.has(key)) {
      const n = Number(val);
      data[key] = Number.isNaN(n) ? null : n;
    } else if (DATE_KEYS.has(key)) {
      const d = new Date(val);
      data[key] = Number.isNaN(d.getTime()) ? null : d;
    } else {
      data[key] = val;
    }
  }

  // Allowlist already enforced above (ASSET_EDITABLE_KEYS + trim/cap).
  const before = await prisma.asset.findUnique({ where: { id }, select: { id: true, account_code: true, article: true, status: true, condition: true } }).catch(() => null)
  if (!before) return { success: false, error: "Asset not found." }

  // Same invariant as the unified editor: unserviceable equipment cannot stay
  // Available (and therefore cannot be assigned).
  const effectiveCondition =
    typeof data["condition"] === "string" ? data["condition"] : before.condition ?? null
  if (
    classifyCondition(effectiveCondition) === "unserviceable" &&
    (data["status"] === null || data["status"] === "available")
  ) {
    data["status"] = "maintenance"
  }

  try {
    const updated = await prisma.asset.update({
      where: { id },
      data,
      select: { id: true, account_code: true, article: true, status: true, location: true, quantity: true },
    });
    // Keep per-piece records in step when the declared quantity grows.
    await ensureAssetUnits(
      id,
      updated.quantity,
      typeof data["condition"] === "string" ? data["condition"] : before.condition ?? null
    ).catch(() => {});
    // Audit official-record write (who/role/action/id/before-after/timestamp).
    // Fire-and-forget so slow audit writes never block the mutation response.
    void import('@/lib/audit').then((m) =>
      m.writeAuditLog({
        userId: actor.userId!,
        action: 'asset:update',
        module: 'assets',
        details: { purpose: `Update asset ${before.account_code ?? before.id.slice(0, 8)}`, reference_id: id, before, after: updated },
      }).catch(() => {})
    ).catch(() => {});
    revalidatePath("/personnel/assets");
    revalidatePath(`/personnel/assets/${id}`);
    return { success: true, record: updated };
  } catch (e) {
    console.error("[updateAsset]", e);
    return { success: false, error: "Failed to update asset." };
  }
}

const STOCK_EDITABLE_KEYS = [
  "item_name",
  "category",
  "account_code",
  "quantity",
  "unit",
  "unit_cost",
  // NOTE: "reorder_threshold" is intentionally excluded — only Super Admin sets it.
  "location",
  "updated_at",
] as const;

export async function updateStock(
  _prevState: EditState,
  formData: FormData
): Promise<EditState> {
  try {
    const { requirePersonnelScope } = await import('@/lib/personnel-scope')
    await requirePersonnelScope()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Not authenticated.'
    return { success: false, error: msg.startsWith('Forbidden') ? 'Forbidden: Personnel only.' : 'Not authenticated.' }
  }
  const id = formData.get("id") as string;
  if (!id) {
    return { success: false, error: "Missing stock id." };
  }

  const data: Record<string, unknown> = {};

  for (const key of STOCK_EDITABLE_KEYS) {
    const raw = formData.get(key);
    if (raw === null || raw === undefined || raw === "") {
      data[key] = null;
      continue;
    }
    const val = raw as string;
    if (key === "quantity") {
      const n = Number(val);
      data[key] = Number.isNaN(n) ? null : n;
    } else if (key === "unit_cost") {
      const n = Number(val);
      data[key] = Number.isNaN(n) || n < 0 ? null : n;
    } else if (key === "updated_at") {
      const d = new Date(val);
      data[key] = Number.isNaN(d.getTime()) ? null : d;
    } else {
      data[key] = val;
    }
  }

  // Strict mode: stock account codes and units must come from Master Data.
  if (data["account_code"] !== undefined && data["account_code"] !== null) {
    const code = String(data["account_code"]).trim();
    if (code) {
      const hit = await findCatalogEntry(code);
      if (!hit) {
        return {
          success: false,
          error: `Unknown ACCOUNT CODE "${code}" — ask your Super Admin to add it to Master Data.`,
        };
      }
      data["account_code"] = hit.code;
    }
  }
  if (data["unit"] !== undefined && data["unit"] !== null) {
    const unitRaw = String(data["unit"]).trim();
    if (unitRaw) {
      const canonical = await resolveUnitName(unitRaw);
      if (!canonical) {
        return {
          success: false,
          error: `Unknown UNIT "${unitRaw}" — ask your Super Admin to add it to Master Data.`,
        };
      }
      data["unit"] = canonical;
    }
  }

  try {
    const updated = await prisma.inventoryItem.update({
      where: { id },
      data,
      select: { id: true, item_name: true, account_code: true, quantity: true, location: true },
    });
    void import('@/lib/personnel-scope').then(async (m) => {
      try {
        const scope = await m.getPersonnelScope();
        if (scope.userId) {
          const { writeAuditLog } = await import('@/lib/audit');
          await writeAuditLog({
            userId: scope.userId,
            action: 'stock:update',
            module: 'assets',
            details: { purpose: `Update stock ${id.slice(0, 8)}`, reference_id: id, after: updated },
          }).catch(() => {});
        }
      } catch { /* audit never blocks */ }
    }).catch(() => {});
    revalidatePath("/personnel/assets");
    revalidatePath(`/personnel/assets/stock/${id}`);
    return { success: true, record: updated };
  } catch (e) {
    console.error("[updateStock]", e);
    return { success: false, error: "Failed to update stock item." };
  }
}

export interface UnifiedAssetsPageOpts {
  page?: number
  /** Window size (default PAGE_SIZE, clamped 1..1000). UI lists omit it. */
  pageSize?: number
  q?: string
  status?: string
  source?: string
  condition?: string
  unit?: string
  category?: string
  /**
   * Registry origin tab:
   * - `added` (default) — rows registered in the `assets` table (manual add /
   *   Excel import / direct edits).
   * - `inspected` — asset-kind lots a passed inspection stocked into
   *   inventory (`delivery_kind = 'asset'` + a passed delivery item match).
   */
  origin?: string
  /** Skip QR hydration (documents tab blanks QR anyway) — faster window. */
  slim?: boolean
}

/** Distinct filter options for the registry dropdowns (bounded). */
export async function getAssetFilterOptions(): Promise<{
  statuses: string[]
  conditions: string[]
  units: string[]
  categories: string[]
}> {
  const { withCache, cacheKey } = await import('@/lib/personnel-cache')
  return withCache(cacheKey('personnel:asset-filter-options'), 300, async () => {
    try {
      const [statuses, conditions, units, categories] = await Promise.all([
        prisma.$queryRaw<Array<{ v: string | null }>>`
          SELECT DISTINCT status AS v FROM assets WHERE status IS NOT NULL ORDER BY 1 LIMIT 100`
          .catch(() => []),
        prisma.$queryRaw<Array<{ v: string | null }>>`
          SELECT DISTINCT condition AS v FROM assets WHERE condition IS NOT NULL ORDER BY 1 LIMIT 100`
          .catch(() => []),
        prisma.$queryRaw<Array<{ v: string | null }>>`
          SELECT DISTINCT unit AS v FROM assets WHERE unit IS NOT NULL ORDER BY 1 LIMIT 100`
          .catch(() => []),
        getCategories().catch(() => [] as string[]),
      ])
      const clean = (rows: Array<{ v: string | null }>) =>
        [...new Set(rows.map((r) => (r.v ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
      return {
        statuses: clean(statuses),
        conditions: clean(conditions),
        units: clean(units),
        categories,
      }
    } catch (e) {
      console.error('[getAssetFilterOptions]', e)
      return { statuses: [], conditions: [], units: [], categories: [] }
    }
  })
}

/**
 * Server-paginated unified registry window (defaults to PAGE_SIZE = 10;
 * the personnel registry loads one bounded window — up to 1000 rows — and
 * filters/pages it in memory for instant search).
 *
 * Single raw-SQL UNION ALL over assets + inventory with ORDER BY + LIMIT /
 * OFFSET and COUNT(*) OVER() — one DB round-trip for the window AND the
 * exact filtered total (no separate count query, no 2000-row preload, no
 * in-memory merge/sort). Exact filters (status/condition/unit/category) are
 * pushed into each branch so the new indexes apply; text search runs over
 * the same haystack as the registry UI (native columns + custom_fields
 * bag text, LIKE-escaped). Custom bags + QR hydrate for the 15 visible
 * rows only.
 *
 * Two documented deltas vs the old in-memory merge:
 * - Sort uses DB collation on the same key (article ?? account_code ??
 *   category ?? id) instead of JS localeCompare — equivalent ordering for
 *   registry text.
 * - A q containing spaces matches per-column (OR) rather than across the
 *   joined haystack — strictly narrower, never broader.
 */
export async function getUnifiedAssetsPage(
  opts: UnifiedAssetsPageOpts = {}
): Promise<{ rows: UnifiedAssetRow[]; total: number; data: UnifiedAssetRow[]; page: number; pageSize: number; totalPages: number }> {
  const { withScopedCache } = await import('@/lib/personnel-cache')
  const { PAGE_SIZE } = await import('@/lib/constants')
  const { parsePage, parseQuery, clampPage, totalPagesFor, escapeLike } = await import('@/lib/paged')
  const { parseCustomBagText } = await import('@/lib/custom-bag')
  const { Prisma } = await import('@prisma/client')
  const page = parsePage(opts.page)
  const rawSize = Math.floor(Number(opts.pageSize))
  const pageSize = Number.isFinite(rawSize) ? Math.min(Math.max(rawSize, 1), 1000) : PAGE_SIZE
  const q = parseQuery(opts.q)
  const status = (opts.status ?? 'all').trim().toLowerCase()
  const source = (opts.source ?? 'all').trim().toLowerCase()
  const condition = (opts.condition ?? 'all').trim().toLowerCase()
  const unit = (opts.unit ?? 'all').trim().toLowerCase()
  const category = (opts.category ?? 'all').trim().toLowerCase()
  const origin = (opts.origin ?? 'added').trim().toLowerCase() === 'inspected' ? 'inspected' : 'added'
  const slim = opts.slim === true
  // Fail-closed before cache: employee/anon never reach the global pool,
  // so one role never receives another role's cached page.
  try {
    const { getPersonnelScope } = await import('@/lib/personnel-scope')
    const scope = await getPersonnelScope()
    if (scope.isEmpty || !scope.isPersonnel) return { rows: [], data: [], total: 0, page: 1, pageSize, totalPages: 1 }
  } catch {
    return { rows: [], data: [], total: 0, page: 1, pageSize, totalPages: 1 }
  }
  return withScopedCache(
    'personnel:unified-assets-page',
    60,
    async () => {
      const empty = { rows: [], data: [], total: 0, page: 1, pageSize, totalPages: 1 } as {
        rows: UnifiedAssetRow[]; data: UnifiedAssetRow[]; total: number; page: number; pageSize: number; totalPages: number
      }
      try {
        // Stocks carry no status/condition of their own (they surface as
        // status 'available'): a status/condition filter excludes the branch,
        // matching the old in-memory semantics exactly.
        const inspected = origin === 'inspected'
        // Origin tabs: `added` is the asset register (assets table only);
        // `inspected` shows asset-kind lots stocked by a passed inspection.
        const wantAssets = !inspected && (source === 'all' || source === 'asset')
        const wantStocks = inspected || source === 'all' || source === 'stock'
        // Inspected lots are inventory rows; their condition/status live on the
        // linked asset record (same id) once the lot has been edited.
        if (!wantAssets && !wantStocks) return empty

        const like = q !== '' ? `%${escapeLike(q)}%` : null

        const assetConds: InstanceType<typeof Prisma.Sql>[] = []
        if (status !== 'all') assetConds.push(Prisma.sql`lower(a.status) = ${status}`)
        if (condition !== 'all') assetConds.push(Prisma.sql`lower(a.condition) = ${condition}`)
        if (unit !== 'all') assetConds.push(Prisma.sql`lower(a.unit) = ${unit}`)
        if (category !== 'all') assetConds.push(Prisma.sql`lower(a.category) = ${category}`)
        const stockConds: InstanceType<typeof Prisma.Sql>[] = []
        if (status !== 'all')
          stockConds.push(Prisma.sql`lower(COALESCE((SELECT a2.status FROM assets a2 WHERE a2.id = s.id LIMIT 1), 'available')) = ${status}`)
        if (condition !== 'all')
          stockConds.push(Prisma.sql`lower(COALESCE((SELECT a2.condition FROM assets a2 WHERE a2.id = s.id LIMIT 1), '')) = ${condition}`)
        if (unit !== 'all') stockConds.push(Prisma.sql`lower(s.unit) = ${unit}`)
        if (category !== 'all') stockConds.push(Prisma.sql`lower(s.category) = ${category}`)
        if (inspected) {
          // Asset-kind lots only, and only those a passed inspection fed —
          // the same (item_name, unit) match stocking uses.
          stockConds.push(Prisma.sql`s.delivery_kind = 'asset'`)
          stockConds.push(Prisma.sql`EXISTS (
            SELECT 1
            FROM delivery_items di
            JOIN inspections i ON i.delivery_id = di.delivery_id
            WHERE i.result = 'passed'
              AND lower(di.item_name) = lower(s.item_name)
              AND di.unit IS NOT DISTINCT FROM s.unit
          )`)
        }

        const assetCols = Prisma.sql`
          a.id::text AS id, 'asset' AS source,
          a.account_code, a.identifier, a.account_title, a.account_name,
          a.category, a.article, a.quantity, a.unit, a.description,
          a.date_acquired, a.location, a.total_cost, a.remarks, a.condition,
          a.unit_cost, a.end_user, a.brand, a.cylinders, a.engine_displacement,
          a.fuel_type, a.engine_number, a.chassis_number, a.color,
          a.plate_number, a.fund, a.status, a.dv_tracking_number,
          a.supplier_payee, a.account_name_charge, a.account_number,
          a.obr_number, a.dv_number, a.date_received, a.qr_code,
          a.created_at, a.assigned_to::text AS assigned_to,
          NULL::integer AS reorder_threshold, NULL::timestamptz AS updated_at,
          a.custom_fields::text AS custom_bag,
          COALESCE(a.article, a.account_code, a.category, a.id::text) AS sort_key`
        const stockCols = Prisma.sql`
          s.id::text AS id, 'stock' AS source,
          s.account_code, NULL::text AS identifier, NULL::text AS account_title,
          NULL::text AS account_name, s.category, s.item_name AS article,
          s.quantity, s.unit, NULL::text AS description,
          NULL::date AS date_acquired, s.location, NULL::numeric AS total_cost,
          NULL::text AS remarks,
          (SELECT a2.condition FROM assets a2 WHERE a2.id = s.id LIMIT 1) AS condition,
          s.unit_cost,
          NULL::text AS end_user, NULL::text AS brand, NULL::integer AS cylinders,
          NULL::text AS engine_displacement, NULL::text AS fuel_type,
          NULL::text AS engine_number, NULL::text AS chassis_number,
          NULL::text AS color, NULL::text AS plate_number, NULL::text AS fund,
          COALESCE((SELECT a2.status FROM assets a2 WHERE a2.id = s.id LIMIT 1), 'available') AS status,
          NULL::text AS dv_tracking_number,
          NULL::text AS supplier_payee, NULL::text AS account_name_charge,
          NULL::text AS account_number, NULL::text AS obr_number,
          NULL::text AS dv_number, NULL::date AS date_received,
          NULL::text AS qr_code, s.updated_at AS created_at,
          NULL::text AS assigned_to, s.reorder_threshold, s.updated_at,
          s.custom_fields::text AS custom_bag,
          COALESCE(s.item_name, s.account_code, s.category, s.id::text) AS sort_key`

        const branches: InstanceType<typeof Prisma.Sql>[] = []
        if (wantAssets) {
          branches.push(Prisma.sql`SELECT ${assetCols} FROM assets a ${
            assetConds.length > 0 ? Prisma.sql`WHERE ${Prisma.join(assetConds, ' AND ')}` : Prisma.empty
          }`)
        }
        if (wantStocks) {
          // A lot can exist in both tables under the same id. When the asset
          // branch is also present, list it once (as the registry asset).
          if (wantAssets) {
            stockConds.push(
              Prisma.sql`NOT EXISTS (SELECT 1 FROM assets a2 WHERE a2.id = s.id)`
            )
          }
          branches.push(Prisma.sql`SELECT ${stockCols} FROM inventory s ${
            stockConds.length > 0 ? Prisma.sql`WHERE ${Prisma.join(stockConds, ' AND ')}` : Prisma.empty
          }`)
        }
        const unionAll = Prisma.join(branches, ' UNION ALL ')
        const searchOrs = like
          ? Prisma.sql`(
              w.account_code ILIKE ${like} OR w.qr_code ILIKE ${like}
              OR w.category ILIKE ${like} OR w.account_title ILIKE ${like}
              OR w.account_name ILIKE ${like} OR w.identifier ILIKE ${like}
              OR w.article ILIKE ${like} OR w.description ILIKE ${like}
              OR w.location ILIKE ${like} OR w.remarks ILIKE ${like}
              OR w.brand ILIKE ${like} OR w.engine_displacement ILIKE ${like}
              OR w.fuel_type ILIKE ${like} OR w.engine_number ILIKE ${like}
              OR w.chassis_number ILIKE ${like} OR w.color ILIKE ${like}
              OR w.plate_number ILIKE ${like} OR w.fund ILIKE ${like}
              OR w.status ILIKE ${like} OR w.condition ILIKE ${like}
              OR w.unit ILIKE ${like} OR w.dv_tracking_number ILIKE ${like}
              OR w.supplier_payee ILIKE ${like} OR w.account_name_charge ILIKE ${like}
              OR w.account_number ILIKE ${like} OR w.obr_number ILIKE ${like}
              OR w.dv_number ILIKE ${like} OR w.custom_bag ILIKE ${like}
            )`
          : null
        const whereOuter = searchOrs ? Prisma.sql`WHERE ${searchOrs}` : Prisma.empty

        interface UnionRawRow {
          id: string
          source: 'asset' | 'stock'
          account_code: string | null
          identifier: string | null
          account_title: string | null
          account_name: string | null
          category: string | null
          article: string | null
          quantity: unknown
          unit: string | null
          description: string | null
          date_acquired: Date | string | null
          location: string | null
          total_cost: unknown
          remarks: string | null
          condition: string | null
          unit_cost: unknown
          end_user: string | null
          brand: string | null
          cylinders: unknown
          engine_displacement: string | null
          fuel_type: string | null
          engine_number: string | null
          chassis_number: string | null
          color: string | null
          plate_number: string | null
          fund: string | null
          status: string | null
          dv_tracking_number: string | null
          supplier_payee: string | null
          account_name_charge: string | null
          account_number: string | null
          obr_number: string | null
          dv_number: string | null
          date_received: Date | string | null
          qr_code: string | null
          created_at: Date | string | null
          assigned_to: string | null
          reorder_threshold: unknown
          updated_at: Date | string | null
          custom_bag: string | null
          full_count: bigint
        }

        const isoDay = (v: Date | string | null): string | null => {
          if (!v) return null
          const d = v instanceof Date ? v : new Date(v)
          if (Number.isNaN(d.getTime())) return null
          return d.toISOString().slice(0, 10)
        }
        const isoFull = (v: Date | string | null): string | null => {
          if (!v) return null
          const d = v instanceof Date ? v : new Date(v)
          if (Number.isNaN(d.getTime())) return null
          return d.toISOString()
        }
        const num = (v: unknown): number | null => {
          if (v === null || v === undefined) return null
          const n = Number(v)
          return Number.isFinite(n) ? n : null
        }
        const intOrNull = (v: unknown): number | null => {
          const n = num(v)
          return n === null ? null : Math.trunc(n)
        }

        const toUnified = (r: Omit<UnionRawRow, 'full_count' | 'sort_key'> & { sort_key?: string }): UnifiedAssetRow => {
          const bag = parseCustomBagText(r.custom_bag)
          if (r.source === 'stock') {
            const stockUnitCost = num(r.unit_cost)
            const stockQty = intOrNull(r.quantity) ?? 0
            return {
              ...mapStockToUnified({
                id: r.id,
                item_name: r.article,
                category: r.category,
                account_code: r.account_code,
                quantity: stockQty,
                unit: r.unit,
                unit_cost: stockUnitCost,
                total_cost: stockUnitCost != null ? stockUnitCost * stockQty : null,
                reorder_threshold: intOrNull(r.reorder_threshold),
                location: r.location,
                updated_at: isoFull(r.updated_at ?? r.created_at),
                qr_data_url: '',
                custom_fields: bag,
              } as StockRow),
              // Condition/status come from the linked asset record (same id);
              // mapStockToUnified defaults them for un-edited lots.
              condition: r.condition,
              status: r.status ?? 'available',
            }
          }
          return mapAssetToUnified({
            id: r.id,
            account_code: r.account_code,
            identifier: r.identifier,
            account_title: r.account_title,
            account_name: r.account_name,
            category: r.category,
            article: r.article,
            quantity: intOrNull(r.quantity),
            unit: r.unit,
            description: r.description,
            date_acquired: isoDay(r.date_acquired),
            location: r.location,
            total_cost: num(r.total_cost),
            remarks: r.remarks,
            condition: r.condition,
            unit_cost: num(r.unit_cost),
            end_user: r.end_user,
            brand: r.brand,
            cylinders: intOrNull(r.cylinders),
            engine_displacement: r.engine_displacement,
            fuel_type: r.fuel_type,
            engine_number: r.engine_number,
            chassis_number: r.chassis_number,
            color: r.color,
            plate_number: r.plate_number,
            fund: r.fund,
            status: r.status,
            dv_tracking_number: r.dv_tracking_number,
            supplier_payee: r.supplier_payee,
            account_name_charge: r.account_name_charge,
            account_number: r.account_number,
            obr_number: r.obr_number,
            dv_number: r.dv_number,
            date_received: isoDay(r.date_received),
            qr_code: r.qr_code,
            created_at: isoFull(r.created_at),
            assigned_to: r.assigned_to,
            qr_data_url: '',
            custom_fields: bag,
          } as AssetRow)
        }

        const runWindow = (offset: number) =>
          prisma.$queryRaw<UnionRawRow[]>`
            SELECT w.*, COUNT(*) OVER() AS full_count
            FROM (${unionAll}) w ${whereOuter}
            ORDER BY w.sort_key ASC
            LIMIT ${pageSize} OFFSET ${offset}`.catch(() => [] as UnionRawRow[])

        let offset = (page - 1) * pageSize
        let raw = await runWindow(offset)
        let total = raw.length > 0 ? Number(raw[0]?.full_count ?? 0) : 0
        // Out-of-range deep link (hand-edited ?page=): recount cheaply once
        // and re-run on the clamped page instead of showing an empty window.
        if (raw.length === 0 && page > 1) {
          const counted = await prisma.$queryRaw<Array<{ count: bigint }>>`
            SELECT COUNT(*)::bigint AS count FROM (${unionAll}) w ${whereOuter}`.catch(
            () => [] as Array<{ count: bigint }>
          )
          total = Number(counted[0]?.count ?? 0)
          if (total > 0) {
            offset = (clampPage(page, Math.max(1, total)) - 1) * pageSize
            raw = await runWindow(offset)
          }
        }
        const safePage = clampPage(total > 0 ? Math.floor(offset / pageSize) + 1 : 1, Math.max(1, total))
        const totalPages = totalPagesFor(total, pageSize)
        const mapped = raw.map((r) => toUnified(r))
        // Assigned employees — the holder on the asset record plus everyone a
        // PAR/ICS was issued to. Two extra queries for the whole window.
        let enriched = mapped
        if (mapped.length > 0) {
          try {
            const ids = mapped.map((row) => row.id)
            const idList = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))
            // Consolidated PAR/ICS docs leave the FK columns null and keep the
            // items in issuance_data.lines[], so match those too.
            const textList = Prisma.join(ids.map((id) => Prisma.sql`${id}::text`))
            const issued = await prisma
              .$queryRaw<
                Array<{
                  asset_id: string | null
                  inventory_id: string | null
                  employee_id: string
                  doc_type: string | null
                  doc_no: string | null
                  doc_date: Date | string | null
                  issuance_data: Record<string, unknown> | null
                }>
              >`SELECT asset_id::text AS asset_id, inventory_id::text AS inventory_id,
                       employee_id::text AS employee_id, doc_type, doc_no, doc_date,
                       issuance_data
                 FROM issuance_records
                 WHERE asset_id IN (${idList}) OR inventory_id IN (${idList})
                    OR EXISTS (
                      SELECT 1
                      FROM jsonb_array_elements(
                        CASE
                          WHEN jsonb_typeof(issuance_data->'lines') = 'array'
                          THEN issuance_data->'lines'
                          ELSE '[]'::jsonb
                        END
                      ) line
                      WHERE line->>'assetId' IN (${textList})
                         OR line->>'inventoryId' IN (${textList})
                    )
                 ORDER BY created_at DESC`.catch(() => [])
            const lineItemIds = (data: Record<string, unknown> | null): string[] => {
              const lines = data?.lines
              if (!Array.isArray(lines)) return []
              return lines.flatMap((line) => {
                const l = line as { assetId?: unknown; inventoryId?: unknown } | null
                return [l?.assetId, l?.inventoryId].filter(
                  (v): v is string => typeof v === 'string' && v.length > 0
                )
              })
            }
            const need = new Set<string>()
            for (const r of issued) if (r.employee_id) need.add(r.employee_id)
            for (const a of mapped) if (a.assigned_to) need.add(a.assigned_to)
            const names = new Map<string, string>()
            if (need.size > 0) {
              const profiles = await prisma.profile
                .findMany({
                  where: { id: { in: [...need] } },
                  select: { id: true, full_name: true },
                })
                .catch(() => [])
              for (const p of profiles) names.set(p.id, p.full_name ?? 'Unknown employee')
            }
            const byItem = new Map<string, AssetAssignee[]>()
            for (const r of issued) {
              const itemIds = [
                r.asset_id,
                r.inventory_id,
                ...lineItemIds(r.issuance_data),
              ].filter((v): v is string => typeof v === 'string' && v.length > 0)
              for (const itemId of itemIds) {
                const list = byItem.get(itemId) ?? []
                if (list.some((a) => a.id === r.employee_id)) continue
                list.push({
                  id: r.employee_id,
                  name: names.get(r.employee_id) ?? 'Unknown employee',
                  doc_type: r.doc_type,
                  doc_no: r.doc_no,
                  date: isoDay(r.doc_date),
                  current: false,
                })
                byItem.set(itemId, list)
              }
            }
            enriched = mapped.map((row) => {
              const list = [...(byItem.get(row.id) ?? [])]
              if (row.assigned_to) {
                const idx = list.findIndex((a) => a.id === row.assigned_to)
                if (idx >= 0) {
                  list[idx] = { ...list[idx], current: true }
                } else {
                  const name = names.get(row.assigned_to)
                  if (name) {
                    list.unshift({
                      id: row.assigned_to,
                      name,
                      doc_type: null,
                      doc_no: null,
                      date: null,
                      current: true,
                    })
                  }
                }
              }
              return { ...row, assignees: list }
            })
          } catch {
            /* keep rows without assignee detail */
          }
        }
        if (slim) {
          const slimRows = enriched.map((a) => ({ ...a, qr_data_url: '' }))
          return { rows: slimRows, data: slimRows, total, page: safePage, pageSize, totalPages }
        }
        // Hydrate QR only for the visible window (10).
        const rows = await Promise.all(
          enriched.map(async (a) => ({
            ...a,
            qr_data_url:
              a.source === 'asset'
                ? await generateAssetQrDataUrl(a.id).catch(() => '')
                : await generateStockQrDataUrl(a.id).catch(() => ''),
          }))
        )
        return { rows, data: rows, total, page: safePage, pageSize, totalPages }
      } catch (e) {
        console.error('[getUnifiedAssetsPage]', e)
        return { rows: [], data: [], total: 0, page: 1, pageSize, totalPages: 1 }
      }
    },
    { page, pageSize, q, status, source, condition, unit, category, origin, slim }
  )
}

/**
 * Fill missing Account Title / Account Name from Master Data. Asset rows
 * normally store both; stock lots only carry the title inside
 * `custom_fields`, and rows stocked before that existed have neither — the
 * catalog row (exact code or the base of a generated sequence) supplies them.
 */
async function withCatalogLabels(row: UnifiedAssetRow): Promise<UnifiedAssetRow> {
  if (row.account_title && row.account_name) return row
  const catalog = await catalogForAccountCode(row.account_code)
  if (!catalog) return row
  return {
    ...row,
    account_title: row.account_title ?? catalog.account_title ?? null,
    account_name: row.account_name ?? catalog.account_name ?? null,
  }
}

export async function getUnifiedAsset(id: string): Promise<UnifiedAssetRow | null> {
  try {
    const asset = await getAsset(id);
    if (asset) {
      return withCatalogLabels(mapAssetToUnified(asset));
    }

    const stock = await getStock(id);
    if (stock) {
      return withCatalogLabels(mapStockToUnified(stock));
    }

    return null;
  } catch (e) {
    console.error("[getUnifiedAsset]", e);
    return null;
  }
}

// ─── Per-piece units (unique item code + QR tag) ─────────────────────────────

export interface AssetUnitRow {
  id: string;
  item_code: string;
  status: string | null;
  condition: string | null;
  assigned_to: string | null;
  holder_name: string | null;
  assigned_at: string | null;
  created_at: string | null;
  qr_data_url: string;
}

/**
 * Every tracked piece of an asset/inventory lot, each with its own item code,
 * holder, and QR image. Unit codes are immutable; assignment stamps the holder
 * and issuance on the piece.
 */
export async function getAssetUnits(recordId: string): Promise<AssetUnitRow[]> {
  if (!recordId) return [];
  try {
    const { getPersonnelScope } = await import("@/lib/personnel-scope");
    const scope = await getPersonnelScope();
    if (scope.isEmpty || !scope.isPersonnel) return [];

    const asset = await prisma.asset
      .findUnique({ where: { id: recordId }, select: { id: true, condition: true, quantity: true } })
      .catch(() => null);
    const inventory = await prisma.inventoryItem
      .findUnique({ where: { id: recordId }, select: { id: true, quantity: true } })
      .catch(() => null);
    // A stock row can share its id with a linked registry asset. Prefer the
    // asset's tags only while both records describe the same quantity (see
    // normalizeRef in lib/asset-units); otherwise fall back to the row's own
    // inventory tags.
    const useAsset =
      !!asset &&
      (!inventory ||
        (asset.quantity !== null &&
          inventory.quantity !== null &&
          asset.quantity === inventory.quantity));
    if (!asset && !inventory) return [];

    const units = await prisma.assetUnit
      .findMany({
        where: useAsset ? { asset_id: asset!.id } : { inventory_id: inventory!.id },
        orderBy: [{ assigned_at: "desc" }, { created_at: "asc" }],
        take: 500,
        select: {
          id: true,
          item_code: true,
          status: true,
          condition: true,
          assigned_to: true,
          assigned_at: true,
          created_at: true,
        },
      })
      .catch(() => []);

    const holderIds = [
      ...new Set(units.map((u) => u.assigned_to).filter((v): v is string => !!v)),
    ];
    const holders =
      holderIds.length > 0
        ? await prisma.profile
            .findMany({
              where: { id: { in: holderIds } },
              select: { id: true, full_name: true },
            })
            .catch(() => [])
        : [];
    const names = new Map(holders.map((p) => [p.id, p.full_name ?? "Unknown employee"]));

    return await Promise.all(
      units.map(async (u) => ({
        id: u.id,
        item_code: u.item_code,
        status: u.status,
        condition: u.condition ?? asset?.condition ?? null,
        assigned_to: u.assigned_to,
        holder_name: u.assigned_to ? names.get(u.assigned_to) ?? "Unknown employee" : null,
        assigned_at: u.assigned_at?.toISOString() ?? null,
        created_at: u.created_at?.toISOString() ?? null,
        qr_data_url: await generateAssetUnitQrDataUrl(u.id).catch(() => ""),
      }))
    );
  } catch (e) {
    console.error("[getAssetUnits]", e);
    return [];
  }
}

// ─── Asset history (assignments, repairs — each with its receipt) ────────────

export interface AssetHistoryRepair {
  id: string;
  asset_id: string;
  asset_label: string | null;
  account_code: string | null;
  account_title: string | null;
  asset_type: string | null;
  reported_by: string;
  reporter_name: string;
  repair_date: string;
  description: string;
  status: string | null;
  cost: number | null;
  technician: string | null;
  created_at: string | null;
}

export interface AssetHistoryIssuance {
  id: string;
  doc_type: string;
  doc_no: string | null;
  doc_date: string | null;
  employee_id: string;
  employee_name: string;
  quantity: number;
  total_amount: number | null;
  created_at: string | null;
  /** Personnel who recorded/approved the assignment (issuance_records.created_by). */
  assigned_by_name: string | null;
  /** Set when the assignment was driven by an employee request. */
  request_id: string | null;
  /** "request" — approved request produced this; "direct" — walk-in issuance. */
  source: "request" | "direct";
  /** Issuance purpose/description stored with the document snapshot. */
  purpose: string | null;
  /** Unit of measure from the document snapshot. */
  unit: string | null;
}

export interface AssetHistoryRequest {
  id: string;
  request_type: string;
  status: string | null;
  date_requested: string | null;
  date_resolved: string | null;
  employee_id: string;
  employee_name: string;
  description: string;
  /** Personnel the request was routed to (the one who approved/handled it). */
  handled_by_name: string | null;
}

export interface AssetHistory {
  /** Current holder (assigned_to profile), or null when available. */
  assignedToName: string | null;
  repairs: AssetHistoryRepair[];
  issuances: AssetHistoryIssuance[];
  requests: AssetHistoryRequest[];
}

/**
 * Everything that ever happened to one asset: current assignment, PAR/ICS
 * issuances, and repair tickets — newest first. Receipts render from these
 * rows (issuance sheets load on demand via getIssuance).
 */
export async function getAssetHistory(id: string): Promise<AssetHistory> {
  const empty: AssetHistory = {
    assignedToName: null,
    repairs: [],
    issuances: [],
    requests: [],
  };
  if (!id) return empty;
  try {
    // The registry mixes real assets with stock (inventory) lots — both open
    // the same detail page, so history must resolve either record.
    const [asset, stock] = await Promise.all([
      prisma.asset
        .findUnique({
          where: { id },
          select: {
            id: true,
            qr_code: true,
            account_code: true,
            article: true,
            description: true,
            account_title: true,
            category: true,
            assigned_to: true,
          },
        })
        .catch(() => null),
      prisma.inventoryItem
        .findUnique({
          where: { id },
          select: {
            id: true,
            item_name: true,
            account_code: true,
            category: true,
            unit: true,
            location: true,
          },
        })
        .catch(() => null),
    ]);
    if (!asset && !stock) return empty;

    const labelBits = (
      asset
        ? [asset.qr_code ?? asset.account_code, asset.article, asset.description]
        : [stock?.account_code, stock?.item_name]
    ).filter(Boolean) as string[];
    const assetLabel = labelBits.length > 0 ? labelBits.join(" — ").slice(0, 80) : "Asset";

    const [repairs, issuanceDbRows, requestRows, requestLines, profiles] = await Promise.all([
      prisma.repair
        .findMany({
          where: { asset_id: id },
          orderBy: { created_at: "desc" },
          take: 50,
          select: {
            id: true,
            reported_by: true,
            description: true,
            status: true,
            technician: true,
            repair_date: true,
            cost: true,
            created_at: true,
          },
        })
        .catch(() => []),
      // Scoped issuance rows — direct asset match in SQL (multi-line docs
      // keep the asset inside issuance_data.lines[], filtered in JS below
      // on this bounded window instead of the whole table).
      prisma.$queryRaw<
        Array<{
          id: string;
          doc_type: string;
          doc_no: string | null;
          doc_date: Date | string | null;
          asset_id: string | null;
          inventory_id: string | null;
          employee_id: string;
          request_id: string | null;
          quantity: number;
          total_amount: unknown;
          issuance_data: Record<string, unknown> | null;
          created_by: string | null;
          created_at: Date | string | null;
        }>
      >`SELECT id::text AS id, doc_type, doc_no, doc_date,
              asset_id::text AS asset_id,
              inventory_id::text AS inventory_id,
              employee_id::text AS employee_id,
              request_id::text AS request_id, quantity, total_amount,
              issuance_data, created_by::text AS created_by, created_at
       FROM issuance_records
       WHERE asset_id = ${id}::uuid OR inventory_id = ${id}::uuid
       ORDER BY created_at DESC LIMIT 50`.catch(() => []),
      // Requests naming this asset (directly or via line items) — approvals
      // assign assets without necessarily creating an issuance row.
      prisma.request
        .findMany({
          where: { asset_id: id },
          orderBy: { date_requested: "desc" },
          take: 50,
          select: {
            id: true,
            request_type: true,
            status: true,
            date_requested: true,
            date_resolved: true,
            employee_id: true,
            recipient_id: true,
            asset_id: true,
            description: true,
          },
        })
        .catch(() => []),
      prisma.requestItem
        .findMany({ where: { asset_id: id }, select: { request_id: true, asset_id: true }, take: 50 })
        .catch(() => [] as { request_id: string; asset_id: string | null }[]),
      prisma.profile
        .findMany({
          where: { id: { in: [asset?.assigned_to].filter(Boolean) as string[] } },
          select: { id: true, full_name: true },
        })
        .catch(() => [] as { id: string; full_name: string | null }[]),
    ]);

    const names = new Map(profiles.map((p) => [p.id, p.full_name ?? "Unknown"]));
    const isoDate = (v: Date | string | null) => {
      if (!v) return null;
      const d = v instanceof Date ? v : new Date(v);
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    };
    const isoDateTime = (v: Date | string | null) => {
      if (!v) return null;
      const d = v instanceof Date ? v : new Date(v);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    };
    const num = (v: unknown) => {
      if (v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const lineAssetIds = (data: Record<string, unknown> | null): string[] => {
      try {
        const lines = (data as { lines?: unknown } | null)?.lines;
        if (!Array.isArray(lines)) return [];
        return lines.flatMap((l) => {
          const line = l as { assetId?: unknown; inventoryId?: unknown } | null;
          return [line?.assetId, line?.inventoryId].filter(
            (v): v is string => typeof v === "string" && v.length > 0
          );
        });
      } catch {
        return [];
      }
    };

    const matchedIssuances = issuanceDbRows.filter(
      (r) =>
        r.asset_id === id ||
        r.inventory_id === id ||
        lineAssetIds(r.issuance_data).includes(id)
    );

    const requestIdsForAsset = new Set(
      requestLines
        .filter((l) => l.asset_id === id)
        .map((l) => l.request_id)
    );
    let matchedRequests = requestRows.filter(
      (r) => r.asset_id === id || requestIdsForAsset.has(r.id)
    );
    // Line-linked requests not in the direct-match window — fetch by id.
    const missingRequestIds = [...requestIdsForAsset].filter(
      (rid) => !matchedRequests.some((r) => r.id === rid)
    ).slice(0, 20)
    if (missingRequestIds.length > 0) {
      try {
        const extra = await prisma.request.findMany({
          where: { id: { in: missingRequestIds } },
          select: {
            id: true,
            request_type: true,
            status: true,
            date_requested: true,
            date_resolved: true,
            employee_id: true,
            recipient_id: true,
            asset_id: true,
            description: true,
          },
        })
        matchedRequests = [...matchedRequests, ...extra]
      } catch { /* keep direct matches */ }
    }
    // Names for everyone referenced on this sheet (bounded id list).
    try {
      const need = new Set<string>()
      if (asset?.assigned_to) need.add(asset.assigned_to)
      for (const r of repairs) if (r.reported_by) need.add(r.reported_by as string)
      for (const r of matchedIssuances) {
        if (r.employee_id) need.add(r.employee_id)
        if (r.created_by) need.add(r.created_by)
      }
      for (const r of matchedRequests) {
        if (r.employee_id) need.add(r.employee_id)
        if (r.recipient_id) need.add(r.recipient_id)
      }
      const have = new Set(profiles.map((p) => p.id))
      const missing = [...need].filter((nid) => !have.has(nid)).slice(0, 100)
      if (missing.length > 0) {
        const extra = await prisma.profile
          .findMany({ where: { id: { in: missing } }, select: { id: true, full_name: true } })
          .catch(() => [])
        for (const p of extra) {
          profiles.push(p)
          names.set(p.id, p.full_name ?? 'Unknown')
        }
      }
    } catch { /* names fall back to Unknown */ }

    return {
      // A stock lot has no `assigned_to`; the holder is whoever received the
      // most recent PAR/ICS on it.
      assignedToName: asset?.assigned_to
        ? (names.get(asset.assigned_to) ?? null)
        : matchedIssuances.length > 0
          ? (names.get(matchedIssuances[0].employee_id) ?? null)
          : null,
      repairs: repairs.map((r) => ({
        id: r.id,
        asset_id: id,
        asset_label: assetLabel,
        account_code: asset?.account_code ?? stock?.account_code ?? null,
        account_title: asset?.account_title ?? null,
        asset_type: asset?.category ?? stock?.category ?? null,
        reported_by: r.reported_by,
        reporter_name: names.get(r.reported_by) ?? "Unknown employee",
        repair_date: r.repair_date.toISOString().slice(0, 10),
        description: r.description,
        status: r.status,
        cost: num(r.cost),
        technician: r.technician,
        created_at: r.created_at ? isoDateTime(r.created_at) : null,
      })),
      issuances: matchedIssuances.map((r) => {
        const data = (r.issuance_data ?? {}) as {
          description?: unknown;
          unit?: unknown;
        };
        return {
          id: r.id,
          doc_type: r.doc_type,
          doc_no: r.doc_no,
          doc_date: isoDate(r.doc_date),
          employee_id: r.employee_id,
          employee_name: names.get(r.employee_id) ?? "Unknown employee",
          quantity: r.quantity,
          total_amount: num(r.total_amount),
          created_at: isoDateTime(r.created_at),
          assigned_by_name: r.created_by
            ? (names.get(r.created_by) ?? "Unknown personnel")
            : null,
          request_id: r.request_id,
          source: r.request_id ? ("request" as const) : ("direct" as const),
          purpose:
            typeof data.description === "string" && data.description.trim() !== ""
              ? data.description.trim()
              : null,
          unit:
            typeof data.unit === "string" && data.unit.trim() !== ""
              ? data.unit.trim()
              : null,
        };
      }),
      requests: matchedRequests.map((r) => ({
        id: r.id,
        request_type: r.request_type,
        status: r.status,
        date_requested: r.date_requested ? isoDateTime(r.date_requested) : null,
        date_resolved: r.date_resolved ? isoDateTime(r.date_resolved) : null,
        employee_id: r.employee_id,
        employee_name: names.get(r.employee_id) ?? "Unknown employee",
        description: r.description,
        handled_by_name: r.recipient_id
          ? (names.get(r.recipient_id) ?? null)
          : null,
      })),
    };
  } catch (e) {
    console.error("[getAssetHistory]", e);
    return empty;
  }
}

export async function updateUnifiedAsset(
  _prevState: EditState,
  formData: FormData
): Promise<EditState> {
  let actor: { userId: string | null };
  try {
    const { requirePersonnelScope } = await import('@/lib/personnel-scope')
    actor = await requirePersonnelScope()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Not authenticated.'
    return { success: false, error: msg.startsWith('Forbidden') ? 'Forbidden: Personnel only.' : 'Not authenticated.' }
  }
  const id = String(formData.get("id") ?? "").trim().slice(0, 36);
  if (!id) {
    return { success: false, error: "Missing asset id." };
  }

  const source = formData.get("source") as string;

  const data: Record<string, unknown> = {};

  for (const key of ASSET_EDITABLE_KEYS) {
    const raw = formData.get(key);
    if (raw === null || raw === undefined || raw === "") {
      data[key] = null;
      continue;
    }
    const val = String(raw).trim().slice(0, 500);
    if (NUMERIC_KEYS.has(key)) {
      const n = Number(val);
      data[key] = Number.isNaN(n) ? null : n;
    } else if (DECIMAL_KEYS.has(key)) {
      const n = Number(val);
      data[key] = Number.isNaN(n) ? null : n;
    } else if (DATE_KEYS.has(key)) {
      const d = new Date(val);
      data[key] = Number.isNaN(d.getTime()) ? null : d;
    } else {
      data[key] = val;
    }
  }

  // Strict mode: known account codes snap Title + Type to the approved
  // Master Data row so edits can't desync the triple. A code that isn't in the
  // catalog yet is added from the values just submitted (existing rows are
  // never edited), so saving never waits on a Super Admin.
  if (data["account_code"] !== undefined && data["account_code"] !== null) {
    const code = String(data["account_code"]).trim();
    if (code) {
      const ensured = await ensureCatalogEntry({
        code,
        title: typeof data["account_title"] === "string" ? data["account_title"] : null,
        type: typeof data["category"] === "string" ? data["category"] : null,
        name: typeof data["account_name"] === "string" ? data["account_name"] : null,
        createdBy: actor.userId,
      });
      if (!ensured.ok) {
        return { success: false, error: ensured.error };
      }
      data["account_code"] = ensured.entry.code;
      data["account_title"] = ensured.entry.title;
      data["category"] = ensured.entry.type;
    }
  }
  if (data["unit"] !== undefined && data["unit"] !== null) {
    const unitRaw = String(data["unit"]).trim();
    if (unitRaw) {
      const canonical = await resolveUnitName(unitRaw);
      if (!canonical) {
        return {
          success: false,
          error: `Unknown UNIT "${unitRaw}" — ask your Super Admin to add it to Master Data.`,
        };
      }
      data["unit"] = canonical;
    }
  }

  const before = await prisma.asset
    .findUnique({
      where: { id },
      select: {
        id: true,
        account_code: true,
        article: true,
        assigned_to: true,
        quantity: true,
        condition: true,
      },
    })
    .catch(() => null);

  // Unserviceable equipment can never be "available" (and therefore never
  // assignable). Save-time guard: if the record is unserviceable, force the
  // status off Available — maintenance is the safe holding state until it is
  // marked serviceable again.
  const effectiveCondition =
    typeof data["condition"] === "string" ? data["condition"] : before?.condition ?? null;
  if (
    classifyCondition(effectiveCondition) === "unserviceable" &&
    (data["status"] === null || data["status"] === "available")
  ) {
    data["status"] = "maintenance";
  }

  // An issued unit is owned by its PAR/ICS. Quantity, unit, status and end
  // user must stay in sync with the accountability document, so they are not
  // editable once the item is assigned — the stored values win.
  const issuedCount = await prisma.issuanceRecord
    .count({
      where: { OR: [{ asset_id: id }, { inventory_id: id }] },
    })
    .catch(() => 0);
  const stockRow =
    source === "stock"
      ? await prisma.inventoryItem
          .findUnique({ where: { id }, select: { quantity: true } })
          .catch(() => null)
      : null;
  const assigned =
    !!before?.assigned_to ||
    issuedCount > 0 ||
    (before?.quantity != null && before.quantity <= 0) ||
    (stockRow?.quantity != null && stockRow.quantity <= 0);
  if (assigned) {
    for (const key of ASSIGNED_LOCKED_KEYS) delete data[key];
  }

  try {
    if (source === "stock") {
      // Sync stock-specific fields back to InventoryItem
      const stockData: Record<string, unknown> = {};
      const itemName = formData.get("article") as string | null;
      if (itemName) stockData["item_name"] = String(itemName).trim().slice(0, 500);
      const unit = assigned ? null : (formData.get("unit") as string | null);
      if (unit) {
        const canonical = await resolveUnitName(unit);
        if (!canonical) {
          return {
            success: false,
            error: `Unknown UNIT "${String(unit).trim().slice(0, 100)}" — ask your Super Admin to add it to Master Data.`,
          };
        }
        stockData["unit"] = canonical;
      }
      const qtyRaw = assigned ? null : formData.get("quantity");
      if (qtyRaw) stockData["quantity"] = Number(qtyRaw);
      const loc = formData.get("location") as string | null;
      if (loc) stockData["location"] = String(loc).trim().slice(0, 500);
      const unitCostRaw = formData.get("unit_cost");
      stockData["unit_cost"] = unitCostRaw ? Number(unitCostRaw) : null;
      const totalCostRaw = formData.get("total_cost");
      stockData["total_cost"] = totalCostRaw ? Number(totalCostRaw) : null;
      const received = formData.get("date_received");
      stockData["updated_at"] = received ? new Date(received as string) : undefined;
      if (Object.keys(stockData).length > 0) {
        await prisma.inventoryItem.update({
          where: { id },
          data: stockData,
        }).catch(() => null);
      }

      // Create or update an Asset record with all Asset fields the user entered
      const existingAsset = await prisma.asset.findUnique({
        where: { id },
        select: { id: true },
      });

      let record: unknown;
      if (existingAsset) {
        record = await prisma.asset.update({
          where: { id },
          data,
          select: { id: true, account_code: true, article: true },
        });
      } else {
        // Assigned stock rows may have no Asset row yet. Seed the locked
        // columns from the inventory record so the new row matches the issued
        // quantities instead of the (ignored) form values.
        const seed = assigned
          ? await prisma.inventoryItem
              .findUnique({
                where: { id },
                select: { quantity: true, unit: true },
              })
              .catch(() => null)
          : null;
        record = await prisma.asset.create({
          data: {
            ...data,
            id,
            ...(assigned ? { quantity: seed?.quantity ?? null, unit: seed?.unit ?? null } : {}),
          },
          select: { id: true, account_code: true, article: true },
        });
      }

      void import('@/lib/audit').then((m) =>
        m.writeAuditLog({
          userId: actor.userId!,
          action: 'asset:update',
          module: 'assets',
          details: { purpose: `Update unified asset ${id.slice(0, 8)}`, reference_id: id, before, after: record },
        }).catch(() => {})
      ).catch(() => {});
      revalidatePath("/personnel/assets");
      revalidatePath(`/personnel/assets/${id}`);
      return { success: true, record };
    } else {
      const updated = await prisma.asset.update({
        where: { id },
        data,
        select: { id: true, account_code: true, article: true },
      });
      void import('@/lib/audit').then((m) =>
        m.writeAuditLog({
          userId: actor.userId!,
          action: 'asset:update',
          module: 'assets',
          details: { purpose: `Update unified asset ${id.slice(0, 8)}`, reference_id: id, before, after: updated },
        }).catch(() => {})
      ).catch(() => {});
      revalidatePath("/personnel/assets");
      revalidatePath(`/personnel/assets/${id}`);
      return { success: true, record: updated };
    }
  } catch (e) {
    console.error("[updateUnifiedAsset]", e);
    return { success: false, error: "Failed to update asset." };
  }
}

export interface CreateAssetState {
  success?: boolean;
  error?: string;
  id?: string;
  /** Created record — lets the client patch cache without refetch. */
  record?: unknown;
}

function normalizeConditionInput(value: string | null): string | null {
  if (!value) return "serviceable";
  const lower = value.toLowerCase().trim();
  if (lower.includes("unservice")) return "unserviceable";
  return "serviceable";
}

function normalizeStatusInput(value: string | null): string | null {
  if (!value) return "available";
  const lower = value.toLowerCase().trim();
  if (["available", "in use", "maintenance", "retired"].includes(lower)) return lower;
  if (lower.includes("retired") || lower.includes("unservice") || lower.includes("dispos"))
    return "retired";
  return "available";
}

/**
 * Unserviceable equipment can never be Available (and so can never be
 * assigned). Keep those records in Maintenance until the condition is set
 * back to serviceable.
 */
function coerceStatusForCondition(
  condition: string | null,
  status: string | null
): string | null {
  if (classifyCondition(condition) !== "unserviceable") return status;
  if (status === null || status.trim().toLowerCase() === "available") {
    return "maintenance";
  }
  return status;
}

/**
 * Allocate a unique AST-xxx-xx-xx code for a manually-added asset. Both the
 * asset registry and the delivery log participate in the sequence so a manual
 * code can never collide with a delivery/inspection code.
 */
async function allocateAssetAccountCode(): Promise<string | null> {
  const prefix = ACCOUNT_CODE_PREFIX.asset;
  try {
    const [assets, deliveries] = await Promise.all([
      prisma.asset.findMany({
        where: {
          OR: [
            { account_code: { startsWith: `${prefix}-`, mode: "insensitive" } },
            { property_number: { startsWith: `${prefix}-`, mode: "insensitive" } },
          ],
        },
        select: { account_code: true, property_number: true },
      }),
      prisma.delivery.findMany({
        where: { account_code: { startsWith: `${prefix}-`, mode: "insensitive" } },
        select: { account_code: true },
      }),
    ]);
    const codes: (string | null)[] = [
      ...assets.flatMap((a) => [a.account_code, a.property_number]),
      ...deliveries.map((d) => d.account_code),
    ];
    for (let attempt = 0; attempt < 3; attempt++) {
      const candidate = nextAccountCode("asset", codes);
      // Guard against a concurrent write that picked the same candidate.
      const taken = await prisma.asset.findFirst({
        where: { OR: [{ property_number: candidate }, { account_code: candidate }] },
        select: { id: true },
      });
      if (!taken) return candidate;
      codes.push(candidate);
    }
    return null;
  } catch (e) {
    console.error("[allocateAssetAccountCode]", e);
    return null;
  }
}

/** Preview the next system asset code for the Add asset form. */
export async function generateAssetAccountCode(): Promise<
  { code: string } | { error: string }
> {
  const code = await allocateAssetAccountCode();
  return code
    ? { code }
    : { error: "Could not generate an account code. Please try again." };
}

export async function createAsset(
  _prevState: CreateAssetState,
  formData: FormData
): Promise<CreateAssetState> {
  let actor: { userId: string | null };
  try {
    const { requirePersonnelScope } = await import('@/lib/personnel-scope')
    actor = await requirePersonnelScope()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Not authenticated.'
    return { success: false, error: msg.startsWith('Forbidden') ? 'Forbidden: Personnel only.' : 'Not authenticated.' }
  }
  const get = (k: string) => {
    const v = formData.get(k);
    if (v === null || v === undefined) return null;
    const s = String(v).trim().slice(0, 500);
    return s === "" ? null : s;
  };

  const accountTitleRaw = get("account_title");
  const assetTypeRaw = get("category");
  const article = get("article");
  if (!accountTitleRaw)
    return { success: false, error: "ACCOUNT TITLE is required — pick one from Master Data." };
  if (!article) return { success: false, error: "ARTICLE is required." };

  // Strict mode: the title must exist in the active catalog. Asset type comes
  // from the catalog row(s) for that title (the form auto-fills it when a
  // title maps to a single type). The account code is system-owned below.
  const catalogEntries = await getActiveCatalogEntries();
  const titleMatches = catalogEntries.filter(
    (e) => (e.title ?? "").trim().toUpperCase() === accountTitleRaw.toUpperCase()
  );
  if (titleMatches.length === 0)
    return {
      success: false,
      error: `Unknown ACCOUNT TITLE "${accountTitleRaw}" — ask your Super Admin to add it to Master Data.`,
    };

  const accountTitle = titleMatches[0].title;
  const typeOptions = [
    ...new Map(
      titleMatches
        .map((e) => (e.type ?? "").trim())
        .filter(Boolean)
        .map((t) => [t.toLowerCase(), t])
    ).values(),
  ];
  let category: string | null = null;
  if (assetTypeRaw) {
    category =
      typeOptions.find((t) => t.toLowerCase() === assetTypeRaw.toLowerCase()) ?? null;
  }
  if (!category) category = typeOptions[0] ?? null;
  if (!category)
    return {
      success: false,
      error: `"${accountTitle}" has no asset type in Master Data — ask your Super Admin to update it.`,
    };

  const accountCode = await allocateAssetAccountCode();
  if (!accountCode)
    return {
      success: false,
      error: "Could not allocate a unique account code. Please try again.",
    };

  const unitRaw = get("unit");
  let unit: string | null = null;
  if (unitRaw) {
    unit = await resolveUnitName(unitRaw);
    if (!unit)
      return {
        success: false,
        error: `Unknown UNIT "${unitRaw}" — ask your Super Admin to add it to Master Data.`,
      };
  }

  const qtyRaw = get("quantity");
  const cylRaw = get("cylinders");
  const totalRaw = get("total_cost");
  const unitCostRaw = get("unit_cost");

  const quantity = qtyRaw === null ? null : Number(qtyRaw);
  if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0))
    return { success: false, error: "QTY must be a whole number 0 or more." };
  const cylinders = cylRaw === null ? null : Number(cylRaw);
  if (cylinders !== null && (!Number.isInteger(cylinders) || cylinders < 0))
    return { success: false, error: "No. of Cyl. must be a whole number 0 or more." };
  const totalCost = totalRaw === null ? null : Number(totalRaw);
  if (totalCost !== null && (!Number.isFinite(totalCost) || totalCost < 0))
    return { success: false, error: "TOTAL COST must be 0 or more." };
  const unitCost = unitCostRaw === null ? null : Number(unitCostRaw);
  if (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0))
    return { success: false, error: "UNIT COST must be 0 or more." };

  const parseDate = (k: string) => {
    const v = get(k);
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const qrCode = get("qr_code");
  const condition = normalizeConditionInput(get("condition"));
  const status = coerceStatusForCondition(condition, normalizeStatusInput(get("status")));

  try {
    if (qrCode) {
      const dupQr = await prisma.asset.findUnique({
        where: { qr_code: qrCode },
        select: { id: true },
      });
      if (dupQr)
        return { success: false, error: `PROPERTY No. "${qrCode}" already exists.` };
    }

    const created = await prisma.asset.create({
      data: {
        property_number: accountCode,
        account_code: accountCode,
        identifier: get("identifier"),
        account_title: accountTitle,
        account_name: get("account_name"),
        category,
        article,
        quantity,
        unit,
        description: get("description"),
        date_acquired: parseDate("date_acquired"),
        location: get("location"),
        total_cost: totalCost,
        remarks: get("remarks"),
        condition,
        unit_cost: unitCost,
        end_user: get("end_user"),
        brand: get("brand"),
        cylinders,
        engine_displacement: get("engine_displacement"),
        fuel_type: get("fuel_type"),
        engine_number: get("engine_number"),
        chassis_number: get("chassis_number"),
        color: get("color"),
        plate_number: get("plate_number"),
        fund: get("fund"),
        status,
        dv_tracking_number: get("dv_tracking_number"),
        supplier_payee: get("supplier_payee"),
        account_name_charge: get("account_name_charge"),
        account_number: get("account_number"),
        obr_number: get("obr_number"),
        dv_number: get("dv_number"),
        date_received: parseDate("date_received"),
        qr_code: qrCode,
      },
      select: { id: true, account_code: true, article: true },
    });

    // Every physical piece gets its own item code + QR tag from day one.
    await ensureAssetUnits(created.id, quantity, condition).catch(() => {});

    void import('@/lib/audit').then((m) =>
      m.writeAuditLog({
        userId: actor.userId!,
        action: 'asset:create',
        module: 'assets',
        details: { purpose: `Create asset ${created.account_code ?? created.id.slice(0, 8)}`, reference_id: created.id, after: created },
      }).catch(() => {})
    ).catch(() => {});
    revalidatePath("/personnel/assets");
    return { success: true, id: created.id, record: created };
  } catch (e) {
    console.error("[createAsset]", e);
    return { success: false, error: "Failed to add the asset. Please try again." };
  }
}

// ── Bulk import from the exact-header Excel template ──────────────

export interface ImportAssetsState {
  success?: boolean;
  error?: string;
  created?: number;
  updated?: number;
  skipped?: number;
  /** Account codes that were newly saved (or re-activated) in Master Data. */
  masterDataCreated?: number;
  errors?: string[];
  /** Template columns matched in the uploaded file (any order; extras ignored). */
  matched?: string[];
}

interface ImportCatalogEntry {
  code: string;
  title: string;
  type: string;
}

/**
 * Master Data bootstrap for Excel imports.
 *
 * Existing codes keep their approved Title/Type (the catalog stays
 * authoritative for records that are already validated). A code that only
 * exists in the uploaded file is saved to Master Data right here, so an
 * import never has to wait for a Super Admin to add it first. Codes that were
 * previously deactivated/soft-deleted are re-activated instead of duplicated.
 */
async function ensureImportCatalogEntry(input: {
  code: string;
  title: string | null;
  type: string | null;
  name: string | null;
  createdBy: string | null;
}): Promise<{ entry: ImportCatalogEntry; changed: boolean }> {
  const code = input.code.trim();
  const row = await prisma.accountCatalog.findUnique({
    where: { account_code: code },
    select: {
      account_code: true,
      account_title: true,
      asset_type: true,
      status: true,
      deleted_at: true,
    },
  });

  if (row) {
    let changed = false;
    if (row.status !== "active" || row.deleted_at) {
      await prisma.accountCatalog.update({
        where: { account_code: code },
        data: { status: "active", deleted_at: null },
      });
      changed = true;
    }
    return {
      entry: {
        code: row.account_code,
        title: row.account_title,
        type: row.asset_type,
      },
      changed,
    };
  }

  const title = (input.title ?? "").trim().toUpperCase() || "GENERAL";
  const type = (input.type ?? "").trim() || "General";
  try {
    const created = await prisma.accountCatalog.create({
      data: {
        account_code: code,
        account_title: title,
        account_name: input.name,
        asset_type: type,
        status: "active",
        created_by: input.createdBy,
      },
      select: { account_code: true, account_title: true, asset_type: true },
    });
    return {
      entry: {
        code: created.account_code,
        title: created.account_title,
        type: created.asset_type,
      },
      changed: true,
    };
  } catch (e) {
    // Another row/import raced the same new code — the winner is authoritative.
    const raced = await prisma.accountCatalog.findUnique({
      where: { account_code: code },
      select: { account_code: true, account_title: true, asset_type: true },
    });
    if (raced)
      return {
        entry: {
          code: raced.account_code,
          title: raced.account_title,
          type: raced.asset_type,
        },
        changed: false,
      };
    throw e;
  }
}

/**
 * Asset columns compared for duplicate detection, in model-field terms.
 * A row counts as a duplicate only when every column it provides matches
 * the existing record (blank cells are "no info" — they neither match nor
 * overwrite). Comparison is case-insensitive for text, exact for numbers,
 * and by calendar day for dates.
 */
const ASSET_COMPARE_FIELDS = [
  "property_number",
  "account_code",
  "identifier",
  "account_title",
  "account_name",
  "category",
  "article",
  "quantity",
  "unit",
  "description",
  "date_acquired",
  "location",
  "total_cost",
  "remarks",
  "condition",
  "unit_cost",
  "end_user",
  "brand",
  "cylinders",
  "engine_displacement",
  "fuel_type",
  "engine_number",
  "chassis_number",
  "color",
  "plate_number",
  "fund",
  "status",
  "dv_tracking_number",
  "supplier_payee",
  "account_name_charge",
  "account_number",
  "obr_number",
  "dv_number",
  "date_received",
  "qr_code",
] as const;

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  if (a instanceof Date || b instanceof Date) {
    const da = a instanceof Date ? a : new Date(String(a));
    const db = b instanceof Date ? b : new Date(String(b));
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
    return da.toISOString().slice(0, 10) === db.toISOString().slice(0, 10);
  }
  if (typeof a === "number" || typeof b === "number" || typeof a === "bigint") {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
    return na === nb;
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function cellToValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return value;
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("result" in v && v.result !== undefined && v.result !== null) return v.result;
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("richText" in v && Array.isArray(v.richText))
      return (v.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
    if ("hyperlink" in v && typeof v.hyperlink === "string") return v.hyperlink;
  }
  return String(value);
}

function strVal(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function intVal(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? Math.trunc(v) : Number(String(v).replace(/,/g, ""));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function decVal(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, "").replace(/₱/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function dateVal(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const d = new Date(String(v).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function importAssetsFromExcel(
  _prevState: ImportAssetsState,
  formData: FormData
): Promise<ImportAssetsState> {
  let actor: { userId: string | null };
  try {
    const { requirePersonnelScope } = await import('@/lib/personnel-scope')
    actor = await requirePersonnelScope()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Not authenticated.'
    return { success: false, error: msg.startsWith('Forbidden') ? 'Forbidden: Personnel only.' : 'Not authenticated.' }
  }
  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0)
    return { success: false, error: "No file was chosen. Please choose your filled-in Excel file (.xlsx) first, then click Import file." };
  if (file.size > 10 * 1024 * 1024)
    return { success: false, error: "That file is over 10 MB, so it can't be imported. Please remove any images, split it into smaller files, and try again." };

  let wb: ExcelJS.Workbook;
  try {
    wb = new ExcelJS.Workbook();
    const buf = await file.arrayBuffer();
    await wb.xlsx.load(buf);
  } catch (e) {
    console.error("[importAssetsFromExcel] load", e);
    return { success: false, error: "We couldn't open that file. Please download a fresh Asset Import Template from Download Templates in the sidebar, copy your data into it without renaming the column titles, and upload it again." };
  }

  const ws = wb.getWorksheet(ASSET_TEMPLATE_SHEET) ?? wb.worksheets[0];
  if (!ws) return { success: false, error: "We couldn't find any data in that file. Please check that you uploaded the filled-in template and that row 1 still has the column titles." };

  // Map normalized (trimmed) header -> column index. Tolerant of Excel
  // trimming the two trailing-space headers on re-save. Only columns
  // matching the template headers are read — any order, extra columns
  // in the client's own file are ignored, missing optionals default.
  const colByHeader = new Map<string, number>();
  const foundHeaders: string[] = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    const raw = cellToValue(cell.value);
    const key = raw === null ? "" : String(raw).trim();
    if (key) {
      foundHeaders.push(key);
      if (!colByHeader.has(key)) colByHeader.set(key, col);
    }
  });

  if (!colByHeader.has("ACCOUNT CODE"))
    return {
      success: false,
      error: `We couldn't find the ACCOUNT CODE column in row 1, so nothing was imported. Please use the Asset Import Template without renaming or deleting the title row, then upload again. Titles we saw: ${foundHeaders.join(", ") || "(none)"}.`,
    };

  const matched = ASSET_EXCEL_HEADERS.filter((h) => colByHeader.has(h.trim()));

  const at = (row: ExcelJS.Row, header: string): unknown => {
    const col = colByHeader.get(header);
    if (!col) return null;
    return cellToValue(row.getCell(col).value);
  };

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let masterDataCreated = 0;
  const errors: string[] = [];
  const seenQr = new Set<string>();

  // Strict mode reference data, loaded once for the whole file.
  const catalogByCode = new Map(
    (await getActiveCatalogEntries()).map((e) => [e.code, e])
  );

  // Existing assets, loaded once. Each row is handled independently:
  // - a new Account Code is saved to Master Data from the row's Title/Type;
  // - row identical to the existing record on every provided column →
  //   duplicate, skipped with a message;
  // - row differs → the existing record is updated;
  // - brand-new verified row → added.
  // Imports never touch records unrelated to the file.
  const assetByKey = new Map<string, { id: string; fields: Record<string, unknown> }>();
  const existingQrCodes = new Set<string>();
  try {
    // Compare-fields only (was SELECT * full-table into memory).
    const rows = await prisma.asset.findMany({
      select: {
        id: true,
        property_number: true,
        account_code: true,
        identifier: true,
        account_title: true,
        account_name: true,
        category: true,
        article: true,
        quantity: true,
        unit: true,
        description: true,
        date_acquired: true,
        location: true,
        total_cost: true,
        remarks: true,
        condition: true,
        unit_cost: true,
        end_user: true,
        brand: true,
        cylinders: true,
        engine_displacement: true,
        fuel_type: true,
        engine_number: true,
        chassis_number: true,
        color: true,
        plate_number: true,
        fund: true,
        status: true,
        dv_tracking_number: true,
        supplier_payee: true,
        account_name_charge: true,
        account_number: true,
        obr_number: true,
        dv_number: true,
        date_received: true,
        qr_code: true,
      },
    });
    for (const r of rows) {
      const fields: Record<string, unknown> = {
        property_number: r.property_number,
        account_code: r.account_code,
        identifier: r.identifier,
        account_title: r.account_title,
        account_name: r.account_name,
        category: r.category,
        article: r.article,
        quantity: r.quantity,
        unit: r.unit,
        description: r.description,
        date_acquired: r.date_acquired,
        location: r.location,
        total_cost: r.total_cost,
        remarks: r.remarks,
        condition: r.condition,
        unit_cost: r.unit_cost,
        end_user: r.end_user,
        brand: r.brand,
        cylinders: r.cylinders,
        engine_displacement: r.engine_displacement,
        fuel_type: r.fuel_type,
        engine_number: r.engine_number,
        chassis_number: r.chassis_number,
        color: r.color,
        plate_number: r.plate_number,
        fund: r.fund,
        status: r.status,
        dv_tracking_number: r.dv_tracking_number,
        supplier_payee: r.supplier_payee,
        account_name_charge: r.account_name_charge,
        account_number: r.account_number,
        obr_number: r.obr_number,
        dv_number: r.dv_number,
        date_received: r.date_received,
        qr_code: r.qr_code,
      };
      const entry = { id: r.id, fields };
      if (r.property_number && !assetByKey.has(r.property_number)) assetByKey.set(r.property_number, entry);
      if (r.account_code && !assetByKey.has(r.account_code)) assetByKey.set(r.account_code, entry);
      if (r.qr_code) existingQrCodes.add(r.qr_code);
    }
  } catch (e) {
    console.error("[importAssetsFromExcel] preload assets", e);
    return { success: false, error: "We couldn't load your current asset list right now, so nothing was imported. Please wait a moment and try the import again." };
  }

  const last = ws.lastRow?.number ?? ws.rowCount;
  for (let i = 2; i <= last; i++) {
    const row = ws.getRow(i);
    const accountCode = strVal(at(row, "ACCOUNT CODE"));
    if (!accountCode) {
      // Ignore fully blank rows; count rows with other data but no key as skipped.
      let hasAny = false;
      row.eachCell({ includeEmpty: false }, () => {
        hasAny = true;
      });
      if (hasAny) skipped++;
      continue;
    }

    // Every row is saved against Master Data. Existing codes keep their
    // approved Title/Type; codes that only appear in this file are written to
    // Master Data on the spot so the import never waits for a Super Admin.
    let catalogHit = catalogByCode.get(accountCode);
    if (!catalogHit) {
      try {
        const ensured = await ensureImportCatalogEntry({
          code: accountCode,
          title: strVal(at(row, "ACCOUNT TITLE")),
          type: strVal(at(row, "ASSET TYPE")),
          name: strVal(at(row, "ACCOUNT NAME")),
          createdBy: actor.userId,
        });
        catalogHit = ensured.entry;
        catalogByCode.set(accountCode, catalogHit);
        if (ensured.changed) masterDataCreated++;
      } catch (e) {
        console.error(`[importAssetsFromExcel] master data row ${i}`, e);
        skipped++;
        errors.push(
          `Row ${i} (Account Code "${accountCode}"): not imported — we couldn't save this code to Master Data. What to do: try the import again; if it keeps failing, ask your Super Admin to add code "${accountCode}" to Master Data.`
        );
        continue;
      }
    }

    // Unknown units are left blank with a warning so the row itself is not lost.
    const unitRaw = strVal(at(row, "UNIT"));
    let unit: string | null = null;
    if (unitRaw) {
      const canonical = await resolveUnitName(unitRaw);
      if (!canonical) {
        errors.push(
          `Row ${i} (Account Code "${accountCode}"): imported, but the unit "${unitRaw}" was left blank because it isn't in the approved unit list. What to do: ask your Super Admin to add "${unitRaw}" to the unit list, then edit this item to set its unit.`
        );
      } else {
        unit = canonical;
      }
    }

    const condRaw = strVal(at(row, "CONDITION"));
    const statusRaw = strVal(at(row, "STATUS"));
    const condition = !condRaw
      ? "serviceable"
      : condRaw.toLowerCase().includes("unservice")
        ? "unserviceable"
        : "serviceable";
    const statusLower = (statusRaw ?? "").toLowerCase().trim();
    const parsedStatus = ["available", "in use", "maintenance", "retired"].includes(statusLower)
      ? statusLower
      : statusLower.includes("retir") || statusLower.includes("unservice") || statusLower.includes("dispos")
        ? "retired"
        : "available";
    // Imported unserviceable rows must not land as Available.
    const status = coerceStatusForCondition(condition, parsedStatus);

    // PROPERTY No. must stay unique — a repeated or already-used tag
    // skips the whole row with a message (first occurrence wins).
    const qrCode = strVal(at(row, "PROPERTY No."));
    if (qrCode) {
      if (seenQr.has(qrCode)) {
        skipped++;
        errors.push(`Row ${i} (Property No. "${qrCode}"): not imported — this number appears twice in your file. What to do: we kept the first occurrence; please remove or correct the duplicate in your file and re-import this row only if needed.`);
        continue;
      }
      if (existingQrCodes.has(qrCode)) {
        skipped++;
        errors.push(`Row ${i} (Property No. "${qrCode}"): not imported — this number is already used by another asset in the system. What to do: give this row a new, unused Property No. and re-import just this row.`);
        continue;
      }
      seenQr.add(qrCode);
    }

    const data = {
      account_code: accountCode,
      identifier: strVal(at(row, "IDENTIFIER")),
      account_title: catalogHit.title,
      account_name: strVal(at(row, "ACCOUNT NAME")),
      category: catalogHit.type,
      article: strVal(at(row, "ARTICLE")),
      quantity: intVal(at(row, "QTY.")),
      unit,
      description: strVal(at(row, "DESCRIPTION")),
      date_acquired: dateVal(at(row, "DATE ACQUIRED")),
      location: strVal(at(row, "LOCATION")),
      total_cost: decVal(at(row, "TOTAL COST")),
      remarks: strVal(at(row, "REMARKS")),
      condition,
      unit_cost: decVal(at(row, "UNIT COST")),
      end_user: strVal(at(row, "END USER")),
      brand: strVal(at(row, "BRAND")),
      cylinders: intVal(at(row, "No. of Cyl.")),
      engine_displacement: strVal(at(row, "Engine Displacement")),
      fuel_type: strVal(at(row, "Fuel Type")),
      engine_number: strVal(at(row, "ENGINE#")),
      chassis_number: strVal(at(row, "CHASSIS#")),
      color: strVal(at(row, "COLOR")),
      plate_number: strVal(at(row, "PLATE NO.")),
      fund: strVal(at(row, "FUND")),
      status,
      dv_tracking_number: strVal(at(row, "DV TRACKING NUMBER")),
      supplier_payee: strVal(at(row, "SUPPLIER/PAYEE")),
      account_name_charge: strVal(at(row, "ACCOUNT NAME-CHARGE")),
      account_number: strVal(at(row, "ACCOUNT NUMBER")),
      obr_number: strVal(at(row, "OBR NUMBER")),
      dv_number: strVal(at(row, "DV NUMBER")),
      date_received: dateVal(at(row, "DATE RECEIVED AT INVENTORY SECTION")),
      qr_code: qrCode,
    };

    // Full-row duplicate check: only when every column the row provides
    // matches the existing record is it a duplicate → skipped with a message.
    // Blank cells carry no info — they are excluded from both the comparison
    // and the update, so re-imports never wipe stored values. Differing rows
    // update the existing record; verified new rows are added.
    const parsed: Record<string, unknown> = { property_number: accountCode, ...data };
    const provided = (ASSET_COMPARE_FIELDS as readonly string[]).filter(
      (f) => parsed[f] !== null && parsed[f] !== undefined
    );
    const prior = assetByKey.get(accountCode);
    if (prior && provided.every((f) => valuesEqual(prior.fields[f], parsed[f]))) {
      skipped++;
      errors.push(`Row ${i} (Account Code "${accountCode}"): skipped — this row is exactly the same as what's already saved, so no action was needed.`);
      continue;
    }

    try {
      if (prior) {
        const updateData: Record<string, unknown> = {};
        for (const f of provided) updateData[f] = parsed[f];
        await prisma.asset.update({
          where: { id: prior.id },
          // Keys are all scalar Asset fields (see ASSET_COMPARE_FIELDS).
          data: updateData as Record<string, string | number | Date | null>,
        });
        assetByKey.set(accountCode, {
          id: prior.id,
          fields: { ...prior.fields, ...updateData },
        });
        await ensureAssetUnits(prior.id, data.quantity, condition).catch(() => {});
        updated++;
      } else {
        const createdRow = await prisma.asset.create({
          data: { property_number: accountCode, ...data },
        });
        assetByKey.set(accountCode, { id: createdRow.id, fields: parsed });
        await ensureAssetUnits(createdRow.id, data.quantity, condition).catch(() => {});
        created++;
      }
      if (qrCode) existingQrCodes.add(qrCode);
    } catch (e) {
      console.error(`[importAssetsFromExcel] row ${i}`, e);
      errors.push(`Row ${i} (Account Code "${accountCode}"): not saved — please check that quantities are whole numbers (0 or higher), costs are valid amounts, and dates are real dates, then re-import just this row. If it keeps failing, contact your Super Admin.`);
      skipped++;
    }
  }

  // Master Data may have gained codes above — drop its cached lookups so the
  // Master Data page and the Add asset dropdowns see them immediately.
  if (masterDataCreated > 0) {
    nextRevalidatePath("/super-admin/master-data");
    void import("@/lib/personnel-cache")
      .then((m) => m.bustCachePrefixes(["catalog:", "master-data:"]))
      .catch(() => {});
  }

  if (created === 0 && updated === 0)
    return {
      success: false,
      error: "Nothing was imported — every row was skipped. This usually means the rows are already saved and unchanged, or a required value is missing. Please read the per-row notes below, fix your file, and re-import only the rows that failed.",
      skipped,
      masterDataCreated,
      errors: errors.slice(0, 20),
      matched,
    };

  revalidatePath("/personnel/assets");
  void import('@/lib/audit').then((m) =>
    m.writeAuditLog({
      userId: actor.userId!,
      action: 'asset:import',
      module: 'assets',
      details: { purpose: `Import assets from Excel`, summary: `created ${created}, updated ${updated}, skipped ${skipped}, master data saved ${masterDataCreated}`, created, updated, skipped, masterDataCreated },
    }).catch(() => {})
  ).catch(() => {});
  return { success: true, created, updated, skipped, masterDataCreated, errors: errors.slice(0, 20), matched };
}
