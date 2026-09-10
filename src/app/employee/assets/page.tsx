import Image from "next/image";
import { Card } from "@/components/ui/card";
import { BackButton } from "../back-button";
import { getMyAssets, getMyAssetRequests, getMyDocs } from "../actions";
import { requestTypeLabel } from "@/app/personnel/requests/request-types";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

function label(value: string | null) {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila" });
}

export default async function EmployeeAssetsPage() {
  const [assets, docs, requests] = await Promise.all([
    getMyAssets(),
    getMyDocs(),
    getMyAssetRequests(),
  ]);

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Employee / My Assets</p>
      <div className={styles.headerRow}>
        <div>
          <BackButton />
          <h1 className={styles.title}>My Assets</h1>
          <p className={styles.subtitle}>
            {assets.length} {assets.length === 1 ? "asset" : "assets"} assigned to you
            {docs.length > 0 ? ` · ${docs.length} issuance ${docs.length === 1 ? "document" : "documents"}` : ""}.
          </p>
        </div>
        <Image
          src="/favicon.png"
          alt="PGSO logo"
          width={120}
          height={120}
          priority
          className={styles.mascot}
        />
      </div>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Assigned assets</h2>
        <p className={styles.panelSub}>
          Property under your accountability. Report loss, damage, or needed repairs
          through My Requests.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Property No.</th>
                <th>Account code</th>
                <th>Article</th>
                <th>Description</th>
                <th>Location</th>
                <th>Condition</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.qr_code ?? a.property_number ?? "—"}</td>
                  <td>{a.account_code ?? "—"}</td>
                  <td>{a.article ?? "—"}</td>
                  <td className={styles.colWide}>{a.description ?? "—"}</td>
                  <td>{a.location ?? "—"}</td>
                  <td>
                    <span className={styles.status} data-tone={a.condition === "unserviceable" ? "bad" : "ok"}>
                      {label(a.condition)}
                    </span>
                  </td>
                  <td>
                    <span className={styles.status} data-tone={a.status === "available" ? "ok" : "info"}>
                      {label(a.status)}
                    </span>
                  </td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.empty}>No assets assigned to you yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>Requested &amp; transferred to me</h2>
        <p className={styles.panelSub}>
          Your new assignments, transfers (assets or stock lots), and repairs —
          plus transfers others addressed to your name — with live status.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Item</th>
                <th>From</th>
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
                  <td className={styles.colWide}>{r.asset_label ?? "—"}</td>
                  <td>{r.direction === "incoming" ? r.employee_name : "Me"}</td>
                  <td>
                    <span className={styles.status} data-tone={r.status === "rejected" ? "bad" : r.status === "pending" ? "warn" : "ok"}>
                      {label(r.status)}
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
                  <td colSpan={7} className={styles.empty}>No requests or transfers to you yet — file one in My Requests.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className={styles.panel}>
        <h2 className={styles.panelTitle}>My PAR / ICS documents</h2>
        <p className={styles.panelSub}>
          Issuance records under your name — download the Excel copy anytime.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Doc</th>
                <th>Type</th>
                <th>Date</th>
                <th>Qty</th>
                <th>Asset</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>{d.doc_no ?? "—"}</td>
                  <td>{d.doc_type}</td>
                  <td>{d.doc_date ?? "—"}</td>
                  <td>{d.quantity}</td>
                  <td className={styles.colWide}>{d.asset_label ?? "—"}</td>
                  <td>
                    <a href={d.downloadHref} download className={styles.downloadLink}>
                      Excel (.xlsx)
                    </a>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && (
                <tr>
                  <td colSpan={6} className={styles.empty}>No issuance documents yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
