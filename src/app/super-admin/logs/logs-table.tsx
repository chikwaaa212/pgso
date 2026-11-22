"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  Boxes,
  ChevronDown,
  ClipboardCheck,
  Copy,
  FileText,
  Inbox,
  Package,
  ScanLine,
  Send,
  ShieldCheck,
  Sparkles,
  Truck,
  UserRound,
  Wrench,
} from "lucide-react";
import type { ComponentType } from "react";
import { toast } from "sonner";
import { TablePager, FIXED_PAGE_SIZE } from "@/components/personnel/TablePager";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey } from "@/lib/query-keys";
import ui from "@/components/personnel/personnel-ui.module.css";
import {
  getLogsPage,
  type LogOrder,
  type LogRange,
  type SystemLogRow,
} from "./actions";
import styles from "./page.module.css";

type IconComponent = ComponentType<{
  size?: number | string;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

const MODULE_META: Record<
  string,
  { icon: IconComponent; tone: "info" | "ok" | "warn" | "bad" | "neutral" }
> = {
  delivery: { icon: Truck, tone: "info" },
  deliveries: { icon: Truck, tone: "info" },
  inspection: { icon: ClipboardCheck, tone: "warn" },
  inspections: { icon: ClipboardCheck, tone: "warn" },
  stock: { icon: Boxes, tone: "ok" },
  stocks: { icon: Boxes, tone: "ok" },
  inventory: { icon: Boxes, tone: "ok" },
  asset: { icon: Package, tone: "info" },
  assets: { icon: Package, tone: "info" },
  issuance: { icon: Send, tone: "ok" },
  issuances: { icon: Send, tone: "ok" },
  request: { icon: UserRound, tone: "warn" },
  requests: { icon: UserRound, tone: "warn" },
  repair: { icon: Wrench, tone: "warn" },
  repairs: { icon: Wrench, tone: "warn" },
  document: { icon: FileText, tone: "info" },
  documents: { icon: FileText, tone: "info" },
  account: { icon: ShieldCheck, tone: "neutral" },
  users: { icon: ShieldCheck, tone: "neutral" },
  auth: { icon: ShieldCheck, tone: "neutral" },
  scan: { icon: ScanLine, tone: "info" },
};

function moduleMeta(moduleName: string) {
  return (
    MODULE_META[moduleName.toLowerCase()] ?? {
      icon: Sparkles,
      tone: "neutral" as const,
    }
  );
}

function prettyAction(action: string) {
  return action.replace(/[:_]+/g, " ").replace(/\s+/g, " ").trim();
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function actionTone(action: string): "ok" | "bad" | "warn" | "info" {
  const a = action.toLowerCase();
  if (/(reject|delete|remove|fail|cancel|void|declin)/.test(a)) return "bad";
  if (/(approve|pass|complete|issue|receive|deliver|accept|create|add)/.test(a))
    return "ok";
  if (/(update|edit|adjust|return|pending|transfer|scan)/.test(a)) return "warn";
  return "info";
}

const MANILA = "Asia/Manila";

function fmtFull(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: MANILA,
  });
}

function fmtDay(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: MANILA,
  });
}

function fmtTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: MANILA,
  });
}

function relTime(iso: string | null) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return fmtDay(iso);
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.trim() === "" ? "—" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const DETAIL_SKIP = new Set([
  "purpose",
  "summary",
  "description",
  "remarks",
  "reason",
  "reference_id",
]);

const LOAD_HEADERS = [
  "When",
  "User",
  "Action",
  "Module",
  "Purpose / summary",
  "Reference",
];

