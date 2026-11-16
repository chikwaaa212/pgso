"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  CalendarClock,
  Layers3,
  Radio,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/personnel/PageHeader";
import { SummaryTiles } from "@/components/personnel/SummaryTiles";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey } from "@/lib/query-keys";
import { getMyLogStats } from "./actions";
import { LogsTable } from "./logs-table";
import styles from "./page.module.css";
import ui from "@/components/personnel/personnel-ui.module.css";

const MANILA = "Asia/Manila";

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

export default function PersonnelLogsPage() {
  // Total comes from the server-paged table (fixed window, DB page).
  const [total, setTotal] = useState(0);

  const { data: stats } = useCachedAction(
    buildQueryKey({
      module: "personnel",
      resource: "logs",
      filters: { view: "stats" },
    }),
    getMyLogStats,
    { staleTime: 30_000 }
  );

  const tiles = [
    {
      label: "Total entries",
      value: stats ? stats.total.toLocaleString("en-PH") : "—",
      hint: "Recorded under your account",
      icon: Activity,
      tone: "info" as const,
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
      tone: "ok" as const,
    },
    {
      label: "Last 7 days",
      value: stats ? stats.last7.toLocaleString("en-PH") : "—",
      hint: "Actions this week",
      icon: CalendarClock,
      tone: "warn" as const,
    },
    {
      label: "Last activity",
      value: stats ? relTime(stats.lastActivity) : "—",
      hint: fmtFull(stats?.lastActivity ?? null),
      icon: Radio,
      tone: "neutral" as const,
    },
  ];

  return (
    <section className={ui.page}>
      <PageHeader
        eyebrow="Accountability"
        title="Activity logs"
        subtitle="Every action you take is recorded with its module, purpose, and timestamp — newest first. Click any row to expand the full audit detail."
        meta={
          <>
            <span className={styles.liveBadge}>
              <span className={styles.liveDot} aria-hidden="true" />
              Live trail
            </span>
            <span aria-hidden="true">·</span>
            {total} {total === 1 ? "entry" : "entries"}
          </>
        }
        actions={
          <Link href="/personnel/reports" className={ui.ghostButton}>
            Open reports
          </Link>
        }
      />

      <SummaryTiles tiles={tiles} ariaLabel="Activity summary" />

      <Card className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Audit trail</h2>
            <p className={styles.panelSub}>
              Expand a row for the full record.
            </p>
          </div>
        </div>
        <LogsTable onTotalChange={setTotal} />
      </Card>
    </section>
  );
}
