import { Card } from "@/components/ui/card";
import { CheckCheck, ClipboardList, Clock, Inbox, Plus } from "lucide-react";
import req from "./page.module.css";

/**
 * Requests-specific skeleton — mirrors PersonnelRequestsPage 1:1
 * (eyebrow + header + live count + yellow action, three summary tiles,
 * status tabs + instant search + type filter, then the 9-column table and
 * pager) so content swaps in without layout shift.
 *
 * Static chrome renders as real text and real classes; only live values are
 * pulse placeholders sized to the real cells.
 */

const STATUS_TABS = [
  "All",
  "Pending",
  "Approved",
  "Rejected",
  "Completed",
] as const;

const HEADERS = [
  "Requested by",
  "Assigned to",
  "Type",
  "Item",
  "Details",
  "Requested",
  "Resolved",
  "Status",
  "Actions",
] as const;

const SUMMARY = [
  { label: "In your queue", meta: "All statuses sent to you", tone: "info", Icon: Inbox },
  { label: "Pending in queue", meta: "Needs your decision", tone: "warn", Icon: Clock },
  {
    label: "Approved in queue",
    meta: "Completed · ready to close out",
    tone: "ok",
    Icon: CheckCheck,
  },
] as const;

function TextPulse({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`animate-pulse rounded bg-navy-100 ${className}`}
    />
  );
}

export default function RequestsLoading() {
  return (
    <section
      className={req.section}
      aria-busy="true"
      aria-label="Loading requests"
    >
      {/* Header — same structure and copy as the real page. */}
      <header className={req.header}>
        <div className={req.headerText}>
          <span className={req.eyebrow}>
            <ClipboardList size={13} aria-hidden="true" />
            Request queue
          </span>
          <h1 className={req.title}>Requests</h1>
          <p className={req.subtitle}>
            Review requests sent to you, then approve, reject, or complete them.
            Use “New request” to file one for an employee.
          </p>
        </div>
        <div className={req.headerActions} aria-hidden="true">
          <span className="inline-flex h-8 items-center gap-2 rounded-[4px] border border-[var(--color-yellow-600)] bg-[var(--color-yellow-500)] px-3.5 text-xs font-semibold text-[var(--color-navy-900)]">
            <Plus size={14} aria-hidden="true" />
            New request
          </span>
        </div>
      </header>

      {/* Summary tiles — same three cards, tones, and labels. */}
      <div className={req.summary} aria-hidden="true">
        {SUMMARY.map(({ label, meta, tone, Icon }) => (
          <article key={label} className={req.summaryCard} data-tone={tone}>
            <span className={req.summaryIcon}>
              <Icon size={16} aria-hidden="true" />
            </span>
            <div className={req.summaryBody}>
              <p className={req.summaryLabel}>{label}</p>
              <p className={req.summaryValue}>
                <TextPulse className="my-0.5 inline-block h-6 w-10" />
              </p>
              <p className={req.summaryMeta}>{meta}</p>
            </div>
          </article>
        ))}
      </div>

      <Card className={req.panel}>
        {/* Toolbar — status tabs + instant search + type filter. */}
        <div className={req.toolbar} aria-hidden="true">
          <div
            className={req.tabs}
            role="tablist"
            aria-label="Filter by status"
          >
            {STATUS_TABS.map((t) => (
              <span key={t} className={req.tab} data-active={t === "All"}>
                {t}
              </span>
            ))}
          </div>
          <div className={req.filters}>
            <div
              className={`${req.search} h-8 animate-pulse rounded-md bg-navy-100`}
            />
            <div className="h-8 w-[11.5rem] animate-pulse rounded-md bg-navy-100" />
          </div>
        </div>

        {/* Table — exact columns and cell shapes, 10 rows (default page size). */}
        <div className={req.tableWrap}>
          <table className={req.table} aria-hidden="true">
            <thead>
              <tr>
                {HEADERS.map((h) => (
                  <th
                    key={h}
                    className={h === "Actions" ? req.actionsHead : undefined}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 10 }).map((_, r) => (
                <tr key={r} style={{ opacity: 1 - r * 0.05 }}>
                  <td>
                    <TextPulse className="h-3.5 w-24" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <div className="h-[22px] w-24 animate-pulse rounded-full bg-navy-100" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-28" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-36" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <TextPulse className="h-3.5 w-20" />
                  </td>
                  <td>
                    <div className="h-[22px] w-16 animate-pulse rounded-full bg-navy-100" />
                  </td>
                  <td className={req.actionsCell}>
                    <div className={req.rowActions}>
                      <div className="h-6 w-[4.75rem] animate-pulse rounded-[4px] bg-navy-100" />
                      <div className="h-6 w-[4rem] animate-pulse rounded-[4px] bg-navy-100" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pager — same placement and height as TablePager. */}
        <div className={req.pagerSkeleton} aria-hidden="true">
          <TextPulse className="h-3 w-40" />
          <div className="flex items-center gap-1.5">
            <div className="h-8 w-8 animate-pulse rounded-[4px] bg-navy-100" />
            <div className="h-8 w-8 animate-pulse rounded-[4px] bg-navy-100" />
            <div className="h-8 w-8 animate-pulse rounded-[4px] bg-navy-100" />
            <div className="h-8 w-8 animate-pulse rounded-[4px] bg-navy-100" />
          </div>
        </div>
      </Card>
    </section>
  );
}