export function SuperAdminLogsTable({
  q,
  module,
  range,
  order,
  onTotalChange,
}: {
  q: string;
  module: string;
  range: LogRange;
  order: LogOrder;
  onTotalChange?: (total: number) => void;
}) {
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pagePending, setPagePending] = useState(false);
  const sawValidating = useRef(false);

  const {
    data,
    loading,
    isValidating: fetching,
    refresh,
  } = useCachedAction(
    buildQueryKey({
      module: "super-admin",
      resource: "logs",
      page,
      filters: { q, module, range, order },
    }),
    () => getLogsPage({ page, q, module, range, order }),
    { staleTime: 30_000 }
  );
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const total = data?.total ?? 0;

  const pageCount = Math.max(1, Math.ceil(total / FIXED_PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const from = total === 0 ? 0 : (safePage - 1) * FIXED_PAGE_SIZE + 1;
  const to = Math.min(safePage * FIXED_PAGE_SIZE, total);

  useEffect(() => {
    onTotalChange?.(total);
  }, [total, onTotalChange]);

  // Release the page skeleton as soon as the new page's data lands. A fresh
  // cache hit resolves without `isValidating` ever flipping true, so the
  // data effect covers that path; the validating effect covers failures and
  // empty responses where the payload reference never changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the page skeleton once the new page paints
    setPagePending(false);
  }, [data]);

  useEffect(() => {
    if (fetching) {
      sawValidating.current = true;
      return;
    }
    if (sawValidating.current) {
      sawValidating.current = false;
      setPagePending(false);
    }
  }, [fetching]);

  const toggleExpanded = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const onRowKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleExpanded(id);
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  if (loading && rows.length === 0) {
    return (
      <div aria-busy="true" aria-label="Loading logs">
        <div className={styles.toolbar}>
          <p className={styles.resultInfo}>
            <span
              aria-hidden="true"
              className="block h-3 w-40 animate-pulse rounded bg-navy-100"
            />
          </p>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                {LOAD_HEADERS.map((h) => (
                  <th key={h}>{h}</th>
                ))}
                <th aria-label="Expand" />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: FIXED_PAGE_SIZE }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.05 }}>
                  <td>
                    <div className="h-3.5 w-28 animate-pulse rounded bg-navy-100" />
                    <div className="mt-1.5 h-3 w-20 animate-pulse rounded bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-3.5 w-24 animate-pulse rounded bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-[22px] w-24 animate-pulse rounded-full bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-3.5 w-20 animate-pulse rounded bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-3.5 w-full animate-pulse rounded bg-navy-100" />
                    <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-5 w-16 animate-pulse rounded bg-navy-100" />
                  </td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.toolbar}>
        <p className={styles.resultInfo} aria-live="polite">
          {total === 0 ? (
            "No entries"
          ) : (
            <>
              Showing <strong>{from}–{to}</strong> of{" "}
              <strong>{total.toLocaleString("en-PH")}</strong>{" "}
              {total === 1 ? "entry" : "entries"}
            </>
          )}
          {fetching ? <span className={styles.updating}> · Updating…</span> : null}
        </p>
        <button
          type="button"
          className={ui.ghostButton}
          onClick={refresh}
          disabled={fetching}
        >
          Refresh
        </button>
      </div>

      {pagePending ? (
        <div className={styles.tableWrap} aria-busy="true" aria-label="Loading page">
          <table className={styles.table} aria-hidden="true">
            <thead>
              <tr>
                {LOAD_HEADERS.map((h) => (
                  <th key={h}>{h}</th>
                ))}
                <th aria-label="Expand" />
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: FIXED_PAGE_SIZE }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.05 }}>
                  <td>
                    <div className="h-3.5 w-28 animate-pulse rounded bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-3.5 w-24 animate-pulse rounded bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-[22px] w-24 animate-pulse rounded-full bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-3.5 w-20 animate-pulse rounded bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-3.5 w-full animate-pulse rounded bg-navy-100" />
                  </td>
                  <td>
                    <div className="h-5 w-16 animate-pulse rounded bg-navy-100" />
                  </td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : rows.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon} aria-hidden="true">
            <Inbox size={22} />
          </span>
          <p className={styles.emptyTitle}>No log entries match this view</p>
          <p className={styles.emptyText}>
            Try a different keyword, module or date range. Entries appear the
            moment any account performs a recorded action.
          </p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Action</th>
                <th>Module</th>
                <th>Purpose / summary</th>
                <th>Reference</th>
                <th aria-label="Expand" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = moduleMeta(r.module);
                const Icon = meta.icon;
                const expanded = expandedId === r.id;
                return (
                  <LogRow
                    key={r.id}
                    row={r}
                    icon={Icon}
                    moduleTone={meta.tone}
                    expanded={expanded}
                    onToggle={() => toggleExpanded(r.id)}
                    onKeyDown={(e) => onRowKeyDown(e, r.id)}
                    onCopy={copyText}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 ? (
        <TablePager
          id="admin-logs"
          total={total}
          pageSize={FIXED_PAGE_SIZE}
          page={safePage}
          onPageChange={(next) => {
            if (next === safePage) return;
            setPagePending(true);
            setPage(next);
            setExpandedId(null);
          }}
        />
      ) : null}
    </div>
  );
}

