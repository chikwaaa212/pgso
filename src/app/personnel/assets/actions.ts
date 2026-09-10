"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { generateQrDataUrl } from "@/lib/qrcode";
import { ASSET_EXCEL_HEADERS, ASSET_TEMPLATE_SHEET } from "@/lib/asset-excel";
import { findCatalogEntry, getActiveCatalogEntries, resolveUnitName } from "@/lib/master-data";

export interface EditState {
  success?: boolean;
  error?: string;
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
}

export async function getAssets(): Promise<AssetRow[]> {
  try {
    const assets = await prisma.asset.findMany({
      orderBy: { created_at: "desc" },
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
    });

    const rows: AssetRow[] = await Promise.all(
      assets.map(async (a) => ({
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
        qr_data_url: await generateQrDataUrl(
          a.qr_code ?? a.account_code ?? a.id,
        ),
      })),
    );

    return rows;
  } catch (e) {
    console.error("[getAssets]", e);
    return [];
  }
}

export async function getCategories(): Promise<string[]> {
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
  };
}

function mapAssetToUnified(asset: AssetRow): UnifiedAssetRow {
  return {
    ...asset,
    source: "asset",
  };
}

export async function getStocks(): Promise<StockRow[]> {
  try {
    const items = await prisma.inventoryItem.findMany({
      orderBy: { item_name: "asc" },
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

    const rows: StockRow[] = await Promise.all(
      items.map(async (item) => ({
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
        qr_data_url: await generateQrDataUrl(
          item.item_name ?? item.id,
        ),
      })),
    )

    return rows
  } catch (e) {
    console.error("[getStocks]", e)
    return []
  }
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
      qr_data_url: await generateQrDataUrl(
        a.qr_code ?? a.account_code ?? a.id,
      ),
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
      qr_data_url: await generateQrDataUrl(
        item.item_name ?? item.id,
      ),
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
  const id = formData.get("id") as string;
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
    const val = raw as string;
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

  try {
    await prisma.asset.update({
      where: { id },
      data,
    });
    revalidatePath("/personnel/assets");
    revalidatePath(`/personnel/assets/${id}`);
    return { success: true };
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
    await prisma.inventoryItem.update({
      where: { id },
      data,
    });
    revalidatePath("/personnel/assets");
    revalidatePath(`/personnel/assets/stock/${id}`);
    return { success: true };
  } catch (e) {
    console.error("[updateStock]", e);
    return { success: false, error: "Failed to update stock item." };
  }
}

export async function getAllUnifiedAssets(): Promise<UnifiedAssetRow[]> {
  try {
    const assets = await getAssets();
    const stocks = await getStocks();

    const unified: UnifiedAssetRow[] = [
      ...assets.map(mapAssetToUnified),
      ...stocks.map(mapStockToUnified),
    ];

    unified.sort((a, b) => {
      const aField = a.article ?? a.account_code ?? a.category ?? a.id;
      const bField = b.article ?? b.account_code ?? b.category ?? b.id;
      return String(aField).localeCompare(String(bField));
    });

    return unified;
  } catch (e) {
    console.error("[getAllUnifiedAssets]", e);
    return [];
  }
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
        })
        .catch(() => []),
      // All issuance rows — multi-line docs keep the asset only inside
      // issuance_data.lines[].assetId, so matching happens in JS below.
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
       FROM issuance_records ORDER BY created_at DESC`.catch(() => []),
      // Requests naming this asset (directly or via line items) — approvals
      // assign assets without necessarily creating an issuance row.
      prisma.request
        .findMany({
          orderBy: { date_requested: "desc" },
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
        .findMany({ select: { request_id: true, asset_id: true } })
        .catch(() => [] as { request_id: string; asset_id: string | null }[]),
      prisma.profile
        .findMany({ select: { id: true, full_name: true } })
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
    const matchedRequests = requestRows.filter(
      (r) => r.asset_id === id || requestIdsForAsset.has(r.id)
    );

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
  const id = formData.get("id") as string;
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
    const val = raw as string;
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

  try {
    if (source === "stock") {
      // Sync stock-specific fields back to InventoryItem
      const stockData: Record<string, unknown> = {};
      const itemName = formData.get("article") as string | null;
      if (itemName) stockData["item_name"] = itemName.trim();
      const unit = formData.get("unit") as string | null;
      if (unit) {
        const canonical = await resolveUnitName(unit);
        if (!canonical) {
          return {
            success: false,
            error: `Unknown UNIT "${unit.trim()}" — ask your Super Admin to add it to Master Data.`,
          };
        }
        stockData["unit"] = canonical;
      }
      const qtyRaw = formData.get("quantity");
      if (qtyRaw) stockData["quantity"] = Number(qtyRaw);
      const loc = formData.get("location") as string | null;
      if (loc) stockData["location"] = loc;
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
        });
      }

      // Create or update an Asset record with all Asset fields the user entered
      const existingAsset = await prisma.asset.findUnique({
        where: { id },
        select: { id: true },
      });

      if (existingAsset) {
        await prisma.asset.update({
          where: { id },
          data,
        });
      } else {
        await prisma.asset.create({
          data: { ...data, id },
        });
      }

      revalidatePath("/personnel/assets");
      revalidatePath(`/personnel/assets/${id}`);
      return { success: true };
    } else {
      await prisma.asset.update({
        where: { id },
        data,
      });
      revalidatePath("/personnel/assets");
      revalidatePath(`/personnel/assets/${id}`);
      return { success: true };
    }
  } catch (e) {
    console.error("[updateUnifiedAsset]", e);
    return { success: false, error: "Failed to update asset." };
  }
}

// ── Add single asset ──────────────────────────────────────────────

export interface CreateAssetState {
  success?: boolean;
  error?: string;
  id?: string;
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
  const get = (k: string) => {
    const v = formData.get(k);
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
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
      select: { id: true },
    });

    revalidatePath("/personnel/assets");
    return { success: true, id: created.id };
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
  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0)
    return { success: false, error: "Choose an .xlsx file to import." };
  if (file.size > 10 * 1024 * 1024)
    return { success: false, error: "File is too large (max 10 MB)." };

  let wb: ExcelJS.Workbook;
  try {
    wb = new ExcelJS.Workbook();
    const buf = await file.arrayBuffer();
    await wb.xlsx.load(buf);
  } catch (e) {
    console.error("[importAssetsFromExcel] load", e);
    return { success: false, error: "Could not read that Excel file. Use the downloaded template (.xlsx)." };
  }

  const ws = wb.getWorksheet(ASSET_TEMPLATE_SHEET) ?? wb.worksheets[0];
  if (!ws) return { success: false, error: "No worksheet found in that file." };

  // Map normalized (trimmed) header -> column index. Tolerant of Excel
  // trimming the two trailing-space headers on re-save.
  const colByHeader = new Map<string, number>();
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    const raw = cellToValue(cell.value);
    const key = raw === null ? "" : String(raw).trim();
    if (key && !colByHeader.has(key)) colByHeader.set(key, col);
  });

  if (!colByHeader.has("ACCOUNT CODE"))
    return {
      success: false,
      error: `Header row not recognized — download the template and keep its ${ASSET_EXCEL_HEADERS.length} headers unchanged.`,
    };

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

    // Strict mode: unknown codes are skipped (listed below); unknown units
    // are nulled with a warning so the row itself is not lost.
    const catalogHit = catalogByCode.get(accountCode);
    if (!catalogHit) {
      skipped++;
      errors.push(
        `Row ${i} (${accountCode}): unknown ACCOUNT CODE — ask your Super Admin to add it to Master Data, then re-import this row.`
      );
      continue;
    }
    const unitRaw = strVal(at(row, "UNIT"));
    let unit: string | null = null;
    if (unitRaw) {
      const canonical = await resolveUnitName(unitRaw);
      if (!canonical) {
        errors.push(
          `Row ${i} (${accountCode}): unknown UNIT "${unitRaw}" — saved without a unit. Ask your Super Admin to add it to Master Data.`
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

    let qrCode = strVal(at(row, "PROPERTY No."));
    if (qrCode && seenQr.has(qrCode)) {
      errors.push(`Row ${i} (${accountCode}): duplicate PROPERTY No. "${qrCode}" in file — saved without it.`);
      qrCode = null;
    } else if (qrCode) {
      seenQr.add(qrCode);
      try {
        const clash = await prisma.asset.findUnique({
          where: { qr_code: qrCode },
          select: { property_number: true },
        });
        if (clash && clash.property_number !== accountCode) {
          errors.push(`Row ${i} (${accountCode}): PROPERTY No. "${qrCode}" already in use — saved without it.`);
          qrCode = null;
        }
      } catch {
        qrCode = null;
      }
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

    try {
      const existing = await prisma.asset.findUnique({
        where: { property_number: accountCode },
        select: { id: true },
      });
      if (existing) {
        await prisma.asset.update({ where: { property_number: accountCode }, data });
        updated++;
      } else {
        await prisma.asset.create({ data: { property_number: accountCode, ...data } });
        created++;
      }
    } catch (e) {
      console.error(`[importAssetsFromExcel] row ${i}`, e);
      errors.push(`Row ${i} (${accountCode}): could not save (${e instanceof Error ? e.message.slice(0, 120) : "unknown error"}).`);
    }
  }

  if (created === 0 && updated === 0)
    return {
      success: false,
      error: "No rows imported — fill the template starting at row 2 with an ACCOUNT CODE per row.",
      skipped,
      errors: errors.slice(0, 20),
    };

  revalidatePath("/personnel/assets");
  return { success: true, created, updated, skipped, errors: errors.slice(0, 20) };
}
