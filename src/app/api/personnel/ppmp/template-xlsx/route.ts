import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import ExcelJS from "exceljs";

export const runtime = "nodejs";

const PPMP_HEADERS = [
  "ITEM NO.",
  "DESCRIPTION",
  "UNIT",
  "QUANTITY",
  "UNIT COST",
  "TOTAL COST",
  "REMARKS",
];

const COLUMN_WIDTHS: number[] = [12, 40, 12, 12, 14, 14, 24];

function buildPpmpTemplateWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PGSO";
  wb.title = "PPMP Import Template";
  wb.created = new Date();

  const ws = wb.addWorksheet("PPMP", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  ws.columns = PPMP_HEADERS.map((header, i) => ({
    header,
    key: `c${i + 1}`,
    width: COLUMN_WIDTHS[i] ?? 18,
  }));

  const headerRow = ws.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1B2A4A" },
    };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });

  const exampleRow = ws.getRow(2);
  exampleRow.height = 22;
  exampleRow.getCell(1).value = 1;
  exampleRow.getCell(2).value = "Example item description";
  exampleRow.getCell(3).value = "pcs";
  exampleRow.getCell(4).value = 10;
  exampleRow.getCell(5).value = 500;
  exampleRow.getCell(6).value = 5000;
  exampleRow.getCell(7).value = "";
  for (let col = 1; col <= PPMP_HEADERS.length; col++) {
    const cell = exampleRow.getCell(col);
    cell.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF404040" } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFB0B0B0" } },
      left: { style: "thin", color: { argb: "FFB0B0B0" } },
      bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
      right: { style: "thin", color: { argb: "FFB0B0B0" } },
    };
  }

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: PPMP_HEADERS.length },
  };

  return wb;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized.", { status: 401 });
    const profile = await prisma
      .profile
      .findUnique({ where: { id: user.id }, select: { role: true, status: true } })
      .catch(() => null);
    if (
      !profile ||
      profile.status !== "active" ||
      (profile.role !== "pgso_personnel" && profile.role !== "super_admin")
    ) {
      return new Response("Forbidden.", { status: 403 });
    }
  } catch {
    return new Response("Unauthorized.", { status: 401 });
  }

  const wb = buildPpmpTemplateWorkbook();
  const raw = await wb.xlsx.writeBuffer();
  const body = new Uint8Array(raw as ArrayBuffer);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="PPMP-TEMPLATE.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}