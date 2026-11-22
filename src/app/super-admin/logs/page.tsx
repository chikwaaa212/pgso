"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  CalendarClock,
  Layers3,
  Radio,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/personnel/PageHeader";
import { SummaryTiles } from "@/components/personnel/SummaryTiles";
import { label } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildQueryKey } from "@/lib/query-keys";
import { SEARCH_DEBOUNCE_MS } from "@/lib/constants";
import {
  getAdminLogModules,
  getAdminLogStats,
  type LogOrder,
  type LogRange,
} from "./actions";
import { SuperAdminLogsTable } from "./logs-table";
import LogsLoading from "./loading";
import ui from "@/components/personnel/personnel-ui.module.css";
import styles from "./page.module.css";

const MANILA = "Asia/Manila";

/** Yellow 24px action buttons — same treatment as the other admin pages. */
const ACTION_BTN = cn(
  "h-6 gap-1.5 rounded-[4px] border border-yellow-500 bg-yellow-500 px-3 text-xs font-semibold",
  "text-navy-900 opacity-[0.85] transition-colors hover:bg-yellow-400 hover:text-navy-900 hover:opacity-100 disabled:opacity-40"
);

const RANGES: Array<{ value: LogRange; label: string }> = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function relTime(iso: string | null) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    timeZone: MANILA,
  });
}

function fmtFull(iso: string | null) {
  if (!iso) return "No activity yet";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No activity yet";
  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: MANILA,
  });
}

export default function SuperAdminLogsPage() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [range, setRange] = useState<LogRange>("all");
  const [order, setOrder] = useState<LogOrder>("desc");
  const [total, setTotal] = useState(0);

  const {
    data: stats,
    loading,
    isValidating,
    refresh,
  } = useCachedAction(
    buildQueryKey({ module: "super-admin", resource: "logs", filters: { view: "stats" } }),
    getAdminLogStats,
    { staleTime: 30_000 }
  );

  const { data: modulesData } = useCachedAction(
    buildQueryKey({ module: "super-admin", resource: "logs-modules" }),
    getAdminLogModules,
    { staleTime: 300_000 }
  );
  const modules = useMemo(
    () => ["all", ...((modulesData ?? []).filter(Boolean))],
    [modulesData]
  );

  const onTotalChange = useCallback((n: number) => setTotal(n), []);

  if (loading && !stats) {
    return <LogsLoading />;
  }

  const tiles = [
    {
      label: "Total entries",
      value: stats ? stats.total.toLocaleString("en-PH") : "—",
      hint: "Recorded across every account",
      icon: Activity,
      tone: "info" as const,
    },
    {
      label: "Active users",
      value: stats ? stats.users.toLocaleString("en-PH") : "—",
      hint: "Accounts with recorded actions",
      icon: Users,
      tone: "ok" as const,
    },
    {
      label: "Modules touched",
      value: stats ? stats.modules.toLocaleString("en-PH") : "—",
      hint: stats?.byModule.length
        ? stats.byModule
            .slice(0, 3)
            .map((m) => m.module)
            .join(" · ")
        : "Deliveries, stocks, repairs…",
      icon: Layers3,
      tone: "warn" as const,
    },
    {
      label: "Last 7 days",
      value: stats ? stats.last7.toLocaleString("en-PH") : "—",
      hint: "Actions this week",
      icon: CalendarClock,
      tone: "info" as const,
    },
    {
      label: "Last activity",
      value: stats ? relTime(stats.lastActivity) : "—",
      hint: fmtFull(stats?.lastActivity ?? null),
      icon: Radio,
      tone: "ok" as const,
    },
  ];

  const filtersActive =
    debouncedQuery.trim() !== "" || moduleFilter !== "all" || range !== "all";

  return (
    <section className={styles.section}>
      <PageHeader
        eyebrow="Accountability"
        title="System logs"
        subtitle="Every recorded action across the province — who did what, in which module, and when. Expand any row for the full audit payload."
        meta={
          <>
            <span className={styles.liveBadge}>
              <span className={styles.liveDot} aria-hidden="true" />
              Live trail
            </span>
            <span aria-hidden="true">·</span>
            {total.toLocaleString("en-PH")} {total === 1 ? "entry" : "entries"} in
            view
            {stats ? (
              <>
                <span aria-hidden="true">·</span>
                {stats.last7.toLocaleString("en-PH")} in the last 7 days
              </>
            ) : null}
            {isValidating ? <span className={styles.updating}> · Updating…</span> : null}
          </>
        }
        actions={
          <>
            <Link href="/super-admin/reports" className={ui.ghostButton}>
              Open reports
            </Link>
            <Button
              type="button"
              onClick={refresh}
              disabled={isValidating}
              title="Reload the audit overview"
              className={ACTION_BTN}
            >
              <RefreshCw
                size={14}
                aria-hidden="true"
                className={isValidating ? "animate-spin" : undefined}
              />
              {isValidating ? "Refreshing…" : "Refresh"}
            </Button>
          </>
        }
      />

      <SummaryTiles tiles={tiles} ariaLabel="Audit summary" />

      <Card className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Audit trail</h2>
            <p className={styles.panelSub}>
              Newest first by default. Filter by user, module or date range, then
              expand a row for the full record.
            </p>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <div className={styles.searchWrap}>
              <Search size={15} aria-hidden="true" className={styles.searchIcon} />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search action, user, module, purpose…"
                className={styles.search}
                aria-label="Search logs"
              />
            </div>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className={styles.select} aria-label="Filter by module">
                <SelectValue placeholder="Module: All" />
              </SelectTrigger>
              <SelectContent>
                {modules.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m === "all" ? "Module: All" : label(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={styles.toolbarRight}>
            <div className={styles.chips} role="group" aria-label="Date range">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  className={styles.chip}
                  data-active={range === r.value}
                  aria-pressed={range === r.value}
                  onClick={() => setRange(r.value)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={styles.sortToggle}
              onClick={() => setOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
              title={order === "desc" ? "Showing newest first" : "Showing oldest first"}
              aria-label={
                order === "desc"
                  ? "Sorted newest first. Switch to oldest first."
                  : "Sorted oldest first. Switch to newest first."
              }
            >
              {order === "desc" ? (
                <ArrowDownWideNarrow size={14} aria-hidden="true" />
              ) : (
                <ArrowUpNarrowWide size={14} aria-hidden="true" />
              )}
              {order === "desc" ? "Newest" : "Oldest"}
            </button>
            {filtersActive ? (
              <button
                type="button"
                className={styles.clearFilters}
                onClick={() => {
                  setQuery("");
                  setModuleFilter("all");
                  setRange("all");
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        <SuperAdminLogsTable
          key={`${debouncedQuery}|${moduleFilter}|${range}|${order}`}
          q={debouncedQuery}
          module={moduleFilter}
          range={range}
          order={order}
          onTotalChange={onTotalChange}
        />
      </Card>
    </section>
  );
}