function LogRow({
  row,
  icon: Icon,
  moduleTone,
  expanded,
  onToggle,
  onKeyDown,
  onCopy,
}: {
  row: SystemLogRow;
  icon: IconComponent;
  moduleTone: "info" | "ok" | "warn" | "bad" | "neutral";
  expanded: boolean;
  onToggle: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => void;
  onCopy: (text: string, label: string) => void;
}) {
  const extraDetails = row.details
    ? Object.entries(row.details).filter(([key]) => !DETAIL_SKIP.has(key))
    : [];

  return (
    <>
      <tr
        className={styles.row}
        data-expanded={expanded}
        tabIndex={0}
        role="button"
        aria-expanded={expanded}
        aria-label={`${cap(prettyAction(row.action))} by ${row.user_name} in ${row.module} on ${fmtFull(row.created_at)}. ${
          expanded ? "Collapse details" : "Expand details"
        }`}
        onClick={onToggle}
        onKeyDown={onKeyDown}
      >
        <td className={styles.whenCell}>
          <div className={styles.whenCellInner}>
            <span className={styles.whenDate} title={fmtFull(row.created_at)}>
              {fmtDay(row.created_at)}
            </span>
            <span className={styles.whenMeta}>
              {fmtTime(row.created_at)}
              {row.created_at ? (
                <span className={styles.rel}>{relTime(row.created_at)}</span>
              ) : null}
            </span>
          </div>
        </td>
        <td>
          <span className={styles.userCell}>
            <span className={styles.avatar} aria-hidden="true">
              {initials(row.user_name)}
            </span>
            <span className={styles.userName}>{row.user_name}</span>
          </span>
        </td>
        <td>
          <span className={styles.actionBadge} data-tone={actionTone(row.action)}>
            {cap(prettyAction(row.action))}
          </span>
        </td>
        <td>
          <span className={styles.moduleChip} data-tone={moduleTone}>
            <Icon size={13} aria-hidden="true" />
            {cap(row.module)}
          </span>
        </td>
        <td className={styles.purposeCell}>
          {row.purpose ? (
            <span className={styles.purposeMain}>{row.purpose}</span>
          ) : null}
          {row.summary ? (
            <span className={styles.purposeSub}>{row.summary}</span>
          ) : null}
          {!row.purpose && !row.summary ? (
            <span className={styles.muted}>—</span>
          ) : null}
        </td>
        <td>
          {row.reference_id ? (
            <button
              type="button"
              className={styles.refButton}
              title={`Copy reference ${row.reference_id}`}
              onClick={(e) => {
                e.stopPropagation();
                void onCopy(row.reference_id ?? "", "Reference");
              }}
            >
              {row.reference_id.slice(0, 8).toUpperCase()}
              <Copy size={12} aria-hidden="true" />
            </button>
          ) : (
            <span className={styles.muted}>—</span>
          )}
        </td>
        <td className={styles.chevronCell}>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={styles.chevron}
            data-open={expanded}
          />
        </td>
      </tr>
      {expanded ? (
        <tr className={styles.detailRow}>
          <td colSpan={7} className={styles.detailCell}>
            <div className={styles.detailGrid}>
              <div className={styles.detailItem}>
                <span className={styles.detailKey}>Logged at</span>
                <span className={styles.detailValue}>{fmtFull(row.created_at)}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailKey}>User</span>
                <span className={styles.detailValue}>{row.user_name}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailKey}>Action</span>
                <span className={styles.detailValue}>
                  {cap(prettyAction(row.action))}
                </span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailKey}>Module</span>
                <span className={styles.detailValue}>{cap(row.module)}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailKey}>Purpose</span>
                <span className={styles.detailValue}>{row.purpose ?? "—"}</span>
              </div>
              <div className={styles.detailItem}>
                <span className={styles.detailKey}>Summary</span>
                <span className={styles.detailValue}>{row.summary ?? "—"}</span>
              </div>
              {row.reference_id ? (
                <div className={styles.detailItem}>
                  <span className={styles.detailKey}>Reference</span>
                  <span className={styles.detailValue}>
                    <code>{row.reference_id}</code>
                  </span>
                </div>
              ) : null}
              {extraDetails.map(([key, value]) => (
                <div key={key} className={styles.detailItem}>
                  <span className={styles.detailKey}>
                    {key.replace(/[_-]+/g, " ")}
                  </span>
                  <span className={styles.detailValue}>
                    {formatDetailValue(value)}
                  </span>
                </div>
              ))}
            </div>
            <div className={styles.detailFooter}>
              <span className={styles.detailId}>Log ID {row.id}</span>
              <button
                type="button"
                className={ui.ghostButton}
                onClick={(e) => {
                  e.stopPropagation();
                  void onCopy(row.id, "Log ID");
                }}
              >
                <Copy size={13} aria-hidden="true" />
                Copy log ID
              </button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
