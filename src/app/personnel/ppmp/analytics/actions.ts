'use server';

import { randomUUID } from "crypto";
import { inspectWorkbook } from "@/lib/ppmp/inspector";
import { normalizeHeader } from "@/lib/ppmp/aliases";
import { loadConfig } from "@/lib/ppmp/analytics/config";
import { runAnalysis } from "@/lib/ppmp/analytics/index";
import type { AnalysisReport, YearFile } from "@/lib/ppmp/analytics/types";
import type { WorkbookProfile } from "@/lib/ppmp/types";
import { writeAuditLog } from "@/lib/audit";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "ppmp-files";
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const PARSER_VERSION = "v1";

export interface InspectedFile {
  fileId: string;
  filename: string;
  fileSize: number | null;
  fileHash: string | null;
  storedYear: number | null;
  profile: WorkbookProfile;
}

export interface InspectResult {
  success?: boolean;
  error?: string;
  files?: InspectedFile[];
}

/**
 * Validate access + inspect workbooks (read-only: bytes are never modified).
 * Returns per-sheet profiles and validation issues for the preview step.
 */
export async function inspectPpmpFiles(fileIds: string[]): Promise<InspectResult> {
  if (!Array.isArray(fileIds) || fileIds.length === 0)
    return { error: "Select at least one PPMP file." };
  if (fileIds.length > MAX_FILES)
    return { error: `Select at most ${MAX_FILES} files per analysis.` };
  const unique = [...new Set(fileIds)];
  if (unique.length !== fileIds.length)
    return { error: "Duplicate files selected." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized." };

  const { getPersonnelScope } = await import("@/lib/personnel-scope");
  const scope = await getPersonnelScope();
  if (scope.isEmpty || !scope.userId) return { error: "Unauthorized." };

  const rows = await prisma.ppmpFile
    .findMany({ where: { id: { in: unique } } })
    .catch(() => null);
  if (!rows || rows.length !== unique.length)
    return { error: "One or more selected files no longer exist." };
  for (const row of rows) {
    if (!scope.isSuperAdmin && row.created_by !== user.id)
      return { error: "You do not have access to one or more selected files." };
  }

  const files: InspectedFile[] = [];
  for (const row of rows) {
    let data: Blob | null = null;
    try {
      const { data: blob, error } = await supabase.storage
        .from(BUCKET)
        .download(row.storage_path);
      if (error || !blob) {
        // Legacy metadata-only rows (pre-P1, no backing bytes).
        return {
          error: `"${row.filename}" has no stored workbook (uploaded before file storage was enabled). Re-upload it to analyze.`,
        };
      }
      data = blob;
    } catch (e) {
      console.error("[inspectPpmpFiles] download", e);
      return { error: `Failed to read "${row.filename}". Try again.` };
    }
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (bytes.length > MAX_BYTES)
      return { error: `"${row.filename}" exceeds the 10 MB analysis limit.` };
    let profile: WorkbookProfile;
    try {
      profile = await inspectWorkbook(bytes, { filename: row.filename });
    } catch (e) {
      console.error("[inspectPpmpFiles] inspect", e);
      return {
        error: `"${row.filename}" could not be read as a workbook. Use a valid .xlsx file.`,
      };
    }
    files.push({
      fileId: row.id,
      filename: row.filename,
      fileSize: row.file_size,
      fileHash: row.file_hash,
      storedYear: row.fiscal_year,
      profile,
    });
  }

  await writeAuditLog({
    userId: user.id,
    action: "ppmp.file.inspected",
    module: "ppmp",
    details: {
      purpose: `Inspect ${files.length} PPMP file(s) for analysis`,
      summary: files.map((f) => f.filename).join(", "),
      reference_id: files.map((f) => f.fileId).join(","),
    },
  });

  return { success: true, files };
}

export interface RunResult {
  success?: boolean;
  error?: string;
  errorCode?: string;
  sessionId?: string;
}

export interface SessionStatus {
  sessionId: string;
  stage: string;
  status: string;
  errorCode: string | null;
}

export interface SessionResult {
  sessionId: string;
  preset: string | null;
  files: { fileId: string; filename: string; fiscalYear: number | null }[];
  configVersion: number | null;
  createdAt: string | null;
  report: AnalysisReport;
}

async function requireSessionAccess(
  sessionId: string,
  userId: string,
  isSuperAdmin: boolean
): Promise<{ ok: boolean; error?: string }> {
  const rows = await prisma
    .$queryRaw<Array<{ user_id: string }>>`SELECT user_id FROM ppmp_analysis_sessions WHERE id = ${sessionId}::uuid`
    .catch(() => null);
  const row = rows?.[0];
  if (!row) return { ok: false, error: "Analysis session not found." };
  if (!isSuperAdmin && row.user_id !== userId)
    return { ok: false, error: "You do not have access to this analysis." };
  return { ok: true };
}

/**
 * Run the deterministic pipeline over 1..3 owned files and persist the
 * session + result. Synchronous (GUADA-scale workbooks parse in ~2s);
 * the status endpoint stays available for polling and audit.
 */
export async function runPpmpAnalysis(
  fileIds: string[],
  preset?: string
): Promise<RunResult> {
  if (!Array.isArray(fileIds) || fileIds.length === 0)
    return { error: "Select at least one PPMP file.", errorCode: "NO_FILES" };
  if (fileIds.length > MAX_FILES)
    return { error: `Select at most ${MAX_FILES} files per analysis.`, errorCode: "TOO_MANY_FILES" };
  const unique = [...new Set(fileIds)];
  if (unique.length !== fileIds.length)
    return { error: "Duplicate files selected.", errorCode: "DUPLICATE_FILES" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized.", errorCode: "UNAUTHORIZED" };

  const { getPersonnelScope } = await import("@/lib/personnel-scope");
  const scope = await getPersonnelScope();
  if (scope.isEmpty || !scope.userId) return { error: "Unauthorized.", errorCode: "UNAUTHORIZED" };

  const rows = await prisma.ppmpFile
    .findMany({ where: { id: { in: unique } } })
    .catch(() => null);
  if (!rows || rows.length !== unique.length)
    return { error: "One or more selected files no longer exist.", errorCode: "FILE_MISSING" };
  for (const row of rows) {
    if (!scope.isSuperAdmin && row.created_by !== user.id)
      return { error: "You do not have access to one or more selected files.", errorCode: "FORBIDDEN" };
  }

  // Rate limit: 100 analyses per user per hour (best-effort; fail open).
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recent = await prisma.$queryRaw<Array<{ n: string }>>`
      SELECT COUNT(*)::text AS n FROM ppmp_analysis_sessions
      WHERE user_id = ${user.id}::uuid AND created_at > ${since}::timestamptz`;
    if (Number(recent[0]?.n ?? 0) >= 100) {
      return {
        error: "Analysis limit reached (100 per hour). Try again later.",
        errorCode: "RATE_LIMITED",
      };
    }
  } catch {
    /* fail open: rate table missing pre-migration */
  }

  const sessionId = randomUUID();
  const fileHashes = rows.map((r) => r.file_hash ?? null);
  await prisma.$executeRaw`
    INSERT INTO ppmp_analysis_sessions (id, user_id, preset, file_ids, file_hashes, parser_version, stage, status)
    VALUES (${sessionId}::uuid, ${user.id}::uuid, ${preset ?? null}, ${JSON.stringify(unique)}::jsonb, ${JSON.stringify(fileHashes)}::jsonb, ${PARSER_VERSION}, 'reading', 'running')`.catch(() => null);

  const fail = async (error: string, errorCode: string): Promise<RunResult> => {
    await prisma.$executeRaw`
      UPDATE ppmp_analysis_sessions SET stage = 'failed', status = 'failed', error_code = ${errorCode}, completed_at = now()
      WHERE id = ${sessionId}::uuid`.catch(() => undefined);
    await writeAuditLog({
      userId: user.id,
      action: "ppmp.analysis.failed",
      module: "ppmp",
      details: { purpose: "PPMP analysis failed", summary: error, reference_id: sessionId },
    });
    return { error, errorCode, sessionId };
  };

  try {
    const config = await loadConfig();
    const stock = await prisma.inventoryItem
      .findMany({ select: { item_name: true, quantity: true, unit: true } })
      .catch(() => []);
    const onHand = new Map<string, number>();
    for (const s of stock as Array<{ item_name: string; quantity: number; unit: string | null }>) {
      const key = `${normalizeHeader(s.item_name)}|${normalizeHeader(s.unit ?? "")}`;
      onHand.set(key, (onHand.get(key) ?? 0) + s.quantity);
    }

    const yearFiles: YearFile[] = [];
    for (const row of rows) {
      await prisma.$executeRaw`
        UPDATE ppmp_analysis_sessions SET stage = 'reading' WHERE id = ${sessionId}::uuid`.catch(() => undefined);
      // Parse cache: same bytes + parser version => same rows. Keyed by
      // content hash, so re-uploads and repeat analyses skip Excel I/O.
      // Skipped for large files: multi-hundred-KB payloads over Upstash REST
      // reliably exceed the 2.5s cache budget (and log timeout spam) while
      // in-process parsing takes ~1-2s, so direct parsing is faster anyway.
      // Best-effort: any cache failure falls through to direct parsing.
      const useParseCache = !!row.file_hash && (row.file_size ?? 0) <= 150000;
      const { cacheGet, cacheKey } = await import("@/lib/personnel-cache");
      const parseKey = cacheKey("ppmp:parse", { h: row.file_hash ?? row.id, v: PARSER_VERSION });
      const cached = useParseCache
        ? await cacheGet<{ rows: YearFile["rows"]; fiscalYear: number | null; office: string | null }>(parseKey)
        : null;
      if (cached && cached.rows.length > 0) {
        yearFiles.push({ fileId: row.id, filename: row.filename, fiscalYear: cached.fiscalYear, rows: cached.rows });
        continue;
      }
      const { data: blob, error } = await supabase.storage.from(BUCKET).download(row.storage_path);
      if (error || !blob) {
        return await fail(
          `"${row.filename}" has no stored workbook (uploaded before file storage was enabled). Re-upload it to analyze.`,
          "NO_BYTES"
        );
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length > MAX_BYTES) {
        return await fail(`"${row.filename}" exceeds the 10 MB analysis limit.`, "TOO_LARGE");
      }
      await prisma.$executeRaw`
        UPDATE ppmp_analysis_sessions SET stage = 'processing' WHERE id = ${sessionId}::uuid`.catch(() => undefined);
      let profile: WorkbookProfile;
      try {
        const { inspectWorkbook } = await import("@/lib/ppmp/inspector");
        profile = await inspectWorkbook(bytes, { filename: row.filename });
      } catch (e) {
        console.error("[runPpmpAnalysis] inspect", e);
        return await fail(`"${row.filename}" could not be read as a workbook.`, "CORRUPT");
      }
      const fiscalYear = row.fiscal_year ?? profile.fiscalYear;
      const hash8 = (row.file_hash ?? "").slice(0, 8) || "unknown";
      const { parseLineSheet } = await import("@/lib/ppmp/parser");
      const allRows: YearFile["rows"] = [];
      for (const sheet of profile.sheets) {
        if (sheet.kind !== "LINE_LIST" || sheet.headerRow === null) continue;
        try {
          const parsed = await parseLineSheet(bytes, sheet.name, sheet.headerRow, {
            fileId: row.id,
            filename: row.filename,
            fileHash8: hash8,
            fiscalYear,
            officeDefault: profile.office,
          });
          allRows.push(...parsed.rows);
        } catch (e) {
          console.error("[runPpmpAnalysis] parse", sheet.name, e);
        }
      }
      yearFiles.push({ fileId: row.id, filename: row.filename, fiscalYear, rows: allRows });
      // Cache the parse for small files only (see note above: large payloads
      // time out over Upstash REST and spam the logs for zero benefit).
      if (useParseCache && allRows.length > 0) {
        try {
          const { cacheKey: makeKey, cacheSet } = await import("@/lib/personnel-cache");
          const entry = { rows: allRows, fiscalYear, office: profile.office };
          if (JSON.stringify(entry).length < 1000000) {
            await cacheSet(makeKey("ppmp:parse", { h: row.file_hash, v: PARSER_VERSION }), entry, 3600);
          }
        } catch {
          /* best-effort */
        }
      }
    }

    if (!yearFiles.some((f) => f.rows.length > 0)) {
      return await fail(
        "No usable PPMP lines were found in the selected files. Check the validation preview for unsupported sheets.",
        "NO_USABLE_DATA"
      );
    }

    await prisma.$executeRaw`
      UPDATE ppmp_analysis_sessions SET stage = 'calculating' WHERE id = ${sessionId}::uuid`.catch(() => undefined);
    const report = runAnalysis(yearFiles, config, onHand.size > 0 ? { onHand } : undefined);

    await prisma.$executeRaw`
      INSERT INTO ppmp_analysis_results
        (session_id, overview, quarterly, file_insights, yoy, trends, anomalies, costs, forecasts, recommendations, limitations, config)
      VALUES (${sessionId}::uuid, ${JSON.stringify(report.overview)}::jsonb, ${JSON.stringify(report.quarterly)}::jsonb, ${JSON.stringify(report.fileInsights)}::jsonb, ${JSON.stringify(report.yoy)}::jsonb,
        ${JSON.stringify(report.trends)}::jsonb, ${JSON.stringify(report.anomalies)}::jsonb,
        ${JSON.stringify(report.costs)}::jsonb, ${JSON.stringify(report.forecasts)}::jsonb,
        ${JSON.stringify(report.recommendations)}::jsonb, ${JSON.stringify(report.limitations)}::jsonb,
        ${JSON.stringify(config)}::jsonb)`;
    await prisma.$executeRaw`
      UPDATE ppmp_analysis_sessions
      SET stage = 'complete', status = 'succeeded', config_version = ${config.version}, completed_at = now()
      WHERE id = ${sessionId}::uuid`;

    await writeAuditLog({
      userId: user.id,
      action: "ppmp.analysis.completed",
      module: "ppmp",
      details: {
        purpose: `PPMP analysis over ${yearFiles.length} file(s)`,
        summary: `${report.overview.line_items} line(s), ${report.recommendations.length} review flag(s)`,
        reference_id: sessionId,
        file_ids: unique,
      },
    });

    return { success: true, sessionId };
  } catch (e) {
    console.error("[runPpmpAnalysis]", e);
    return await fail("Analysis failed unexpectedly. Try again.", "FAILED");
  }
}

export async function getAnalysisStatus(sessionId: string): Promise<SessionStatus | { error: string }> {
  if (!sessionId) return { error: "Session ID is required." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized." };
  const { getPersonnelScope } = await import("@/lib/personnel-scope");
  const scope = await getPersonnelScope();
  if (scope.isEmpty || !scope.userId) return { error: "Unauthorized." };
  const access = await requireSessionAccess(sessionId, user.id, scope.isSuperAdmin);
  if (!access.ok) return { error: access.error as string };
  const rows = await prisma.$queryRaw<
    Array<{ stage: string; status: string; error_code: string | null }>
  >`SELECT stage, status, error_code FROM ppmp_analysis_sessions WHERE id = ${sessionId}::uuid`.catch(() => null);
  const row = rows?.[0];
  if (!row) return { error: "Analysis session not found." };
  return { sessionId, stage: row.stage, status: row.status, errorCode: row.error_code };
}

export async function getAnalysisResult(sessionId: string): Promise<SessionResult | { error: string }> {
  if (!sessionId) return { error: "Session ID is required." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized." };
  const { getPersonnelScope } = await import("@/lib/personnel-scope");
  const scope = await getPersonnelScope();
  if (scope.isEmpty || !scope.userId) return { error: "Unauthorized." };
  const access = await requireSessionAccess(sessionId, user.id, scope.isSuperAdmin);
  if (!access.ok) return { error: access.error as string };
  const rows = await prisma.$queryRaw<
    Array<{
      preset: string | null;
      file_ids: string[];
      file_hashes: (string | null)[];
      config_version: number | null;
      created_at: Date | null;
      status: string;
      overview: AnalysisReport["overview"];
      quarterly: AnalysisReport["quarterly"];
      file_insights: AnalysisReport["fileInsights"] | null;
      yoy: AnalysisReport["yoy"];
      trends: AnalysisReport["trends"];
      anomalies: AnalysisReport["anomalies"];
      costs: AnalysisReport["costs"];
      forecasts: AnalysisReport["forecasts"];
      recommendations: AnalysisReport["recommendations"];
      limitations: AnalysisReport["limitations"];
    }>
  >`SELECT s.preset, s.file_ids, s.file_hashes, s.config_version, s.created_at, s.status,
      r.overview, r.quarterly, r.file_insights, r.yoy, r.trends, r.anomalies, r.costs, r.forecasts,
      r.recommendations, r.limitations
    FROM ppmp_analysis_sessions s
    LEFT JOIN ppmp_analysis_results r ON r.session_id = s.id
    WHERE s.id = ${sessionId}::uuid`.catch(() => null);
  const row = rows?.[0];
  if (!row) return { error: "Analysis session not found." };
  if (row.status !== "succeeded" || !row.overview)
    return { error: "Analysis is not complete yet." };
  const meta = await prisma.ppmpFile
    .findMany({
      where: { id: { in: row.file_ids as string[] } },
      select: { id: true, filename: true, fiscal_year: true },
    })
    .catch(() => []);
  const byId = new Map(meta.map((m) => [m.id, m]));
  const files = (row.file_ids as string[]).map((fileId) => ({
    fileId,
    filename: byId.get(fileId)?.filename ?? "removed file",
    fiscalYear: byId.get(fileId)?.fiscal_year ?? null,
  }));
  return {
    sessionId,
    preset: row.preset,
    files,
    configVersion: row.config_version,
    createdAt: row.created_at?.toISOString() ?? null,
    report: {
      overview: row.overview,
      fileInsights: row.file_insights ?? {
        totalLines: 0,
        totalBudgetCents: null,
        byCategory: [],
        byOffice: [],
        byMode: [],
        monthlyStarts: [],
        monthlyDeliveries: [],
        scheduleCoverage: { withStart: 0, withDelivery: 0, total: 0 },
        topItems: [],
        duplicates: [],
        deliveryMomentum: null,
        narrative: [],
      },
      quarterly: row.quarterly ?? {
        cells: [],
        unscheduledStarts: 0,
        unscheduledDeliveries: 0,
        unscheduledBudgetCents: null,
        rule: "",
      },
      yoy: row.yoy,
      trends: row.trends,
      anomalies: row.anomalies,
      costs: row.costs,
      forecasts: row.forecasts,
      recommendations: row.recommendations,
      limitations: row.limitations,
    },
  };
}

