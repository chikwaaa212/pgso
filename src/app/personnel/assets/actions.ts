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
import { generateAssetQrDataUrl, generateStockQrDataUrl } from "@/lib/qrcode";
import { ASSET_EXCEL_HEADERS, ASSET_TEMPLATE_SHEET } from "@/lib/asset-excel";
import { findCatalogEntry, getActiveCatalogEntries, resolveUnitName } from "@/lib/master-data";
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
  /** User-defined column values, keyed by custom field key. */
  custom_fields: CustomBag;
}

function mapStockToUnified(stock: StockRow): UnifiedAssetRow {
  return {
    id: stock.id,
    source: "stock",
    account_code: stock.account_code,
    identifier: null,
    account_title: null,
    account_name: null,
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
    custom_fields: stock.custom_fields,
  };
}

function mapAssetToUnified(asset: AssetRow): UnifiedAssetRow {
  return {
    ...asset,
    source: "asset",
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
  const before = await prisma.asset.findUnique({ where: { id }, select: { id: true, account_code: true, article: true, status: true } }).catch(() => null)
  if (!before) return { success: false, error: "Asset not found." }

  try {
    const updated = await prisma.asset.update({
      where: { id },
      data,
      select: { id: true, account_code: true, article: true, status: true, location: true, quantity: true },
    });
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
  /** Window size (default PAGE_SIZE, clamped 1..100). UI lists omit it. */
  pageSize?: number
  q?: string
  status?: string
  source?: string
  condition?: string
  unit?: string
  category?: string
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
 * Server-paginated unified registry window (PAGE_SIZE = 15).
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
  const pageSize = Number.isFinite(rawSize) ? Math.min(Math.max(rawSize, 1), 100) : PAGE_SIZE
  const q = parseQuery(opts.q)
  const status = (opts.status ?? 'all').trim().toLowerCase()
  const source = (opts.source ?? 'all').trim().toLowerCase()
  const condition = (opts.condition ?? 'all').trim().toLowerCase()
  const unit = (opts.unit ?? 'all').trim().toLowerCase()
  const category = (opts.category ?? 'all').trim().toLowerCase()
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
        const wantAssets = source === 'all' || source === 'asset'
        const wantStocks =
          (source === 'all' || source === 'stock') &&
          (status === 'all' || status === 'available') &&
          condition === 'all'
        if (!wantAssets && !wantStocks) return empty

        const like = q !== '' ? `%${escapeLike(q)}%` : null

        const assetConds: InstanceType<typeof Prisma.Sql>[] = []
        if (status !== 'all') assetConds.push(Prisma.sql`lower(a.status) = ${status}`)
        if (condition !== 'all') assetConds.push(Prisma.sql`lower(a.condition) = ${condition}`)
        if (unit !== 'all') assetConds.push(Prisma.sql`lower(a.unit) = ${unit}`)
        if (category !== 'all') assetConds.push(Prisma.sql`lower(a.category) = ${category}`)
        const stockConds: InstanceType<typeof Prisma.Sql>[] = []
        if (unit !== 'all') stockConds.push(Prisma.sql`lower(s.unit) = ${unit}`)
        if (category !== 'all') stockConds.push(Prisma.sql`lower(s.category) = ${category}`)

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
          NULL::text AS remarks, NULL::text AS condition, s.unit_cost,
          NULL::text AS end_user, NULL::text AS brand, NULL::integer AS cylinders,
          NULL::text AS engine_displacement, NULL::text AS fuel_type,
          NULL::text AS engine_number, NULL::text AS chassis_number,
          NULL::text AS color, NULL::text AS plate_number, NULL::text AS fund,
          'available' AS status, NULL::text AS dv_tracking_number,
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
            return mapStockToUnified({
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
            } as StockRow)
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
        if (slim) {
          const slimRows = mapped.map((a) => ({ ...a, qr_data_url: '' }))
          return { rows: slimRows, data: slimRows, total, page: safePage, pageSize, totalPages }
        }
        // Hydrate QR only for the visible window (15).
        const rows = await Promise.all(
          mapped.map(async (a) => ({
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
    { page, pageSize, q, status, source, condition, unit, category, slim }
  )
}

export async function getUnifiedAsset(id: string): Promise<UnifiedAssetRow | null> {
  try {
    const asset = await getAsset(id);
    if (asset) {
      return mapAssetToUnified(asset);
    }

    const stock = await getStock(id);
    if (stock) {
      return mapStockToUnified(stock);
    }

    return null;
  } catch (e) {
    console.error("[getUnifiedAsset]", e);
    return null;
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
}

export interface AssetHistoryRequest {
  id: string;
  request_type: string;
  status: string | null;
  date_requested: string | null;
  employee_id: string;
  employee_name: string;
  description: string;
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
    const asset = await prisma.asset.findUnique({
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
    });
    if (!asset) return empty;

    const labelBits = [asset.qr_code ?? asset.account_code, asset.article, asset.description].filter(
      Boolean
    ) as string[];
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
          employee_id: string;
          quantity: number;
          total_amount: unknown;
          issuance_data: Record<string, unknown> | null;
          created_at: Date | string | null;
        }>
      >`SELECT id::text AS id, doc_type, doc_no, doc_date,
              asset_id::text AS asset_id,
              employee_id::text AS employee_id, quantity, total_amount,
              issuance_data, created_at
       FROM issuance_records WHERE asset_id = ${id}::uuid
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
            employee_id: true,
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
          where: { id: { in: [asset.assigned_to].filter(Boolean) as string[] } },
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
        return lines
          .map((l) => (l as { assetId?: unknown } | null)?.assetId)
          .filter((v): v is string => typeof v === "string" && v.length > 0);
      } catch {
        return [];
      }
    };

    const matchedIssuances = issuanceDbRows.filter(
      (r) => r.asset_id === id || lineAssetIds(r.issuance_data).includes(id)
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
            employee_id: true,
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
      if (asset.assigned_to) need.add(asset.assigned_to)
      for (const r of repairs) if (r.reported_by) need.add(r.reported_by as string)
      for (const r of matchedIssuances) if (r.employee_id) need.add(r.employee_id)
      for (const r of matchedRequests) if (r.employee_id) need.add(r.employee_id)
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
      assignedToName: asset.assigned_to ? (names.get(asset.assigned_to) ?? null) : null,
      repairs: repairs.map((r) => ({
        id: r.id,
        asset_id: id,
        asset_label: assetLabel,
        account_code: asset.account_code,
        account_title: asset.account_title,
        asset_type: asset.category,
        reported_by: r.reported_by,
        reporter_name: names.get(r.reported_by) ?? "Unknown employee",
        repair_date: r.repair_date.toISOString().slice(0, 10),
        description: r.description,
        status: r.status,
        cost: num(r.cost),
        technician: r.technician,
        created_at: r.created_at ? isoDateTime(r.created_at) : null,
      })),
      issuances: matchedIssuances.map((r) => ({
        id: r.id,
        doc_type: r.doc_type,
        doc_no: r.doc_no,
        doc_date: isoDate(r.doc_date),
        employee_id: r.employee_id,
        employee_name: names.get(r.employee_id) ?? "Unknown employee",
        quantity: r.quantity,
        total_amount: num(r.total_amount),
        created_at: isoDateTime(r.created_at),
      })),
      requests: matchedRequests.map((r) => ({
        id: r.id,
        request_type: r.request_type,
        status: r.status,
        date_requested: r.date_requested ? isoDateTime(r.date_requested) : null,
        employee_id: r.employee_id,
        employee_name: names.get(r.employee_id) ?? "Unknown employee",
        description: r.description,
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

  // Strict mode: account codes and units must come from Master Data.
  // Title + type snap to the catalog entry so edits can't desync the triple.
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
      data["account_title"] = hit.title;
      data["category"] = hit.type;
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

  const before = await prisma.asset.findUnique({ where: { id }, select: { id: true, account_code: true, article: true } }).catch(() => null);

  try {
    if (source === "stock") {
      // Sync stock-specific fields back to InventoryItem
      const stockData: Record<string, unknown> = {};
      const itemName = formData.get("article") as string | null;
      if (itemName) stockData["item_name"] = String(itemName).trim().slice(0, 500);
      const unit = formData.get("unit") as string | null;
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
      const qtyRaw = formData.get("quantity");
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
        record = await prisma.asset.create({
          data: { ...data, id },
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

  const accountCode = get("account_code");
  const article = get("article");
  if (!accountCode) return { success: false, error: "ACCOUNT CODE is required — pick one from Master Data." };
  if (!article) return { success: false, error: "ARTICLE is required." };

  // Strict mode: code must exist in the active catalog; title + type are
  // authoritative from the catalog entry, not the submitted form.
  const catalogEntry = await findCatalogEntry(accountCode);
  if (!catalogEntry)
    return {
      success: false,
      error: `Unknown ACCOUNT CODE "${accountCode}" — ask your Super Admin to add it to Master Data.`,
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

  try {
    const dupCode = await prisma.asset.findUnique({
      where: { property_number: accountCode },
      select: { id: true },
    });
    if (dupCode)
      return { success: false, error: `ACCOUNT CODE "${accountCode}" already exists.` };
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
        account_title: catalogEntry.title,
        account_name: get("account_name"),
        category: catalogEntry.type,
        article,
        quantity,
        unit,
        description: get("description"),
        date_acquired: parseDate("date_acquired"),
        location: get("location"),
        total_cost: totalCost,
        remarks: get("remarks"),
        condition: normalizeConditionInput(get("condition")),
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
        status: normalizeStatusInput(get("status")),
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
  errors?: string[];
  /** Template columns matched in the uploaded file (any order; extras ignored). */
  matched?: string[];
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
  const errors: string[] = [];
  const seenQr = new Set<string>();

  // Strict mode reference data, loaded once for the whole file.
  const catalogByCode = new Map(
    (await getActiveCatalogEntries()).map((e) => [e.code, e])
  );

  // Existing assets, loaded once. Each row is handled independently:
  // - triple (code + title + type) must exist in Master Data, else skipped;
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

    // The code must exist in the office's approved Master Data list…
    const catalogHit = catalogByCode.get(accountCode);
    if (!catalogHit) {
      skipped++;
      errors.push(
        `Row ${i} (Account Code "${accountCode}"): not imported — this code is not yet in the approved Master Data list. What to do: ask your Super Admin to add code "${accountCode}" to Master Data, then re-import just this row.`
      );
      continue;
    }

    // …and the row's title + type must match that approved entry.
    const rowTitle = (strVal(at(row, "ACCOUNT TITLE")) ?? "").trim();
    const rowType = (strVal(at(row, "ASSET TYPE")) ?? "").trim();
    const titleOk = rowTitle.toUpperCase() === (catalogHit.title ?? "").trim().toUpperCase();
    const typeOk = rowType.toLowerCase() === (catalogHit.type ?? "").trim().toLowerCase();
    if (!titleOk || !typeOk) {
      skipped++;
      errors.push(
        `Row ${i} (Account Code "${accountCode}"): not imported — the Account Title or Asset Type in your file doesn't match the approved list. The approved entry is Title "${catalogHit.title}" and Type "${catalogHit.type}". What to do: correct your file to match exactly, then re-import just this row.`
      );
      continue;
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
    const status = ["available", "in use", "maintenance", "retired"].includes(statusLower)
      ? statusLower
      : statusLower.includes("retir") || statusLower.includes("unservice") || statusLower.includes("dispos")
        ? "retired"
        : "available";

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
        updated++;
      } else {
        const createdRow = await prisma.asset.create({
          data: { property_number: accountCode, ...data },
        });
        assetByKey.set(accountCode, { id: createdRow.id, fields: parsed });
        created++;
      }
      if (qrCode) existingQrCodes.add(qrCode);
    } catch (e) {
      console.error(`[importAssetsFromExcel] row ${i}`, e);
      errors.push(`Row ${i} (Account Code "${accountCode}"): not saved — please check that quantities are whole numbers (0 or higher), costs are valid amounts, and dates are real dates, then re-import just this row. If it keeps failing, contact your Super Admin.`);
      skipped++;
    }
  }

  if (created === 0 && updated === 0)
    return {
      success: false,
      error: "Nothing was imported — every row was skipped. This usually means the rows are already saved and unchanged, the Account Codes aren't in the approved Master Data list yet, or the Title / Type in the file doesn't match the approved list. Please read the per-row notes below, fix your file, and re-import only the rows that failed.",
      skipped,
      errors: errors.slice(0, 20),
      matched,
    };

  revalidatePath("/personnel/assets");
  void import('@/lib/audit').then((m) =>
    m.writeAuditLog({
      userId: actor.userId!,
      action: 'asset:import',
      module: 'assets',
      details: { purpose: `Import assets from Excel`, summary: `created ${created}, updated ${updated}, skipped ${skipped}`, created, updated, skipped },
    }).catch(() => {})
  ).catch(() => {});
  return { success: true, created, updated, skipped, errors: errors.slice(0, 20), matched };
}
