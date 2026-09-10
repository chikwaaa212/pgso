import path from "path";
import { PrismaClient, Prisma } from "@prisma/client"
import ExcelJS from "exceljs"

const prisma = new PrismaClient()

const EXCEL_FILE = path.resolve(
  process.cwd(),
  "public",
  "Sample Header and sample Data - updated.xlsx",
);

function normalizeCondition(value: unknown): string {
  if (!value) return "serviceable";
  const lower = String(value).toLowerCase().trim();
  if (lower.includes("unservice") || lower.includes("broken") || lower.includes("bad")) {
    return "unserviceable";
  }
  return "serviceable";
}

function normalizeStatus(value: unknown): string {
  if (!value) return "available";
  const lower = String(value).toLowerCase().trim();
  if (lower.includes("unservice") || lower.includes("retired") || lower.includes("disposed")) {
    return "retired";
  }
  return "available";
}

function toInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function toDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return new Prisma.Decimal(n);
}

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

async function main() {
  console.log("Reading Excel file:", EXCEL_FILE);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_FILE);

  const ws = wb.getWorksheet("PPE CONSOLIDATED");
  if (!ws) {
    throw new Error("Worksheet 'PPE CONSOLIDATED' not found");
  }

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum] = String(cell.value || "").trim();
  });

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 2; i <= (ws.lastRow?.number ?? ws.rowCount); i++) {
    const row = ws.getRow(i);

    const data: Record<string, unknown> = {};
    row.eachCell({ includeEmpty: false }, (cell, colNum) => {
      const key = headers[colNum];
      if (key) {
        data[key] = cell.value;
      }
    });

    const accountCode = String(data["ACCOUNT CODE"] || "").trim();
    if (!accountCode) {
      skipped++;
      continue;
    }

    try {
      await prisma.asset.upsert({
        where: {
          property_number: accountCode,
        },
        update: buildUpdate(data),
        create: {
          property_number: accountCode,
          ...buildUpdate(data),
        },
      });
      imported++;
    } catch (e) {
      errors.push(`Row ${i} (${accountCode}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nImported ${imported} assets (${skipped} skipped).`);
  if (errors.length > 0) {
    console.error(`\n${errors.length} errors:`);
    errors.forEach((e) => console.error("  -", e));
  }
}

function buildUpdate(data: Record<string, unknown>) {
  const condition = String(data["CONDITION"] || "").trim() || undefined;
  const status = String(data["STATUS"] || "").trim() || undefined;

  return {
    account_code: str(data["ACCOUNT CODE"]),
    identifier: str(data["IDENTIFIER "]),
    account_title: str(data["ACCOUNT TITLE"]),
    account_name: str(data["ACCOUNT NAME"]),
    category: str(data["ASSET TYPE"]),
    article: str(data["ARTICLE"]),
    quantity: toInt(data["QTY."]),
    unit: str(data["UNIT"]),
    description: str(data["DESCRIPTION"]),
    date_acquired: toDate(data["DATE ACQUIRED"]),
    location: str(data["LOCATION"]),
    total_cost: toDecimal(data["TOTAL COST"]),
    remarks: str(data["REMARKS"]),
    condition: normalizeCondition(condition),
    unit_cost: toDecimal(data["UNIT COST"]),
    brand: str(data["BRAND"]),
    cylinders: toInt(data["No. of Cyl."]),
    engine_displacement: str(data["Engine Displacement"]),
    fuel_type: str(data["Fuel Type"]),
    engine_number: str(data["ENGINE#"]),
    chassis_number: str(data["CHASSIS#"]),
    color: str(data["COLOR"]),
    plate_number: str(data["PLATE NO."]),
    fund: str(data["FUND"]),
    status: normalizeStatus(status || condition),
    dv_tracking_number: str(data["DV TRACKING NUMBER"]),
    supplier_payee: str(data["SUPPLIER/PAYEE"]),
    account_name_charge: str(data["ACCOUNT NAME-CHARGE"]),
    account_number: str(data["ACCOUNT NUMBER"]),
    obr_number: str(data["OBR NUMBER"]),
    dv_number: str(data["DV NUMBER"]),
    date_received: toDate(data["DATE RECEIVED AT INVENTORY SECTION"]),
    qr_code: str(data["PROPERTY No. "]),
  };
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
