"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { createHash } from "crypto";
import ExcelJS from "exceljs";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { writeAuditLog } from "@/lib/audit";

const BUCKET = "ppmp-files";
const MAX_BYTES = 10 * 1024 * 1024;
// xlsx is a zip archive: PK\x03\x04
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

function revalidatePath(path: string) {
  nextRevalidatePath(path);
  // Narrow bust: PPMP writes touch only the file list (super_admin sees
  // all, personnel see own rows — the key's scope segments isolate callers).
  void import("@/lib/personnel-cache")
    .then((m) => m.bustCachePrefixes(["ppmp:"]))
    .catch(() => {});
}

export interface ImportPpmpState {
  success?: boolean;
  error?: string;
  imported?: number;
  errors?: string[];
  /** New row id when a file was stored (P1 vault fix). */
  fileId?: string;
  /** SHA-256 of the uploaded bytes. */
  fileHash?: string;
  /** True when the same bytes were already stored by this user. */
  duplicate?: boolean;
}

export interface PpmpSheetMeta {
  name: string;
  rows: number;
  cols: number;
}

export interface PpmpFileRow {
  id: string;
  filename: string;
  file_size: number | null;
  mime_type: string | null;
  file_hash: string | null;
  fiscal_year: number | null;
  fiscal_year_source: string | null;
  row_count: number | null;
  status: string | null;
  created_by: string;
  created_at: string | null;
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

function isNonEmptyRow(row: ExcelJS.Row): boolean {
  let hasAny = false;
  row.eachCell({ includeEmpty: false }, (cell) => {
    const v = cellToValue(cell.value);
    if (v === null) return;
    if (typeof v === "string" && v.trim() === "") return;
    hasAny = true;
  });
  return hasAny;
}

function inferFiscalYear(filename: string): { year: number | null; source: string | null } {
  const m = filename.match(/(19|20)\d{2}/);
  if (!m) return { year: null, source: null };
  const year = Number(m[0]);
  if (!Number.isInteger(year) || year < 1990 || year > 2100) return { year: null, source: null };
  return { year, source: "filename" };
}

export async function importPpmpFromExcel(
  _prevState: ImportPpmpState,
  formData: FormData
): Promise<ImportPpmpState> {
  const file = formData.get("file");
  if (!file || !(file instanceof File) || file.size === 0)
    return { success: false, error: "Choose an .xlsx file to import." };
  if (file.size > MAX_BYTES)
    return { success: false, error: "File is too large (max 10 MB)." };

  const filename = file.name || "upload.xlsx";
  if (/\.xls$/i.test(filename) && !/\.xlsx$/i.test(filename))
    return {
      success: false,
      error: "Only .xlsx files are supported. Re-save the workbook as .xlsx and try again.",
    };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Unauthorized." };

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await file.arrayBuffer());
  } catch (e) {
    console.error("[importPpmpFromExcel] read", e);
    return { success: false, error: "Could not read that file. Try again." };
  }
  if (
    bytes.length < 4 ||
    bytes[0] !== ZIP_MAGIC[0] ||
    bytes[1] !== ZIP_MAGIC[1] ||
    bytes[2] !== ZIP_MAGIC[2] ||
    bytes[3] !== ZIP_MAGIC[3]
  ) {
    return { success: false, error: "That is not a valid .xlsx file. Use a valid .xlsx file." };
  }

  let wb: ExcelJS.Workbook;
  try {
    wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  } catch (e) {
    console.error("[importPpmpFromExcel] load", e);
    return { success: false, error: "Could not read that Excel file. Use a valid .xlsx file." };
  }
  if (wb.worksheets.length === 0)
    return { success: false, error: "No worksheet found in that file." };

  const sheets: PpmpSheetMeta[] = [];
  let rowCount = 0;
  for (const ws of wb.worksheets) {
    const last = ws.lastRow?.number ?? ws.rowCount;
    let usable = 0;
    for (let i = 2; i <= last; i++) {
      if (isNonEmptyRow(ws.getRow(i))) usable++;
    }
    sheets.push({ name: ws.name, rows: usable, cols: ws.columnCount });
    rowCount += usable;
  }
  if (rowCount === 0)
    return { success: false, error: "No usable rows found in that file (only headers/blank rows)." };

  const hash = createHash("sha256").update(bytes).digest("hex");
  const { year: fiscalYear, source: fiscalYearSource } = inferFiscalYear(filename);

  // Duplicate content for this user: point at the existing row instead of
  // storing the bytes twice. Best-effort: a stale DB without the new
  // columns (pre-P1-migration) skips this check and falls through.
  try {
    const existing = await prisma.ppmpFile.findFirst({
      where: { created_by: user.id, file_hash: hash },
      select: { id: true },
    });
    if (existing) {
      return {
        success: true,
        imported: rowCount,
        fileId: existing.id,
        fileHash: hash,
        duplicate: true,
      };
    }
  } catch {
    /* pre-migration DB: continue without the dup check */
  }

  const safeName = filename.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "upload.xlsx";
  const storage_path = `ppmp/${user.id}/${Date.now()}_${safeName}`;
  const mime_type = file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storage_path, bytes, { contentType: mime_type, upsert: false });
  if (upErr) {
    console.error("[importPpmpFromExcel] upload", upErr);
    return { success: false, error: "Failed to store the PPMP file. Try again." };
  }

  const data = {
    filename,
    storage_path,
    file_size: file.size,
    mime_type,
    created_by: user.id,
    file_hash: hash,
    fiscal_year: fiscalYear,
    fiscal_year_source: fiscalYearSource,
    row_count: rowCount,
    sheet_meta: sheets as unknown as Parameters<typeof prisma.ppmpFile.create>[0]["data"]["sheet_meta"],
    status: "ready",
  };
  let createdId: string;
  try {
    const created = await prisma.ppmpFile.create({ data, select: { id: true } });
    createdId = created.id;
  } catch (e: unknown) {
    // Roll back the orphaned object, then handle a stale DB (missing new
    // columns) with a legacy-shape retry so uploads keep working mid-deploy.
    await supabase.storage.from(BUCKET).remove([storage_path]).catch(() => undefined);
    const code = (e as { code?: string } | null)?.code;
    if (code === "P2022") {
      try {
        const legacy = await prisma.ppmpFile.create({
          data: {
            filename,
            storage_path,
            file_size: file.size,
            mime_type,
            created_by: user.id,
          },
          select: { id: true },
        });
        // Legacy row written but bytes were rolled back: surface clearly.
        await prisma.ppmpFile.delete({ where: { id: legacy.id } }).catch(() => undefined);
        console.error("[importPpmpFromExcel] stale-db retry", e);
        return {
          success: false,
          error: "PPMP storage is being upgraded. Try again in a minute.",
        };
      } catch (e2) {
        console.error("[importPpmpFromExcel] db", e2);
        return { success: false, error: "Failed to save PPMP record. Try again." };
      }
    }
    console.error("[importPpmpFromExcel] db", e);
    return { success: false, error: "Failed to save PPMP record. Try again." };
  }

  await writeAuditLog({
    userId: user.id,
    action: "ppmp.file.uploaded",
    module: "ppmp",
    details: {
      purpose: `Upload PPMP file ${filename}`,
      summary: `${filename} · ${rowCount} usable row(s) · ${(file.size / 1024).toFixed(1)} KB`,
      reference_id: createdId,
      file_hash: hash,
    },
  });

  revalidatePath("/personnel/ppmp");
  return { success: true, imported: rowCount, fileId: createdId, fileHash: hash };
}

