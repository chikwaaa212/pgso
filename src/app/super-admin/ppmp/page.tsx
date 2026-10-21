"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TablePager } from "@/components/personnel/TablePager";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildQueryKey } from "@/lib/query-keys";
import { PAGE_SIZE } from "@/lib/constants";
import { getPpmpFilesPage, getPpmpFilesSummary } from "./actions";

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  });
}

function fmtBytes(bytes: number | null) {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtNumber(n: number | null) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-PH");
}

function StatusPill({ status }: { status: string | null }) {
  const value = (status ?? "unknown").toLowerCase();
  const tone =
    value === "ready"
      ? "border-green-200 bg-green-50 text-green-800"
      : value === "failed"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-zinc-200 bg-zinc-50 text-zinc-700";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {value === "unknown" ? "Unknown" : value[0].toUpperCase() + value.slice(1)}
    </span>
  );
}

export default function SuperAdminPpmpFilesPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [fiscalYear, setFiscalYear] = useState("all");
  const [page, setPage] = useState(1);

  const { data: summary } = useCachedAction(
    buildQueryKey({ module: "super-admin", resource: "ppmp-files-summary" }),
    getPpmpFilesSummary,
    { staleTime: 60_000 }
  );

  const { data: paged, loading, isValidating } = useCachedAction(
    buildQueryKey({
      module: "super-admin",
      resource: "ppmp-files",
      page,
      filters: { q: debouncedQuery, fiscalYear },
    }),
    () =>
      getPpmpFilesPage({
        page,
        q: debouncedQuery,
        fiscalYear: fiscalYear === "all" ? null : Number(fiscalYear),
      }),
    { staleTime: 30_000 }
  );

  const rows = useMemo(() => paged?.rows ?? [], [paged]);
  const total = paged?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const years = summary?.fiscalYears ?? [];

  if (loading && rows.length === 0) {
    return (
      <section className="grid gap-4">
        <div>
          <p className="text-sm text-zinc-500">PPMP</p>
          <h1 className="mt-1 text-2xl font-semibold text-navy-900">PPMP Files</h1>
        </div>
        <Card className="p-6">
          <p className="flex items-center gap-2 text-sm text-zinc-500" role="status">
            <Loader2 className="size-4 animate-spin" /> Loading uploaded PPMP files…
          </p>
        </Card>
      </section>
    );
  }

  const cards = [
    { label: "PPMP files", value: fmtNumber(summary?.files ?? 0) },
    { label: "Usable rows", value: fmtNumber(summary?.rows ?? 0) },
    { label: "Storage used", value: summary?.bytes ? fmtBytes(summary.bytes) : "0 B" },
    { label: "Uploaders", value: fmtNumber(summary?.uploaders ?? 0) },
    { label: "Fiscal years", value: fmtNumber(years.length) },
  ];

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">PPMP</p>
          <h1 className="mt-1 text-2xl font-semibold text-navy-900">PPMP Files</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Every uploaded PPMP workbook in the system, across all personnel accounts —
            newest first.{isValidating ? " Updating…" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => router.push("/super-admin/ppmp/analytics")}
          >
            Open Analytics
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => router.push("/super-admin/ppmp/planning")}
          >
            Open Planning
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              {card.label}
            </p>
            <p className="mt-1 text-xl font-semibold text-navy-900">{card.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search filename, uploader, or fiscal year…"
            className="w-full min-w-0 sm:max-w-md"
            aria-label="Search PPMP files"
          />
          <Select
            value={fiscalYear}
            onValueChange={(v) => {
              setFiscalYear(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44" aria-label="Filter by fiscal year">
              <SelectValue placeholder="Fiscal year: All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Fiscal year: All</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  FY {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-zinc-500">
            {total} {total === 1 ? "file" : "files"} found
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium">Fiscal year</th>
                <th className="px-3 py-2 text-right font-medium">Rows</th>
                <th className="px-3 py-2 text-right font-medium">Size</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Uploaded by</th>
                <th className="px-3 py-2 font-medium">Uploaded at</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 align-top">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-navy-900">{r.filename}</div>
                    <div className="text-xs text-zinc-500">
                      {r.file_hash ? `SHA-256 ${r.file_hash.slice(0, 12)}…` : "No content hash"}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.fiscal_year ?? "—"}
                    {r.fiscal_year_source ? (
                      <span className="ml-1 text-xs text-zinc-500">({r.fiscal_year_source})</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtNumber(r.row_count)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {fmtBytes(r.file_size)}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="text-navy-900">{r.uploader_name ?? "Unknown uploader"}</div>
                    <div className="text-xs text-zinc-500">{r.created_by.slice(0, 8)}…</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-zinc-700">
                    {fmtDateTime(r.created_at)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-zinc-500">
                    {debouncedQuery || fiscalYear !== "all"
                      ? "No uploaded PPMP files match this filter."
                      : "No PPMP files have been uploaded yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {total > 0 ? (
          <TablePager
            id="admin-ppmp-files"
            total={total}
            pageSize={PAGE_SIZE}
            page={safePage}
            onPageChange={setPage}
          />
        ) : null}
      </Card>
    </section>
  );
}
