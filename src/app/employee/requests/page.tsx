"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Plus,
  Search,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import type { RequestRow } from "@/app/personnel/requests/actions";
import { getMyRequests, getMyRequestOptions } from "../actions";
import { NewRequestForm } from "./request-form";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import { useCachedAction } from "@/hooks/use-cached-action";
import { buildQueryKey } from "@/lib/query-keys";
import RequestsLoading from "./loading";
import shell from "../page-shell.module.css";
import styles from "./page.module.css";

type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

const STATUS_CHIPS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "completed", label: "Completed" },
  { key: "rejected", label: "Rejected" },
] as const;

function tone(status: string | null): Tone {
  if (status === "approved" || status === "completed") return "ok";
  if (status === "rejected") return "bad";
  if (status === "pending") return "warn";
  return "neutral";
}

function statusLabel(status: string | null) {
  if (!status) return "-";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

function fmtDate(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

/** Last line of the reason block - the form stores notes on multiple lines. */
function reasonLine(request: RequestRow) {
  const value = request.description?.split("\n").filter(Boolean).pop();
  return value?.trim() || "-";
}

export default function EmployeeRequestsPage() {
  // Cached snapshot (my requests + form options): back-navigation paints
  // instantly from memory / sessionStorage and only revalidates silently
  // when stale (30s, matching the personnel lists) - same SWR pattern as
  // the personnel dashboard / deliveries pages. A DB outage never crashes
  // the page: stale data stays visible and only cold starts surface the
  // error with a Retry.
  const { data: snapshot, loading, error, refresh, mutate } = useCachedAction(
    buildQueryKey({ module: 'employee', resource: 'requests' }),
    () =>
      Promise.all([getMyRequests(), getMyRequestOptions()]).then(
        ([requests, options]) => ({ requests, options })
      ),
    { staleTime: 30_000 }
  );

  // Optimistic filing: the new request paints instantly (temp row on top);
  // success reconciles via silent refresh, failure rolls the temp row back.
  // Same pattern as personnel asset create - never throws, never fetches.
  const handleOptimisticFile = useCallback((temp: RequestRow) => {
    mutate((prev) => (prev ? { ...prev, requests: [temp, ...prev.requests] } : prev));
  }, [mutate]);
  const handleOptimisticRollback = useCallback((tempId: string) => {
    mutate((prev) =>
      prev ? { ...prev, requests: prev.requests.filter((r) => r.id !== tempId) } : prev
    );
  }, [mutate]);

  const requests = useMemo(() => snapshot?.requests ?? [], [snapshot]);
  const options = useMemo(
    () => snapshot?.options ?? { assets: [], personnel: [] },
    [snapshot]
  );

  const counts = useMemo(() => {
    const base = { pending: 0, approved: 0, completed: 0, rejected: 0 };
    for (const request of requests) {
      if (request.status && request.status in base) {
        base[request.status as keyof typeof base] += 1;
      }
    }
    return base;
  }, [requests]);

  const [status, setStatus] = useState<string>("all");
  const [query, setQuery] = useState("");

  const visibleRequests = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((request) => {
      if (status !== "all" && (request.status ?? "pending") !== status) return false;
      if (!q) return true;
      return [
        requestTypeLabel(request.request_type),
        request.recipient_name,
        request.asset_label,
        request.description,
        request.account_code,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [requests, status, query]);

  if (loading) {
    return <RequestsLoading />;
  }

  if (!snapshot) {
    return (
      <section className={shell.page}>
        <nav className={shell.crumb} aria-label="Breadcrumb">
          <Link href="/employee/dashboard" className={shell.crumbLink}>
            Employee
          </Link>
          <span aria-hidden="true">/</span>
          <span data-current="true">My Requests</span>
        </nav>
        <header className={shell.pageHead}>
          <div className={shell.headText}>
            <span className={shell.eyebrow}>
              <ClipboardList size={12} aria-hidden="true" />
              Service desk
            </span>
            <h1 className={shell.title}>My Requests</h1>
            <p className={shell.subtitle}>
              {error || "Could not load your requests."}
            </p>
          </div>
        </header>
        <section className={shell.panel}>
          <div className={shell.empty}>
            <span className={shell.emptyIcon}>
              <XCircle size={18} aria-hidden="true" />
            </span>
            <p className={shell.emptyTitle}>Requests could not be reached</p>
            <p className={shell.emptyText}>
              The database may be temporarily unavailable. Your previously loaded
              requests reappear automatically - or try again now.
            </p>
            <button type="button" onClick={refresh} className={shell.emptyAction}>
              Retry
            </button>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className={shell.page}>
      <nav className={shell.crumb} aria-label="Breadcrumb">
        <Link href="/employee/dashboard" className={shell.crumbLink}>
          Employee
        </Link>
        <span aria-hidden="true">/</span>
        <span data-current="true">My Requests</span>
      </nav>

      <header className={shell.pageHead}>
        <div className={shell.headText}>
          <span className={shell.eyebrow}>
            <ClipboardList size={12} aria-hidden="true" />
            Service desk
          </span>
          <h1 className={shell.title}>My Requests</h1>
          <p className={shell.subtitle}>
            Transfer or report an item for repair, request disposal of a
            serviceable-out item, or request a new assignment. PGSO personnel
            review every request and update its status here.
          </p>
        </div>
        <div className={shell.headActions}>
          <Link href="/employee/assets" className={shell.btnSecondary}>
            My assets
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
          <a href="#file-request" className={shell.btnPrimary}>
            <Plus size={14} aria-hidden="true" />
            New request
          </a>
        </div>
      </header>

      {/* ---------------- Stat strip ---------------- */}
      <div className={shell.statStrip}>
        <button
          type="button"
          className={shell.stat}
          data-active={status === "all"}
          onClick={() => setStatus("all")}
          aria-pressed={status === "all"}
        >
          <span className={shell.statIcon}>
            <ClipboardList size={15} aria-hidden="true" />
          </span>
          <span className={shell.statBody}>
            <span className={shell.statValue}>{requests.length}</span>
            <span className={shell.statLabel}>Requests filed</span>
          </span>
        </button>
        <button
          type="button"
          className={shell.stat}
          data-active={status === "pending"}
          onClick={() => setStatus("pending")}
          aria-pressed={status === "pending"}
        >
          <span className={shell.statIcon} data-tone="warn">
            <Clock3 size={15} aria-hidden="true" />
          </span>
          <span className={shell.statBody}>
            <span className={shell.statValue}>{counts.pending}</span>
            <span className={shell.statLabel}>Awaiting review</span>
          </span>
        </button>
        <button
          type="button"
          className={shell.stat}
          data-active={status === "approved"}
          onClick={() => setStatus("approved")}
          aria-pressed={status === "approved"}
        >
          <span className={shell.statIcon} data-tone="info">
            <Send size={15} aria-hidden="true" />
          </span>
          <span className={shell.statBody}>
            <span className={shell.statValue}>{counts.approved}</span>
            <span className={shell.statLabel}>Approved</span>
          </span>
        </button>
        <button
          type="button"
          className={shell.stat}
          data-active={status === "completed"}
          onClick={() => setStatus("completed")}
          aria-pressed={status === "completed"}
        >
          <span className={shell.statIcon} data-tone="ok">
            <CheckCircle2 size={15} aria-hidden="true" />
          </span>
          <span className={shell.statBody}>
            <span className={shell.statValue}>{counts.completed}</span>
            <span className={shell.statLabel}>Completed</span>
          </span>
        </button>
      </div>

      {/* ---------------- File a request ---------------- */}
      <section className={shell.panel} id="file-request">
        <header className={shell.panelHead}>
          <div className={shell.panelHeadText}>
            <h2 className={shell.panelTitle}>
              <Plus size={15} aria-hidden="true" />
              File a new request
            </h2>
            <p className={shell.panelSub}>
              New assignments can pick an asset or a stock lot (every delivery is an
              asset; stock is its quantity on hand).
            </p>
          </div>
        </header>
        <div className={styles.formWrap}>
          <NewRequestForm
            assets={options.assets}
            personnel={options.personnel}
            onFiled={refresh}
            onOptimisticFile={handleOptimisticFile}
            onOptimisticRollback={handleOptimisticRollback}
          />
        </div>
      </section>

      {/* ---------------- History ---------------- */}
      <section className={shell.panel}>
        <header className={shell.panelHead}>
          <div className={shell.panelHeadText}>
            <h2 className={shell.panelTitle}>
              <ClipboardList size={15} aria-hidden="true" />
              Request history
            </h2>
            <p className={shell.panelSub}>
              Newest first, with live status and the QR copy once completed.
            </p>
          </div>
          <div className={shell.panelActions}>
            <span className={shell.countBadge}>{visibleRequests.length}</span>
          </div>
        </header>

        <div className={shell.toolbar}>
          <label className={shell.search}>
            <Search className={shell.searchIcon} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search type, item, recipient, reason..."
              className={shell.searchInput}
              aria-label="Search my requests"
            />
            {query && (
              <button
                type="button"
                className={shell.searchClear}
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                <X size={12} aria-hidden="true" />
              </button>
            )}
          </label>
          <div className={shell.filters} role="group" aria-label="Filter by status">
            {STATUS_CHIPS.map((chip) => {
              const count =
                chip.key === "all"
                  ? requests.length
                  : counts[chip.key as keyof typeof counts] ?? 0;
              return (
                <button
                  key={chip.key}
                  type="button"
                  className={shell.filterChip}
                  data-active={status === chip.key}
                  onClick={() => setStatus(chip.key)}
                  aria-pressed={status === chip.key}
                >
                  {chip.label}
                  <span className={shell.filterCount}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {visibleRequests.length === 0 ? (
          <div className={shell.empty}>
            <span className={shell.emptyIcon}>
              <ClipboardList size={18} aria-hidden="true" />
            </span>
            <p className={shell.emptyTitle}>
              {requests.length === 0 ? "No requests yet" : "No matching requests"}
            </p>
            <p className={shell.emptyText}>
              {requests.length === 0
                ? "File a request above - transfers, repairs and new assignments all show up here."
                : "Try a different search term or switch the status filter back to all."}
            </p>
            {requests.length > 0 && (
              <button
                type="button"
                className={shell.emptyAction}
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                }}
              >
                Reset filters
              </button>
            )}
          </div>
        ) : (
          <div className={shell.tableWrap}>
            <table className={shell.table}>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Sent to</th>
                  <th>Item</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Filed</th>
                  <th>Resolved</th>
                  <th>QR</th>
                </tr>
              </thead>
              <tbody>
                {visibleRequests.map((r) => (
                  <tr key={r.id}>
                    <td>{requestTypeLabel(r.request_type)}</td>
                    <td>{r.recipient_name ?? "-"}</td>
                    <td className={shell.colWide}>{r.asset_label ?? "-"}</td>
                    <td className={shell.colWide}>{reasonLine(r)}</td>
                    <td>
                      <span className={shell.pill} data-tone={tone(r.status)}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className={shell.mutedCell}>{fmtDate(r.date_requested)}</td>
                    <td className={shell.mutedCell}>{fmtDate(r.date_resolved)}</td>
                    <td>
                      {(r.status ?? "pending") === "completed" ? (
                        <RequestQrButton requestId={r.id} />
                      ) : (
                        <span className={shell.mutedCell}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
