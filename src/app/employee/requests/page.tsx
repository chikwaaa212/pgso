"use client";

import { useMemo } from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { BackButton } from "../back-button";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import { getMyRequests, getMyRequestOptions } from "../actions";
import { NewRequestForm } from "./request-form";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import { useCachedAction } from "@/hooks/use-cached-action";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import RequestsLoading from "./loading";
import styles from "./page.module.css";

function tone(status: string | null): "ok" | "warn" | "bad" | "info" {
  if (status === "approved" || status === "completed") return "ok";
  if (status === "rejected") return "bad";
  if (status === "pending") return "warn";
  return "info";
}

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila" });
}

export default function EmployeeRequestsPage() {
  // Cached snapshot (my requests + form options): back-navigation paints
  // instantly from memory / sessionStorage and only revalidates silently
  // when stale (30s, matching the personnel lists) — same SWR pattern as
  // the personnel dashboard / deliveries pages. A DB outage never crashes
  // the page: stale data stays visible and only cold starts surface the
  // error with a Retry.
  const { data: snapshot, loading, error, refresh } = useCachedAction(
    CLIENT_CACHE_KEYS.employeeRequests,
    () =>
      Promise.all([getMyRequests(), getMyRequestOptions()]).then(
        ([requests, options]) => ({ requests, options })
      ),
    { staleTime: 30_000 }
  );

  const requests = useMemo(() => snapshot?.requests ?? [], [snapshot]);
  const options = useMemo(
    () => snapshot?.options ?? { assets: [], personnel: [] },
    [snapshot]
  );
  const pending = useMemo(
    () => requests.filter((r) => r.status === "pending").length,
    [requests]
  );

  if (loading) {
    return <RequestsLoading />;
  }

  if (!snapshot) {
    return (
      <section className={styles.section}>
        <p className={styles.crumb}>Employee / My Requests</p>
        <div className={styles.headerRow}>
          <div>
            <BackButton />
            <h1 className={styles.title}>My Requests</h1>
            <p className={styles.subtitle}>
              {error || "Could not load your requests."}
            </p>
          </div>
          <Image
            src="/salute.png"
            alt="Saluting eagle mascot"
            width={120}
            height={120}
            priority
            className={styles.mascot}
          />
        </div>
        <Card className={styles.panel}>
          <p className={styles.panelSub}>
            The database could not be reached. Your previously loaded requests
            will reappear automatically — or try again now.
          </p>
          <div>
            <button
              type="button"
              onClick={refresh}
              style={{
                padding: "0.5rem 1.25rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                borderRadius: "0.375rem",
                border: "1px solid var(--color-navy-600)",
                background: "var(--color-navy-900)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Employee / My Requests</p>
      <div className={styles.headerRow}>
        <div>
          <BackButton />
          <h1 className={styles.title}>My Requests</h1>
          <p className={styles.subtitle}>
            {requests.length} {requests.length === 1 ? "request" : "requests"} filed
            {pending > 0 ? ` · ${pending} awaiting review` : ""}.
          </p>
        </div>
        <Image
          src="/salute.png"
          alt="Saluting eagle mascot"
          width={120}
          height={120}
          priority
          className={styles.mascot}
        />
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>File a new request</h2>
        <p className={styles.panelSub}>
          Transfer or report a repair for an item assigned to you, or request
          a new assignment — new assignments can pick an asset or a stock lot
          (every delivery is an asset; stock is its quantity on hand).
          PGSO personnel review and act on it.
        </p>
        <NewRequestForm assets={options.assets} personnel={options.personnel} onFiled={refresh} />
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Request history</h2>
        <p className={styles.panelSub}>Newest first, with live status.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
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
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{requestTypeLabel(r.request_type)}</td>
                  <td>{r.recipient_name ?? "—"}</td>
                  <td className={styles.colWide}>{r.asset_label ?? "—"}</td>
                  <td className={styles.colWide}>{r.description?.split("\n").pop() ?? "—"}</td>
                  <td>
                    <span className={styles.status} data-tone={tone(r.status)}>
                      {r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : "—"}
                    </span>
                  </td>
                  <td>{fmtDate(r.date_requested)}</td>
                  <td>{fmtDate(r.date_resolved)}</td>
                  <td>
                    {(r.status ?? "pending") === "completed" ? (
                      <RequestQrButton requestId={r.id} />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={8} className={styles.empty}>No requests filed yet — use the form above.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
