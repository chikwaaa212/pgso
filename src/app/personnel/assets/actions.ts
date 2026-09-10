"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/lib/prisma";
import { generateQrDataUrl } from "@/lib/qrcode";

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
  "reorder_threshold",
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
    if (key === "quantity" || key === "reorder_threshold") {
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

  try {
    if (source === "stock") {
      // Sync stock-specific fields back to InventoryItem
      const stockData: Record<string, unknown> = {};
      const itemName = formData.get("article") as string | null;
      if (itemName) stockData["item_name"] = itemName.trim();
      const unit = formData.get("unit") as string | null;
      if (unit) stockData["unit"] = unit;
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
