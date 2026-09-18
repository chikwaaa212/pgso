"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

function revalidatePath(path: string) {
  nextRevalidatePath(path);
  void import("@/lib/personnel-cache")
    .then((m) => m.bustPersonnelCache())
    .catch(() => {});
}

export interface ImportPpmpState {
  success?: boolean;
  error?: string;
  imported?: number;
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

export async function importPpmpFromExcel(
  _prevState: ImportPpmpState,
  formData: FormData
): Promise<ImportPpmpState> {
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
    console.error("[importPpmpFromExcel] load", e);
    return { success: false, error: "Could not read that Excel file. Use a valid .xlsx file." };
  }

  const ws = wb.worksheets[0];
  if (!ws) return { success: false, error: "No worksheet found in that file." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized." };

  const filename = file.name;
  const mime_type = file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const file_size = file.size;
  const storage_path = `ppmp/${user.id}/${Date.now()}_${filename}`;

  let rowCount = 0;
  const last = ws.lastRow?.number ?? ws.rowCount;
  for (let i = 2; i <= last; i++) {
    const row = ws.getRow(i);
    let hasAny = false;
    row.eachCell({ includeEmpty: false }, () => {
      hasAny = true;
    });
    if (!hasAny) continue;
    rowCount++;
  }

  try {
    await prisma.ppmpFile.create({
      data: {
        filename,
        storage_path,
        file_size,
        mime_type,
        created_by: user.id,
      },
    });
  } catch (e) {
    console.error("[importPpmpFromExcel] db", e);
    return { success: false, error: "Failed to save PPMP record. Try again." };
  }

  revalidatePath("/personnel/ppmp");
  return { success: true, imported: rowCount };
}