import Image from "next/image";
import { Card } from "@/components/ui/card";
import { BackButton } from "../back-button";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import { getMyRequests, getMyRequestOptions } from "../actions";
import { NewRequestForm } from "./request-form";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

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

export default async function EmployeeRequestsPage() {
  const [requests, options] = await Promise.all([getMyRequests(), getMyRequestOptions()]);
  const pending = requests.filter((r) => r.status === "pending").length;

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
          Transfer an item assigned to you, request a new assignment, or
          report a repair — pick an asset or a stock lot
          (every delivery is an asset; stock is its quantity on hand).
          PGSO personnel review and act on it.
        </p>
        <NewRequestForm assets={options.assets} personnel={options.personnel} />
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