/** Owner-scoped file list (super_admin sees all). Never throws. */
export async function listPpmpFiles(): Promise<PpmpFileRow[]> {
  try {
    const { getPersonnelScope } = await import("@/lib/personnel-scope");
    const scope = await getPersonnelScope();
    if (scope.isEmpty || !scope.userId) return [];
    // Auth first, then scoped read-through (30s): personnel see own files,
    // super_admin sees all — withScopedCache embeds u/a/r so callers can
    // never share an entry. Never throws (outer catch returns []).
    // (Narrowed consts: TS narrowing on `scope.*` does not cross the
    // fetcher closure boundary.)
    const ownerId = scope.userId;
    const adminView = scope.isSuperAdmin;
    const { withScopedCache } = await import("@/lib/personnel-cache");
    return withScopedCache("ppmp:files", 30, async () => {
    try {
      const rows = await prisma.ppmpFile.findMany({
        where: adminView ? undefined : { created_by: ownerId },
        orderBy: { created_at: "desc" },
        take: 100,
        select: {
          id: true,
          filename: true,
          file_size: true,
          mime_type: true,
          file_hash: true,
          fiscal_year: true,
          fiscal_year_source: true,
          row_count: true,
          status: true,
          created_by: true,
          created_at: true,
        },
      });
      return rows.map((r) => ({ ...r, created_at: r.created_at?.toISOString() ?? null }));
    } catch {
      // Pre-migration DB fallback (legacy columns only).
      const rows = await prisma.ppmpFile.findMany({
        where: adminView ? undefined : { created_by: ownerId },
        orderBy: { created_at: "desc" },
        take: 100,
        select: {
          id: true,
          filename: true,
          file_size: true,
          mime_type: true,
          created_by: true,
          created_at: true,
        },
      });
      return rows.map((r) => ({
        ...r,
        file_hash: null,
        fiscal_year: null,
        fiscal_year_source: null,
        row_count: null,
        status: null,
        created_at: r.created_at?.toISOString() ?? null,
      }));
    }
    });
  } catch (e) {
    console.error("[listPpmpFiles]", e);
    return [];
  }
}

/** Delete a file (owner or super_admin). Removes the stored object + row. */
export async function deletePpmpFile(
  fileId: string
): Promise<{ success?: boolean; error?: string }> {
  if (!fileId) return { error: "File ID is required." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized." };

  const row = await prisma.ppmpFile
    .findUnique({ where: { id: fileId } })
    .catch(() => null);
  if (!row) return { error: "PPMP file not found." };

  const { getPersonnelScope } = await import("@/lib/personnel-scope");
  const scope = await getPersonnelScope();
  if (!scope.isSuperAdmin && row.created_by !== user.id)
    return { error: "You do not have access to this file." };

  const { error: rmErr } = await supabase.storage.from(BUCKET).remove([row.storage_path]);
  if (rmErr) {
    console.error("[deletePpmpFile] remove", rmErr);
    return { error: "Failed to delete the stored file. Try again." };
  }
  try {
    await prisma.ppmpFile.delete({ where: { id: fileId } });
  } catch (e) {
    console.error("[deletePpmpFile] db", e);
    return { error: "Stored file deleted, but the record could not be removed. Contact support." };
  }

  await writeAuditLog({
    userId: user.id,
    action: "ppmp.file.deleted",
    module: "ppmp",
    details: {
      purpose: `Delete PPMP file ${row.filename}`,
      summary: `${row.filename} deleted`,
      reference_id: fileId,
    },
  });

  revalidatePath("/personnel/ppmp");
  return { success: true };
}
