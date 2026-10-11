import "server-only";

import type ExcelJS from "exceljs";

/** Plain-text extraction mirroring the vault import (P1) unwrapping. */
export function rawText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if (typeof v.text === "string") return v.text;
    if (Array.isArray(v.richText))
      return (v.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
    if (v.result !== undefined && v.result !== null && typeof v.result !== "object")
      return String(v.result);
    if (typeof v.hyperlink === "string") return v.hyperlink;
  }
  return "";
}

export function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** "Column 1".."Column 30" helper cells under GPPB headers. */
export function isColumnLabel(s: string): boolean {
  return /^column\d{1,2}$/i.test(s.replace(/\s+/g, ""));
}
