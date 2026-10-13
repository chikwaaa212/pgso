"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusPill } from "@/components/super-admin/BrowseTable";
import { fmtDate } from "@/lib/format";
import { label } from "@/lib/labels";
import { useCachedAction } from "@/hooks/use-cached-action";
import { CLIENT_CACHE_KEYS } from "@/lib/client-cache";
import {
  browseDelivery,
  browseInspection,
} from "../browse/actions";
import { DeliveryReceipt } from "@/app/personnel/deliveries/[id]/delivery-receipt";
import { InspectionReceipt } from "@/app/personnel/inspections/components/inspection-receipt";
import tableStyles from "../users/page.module.css";
import actionStyles from "@/app/personnel/dashboard/page.module.css";

function LoadingPulse() {
  return (
    <div aria-label="Loading record" aria-busy="true">
      <div className="h-5 w-2/3 animate-pulse rounded bg-navy-100" />
      <div className="mt-2 h-4 w-full animate-pulse rounded bg-navy-100" />
      <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-navy-100" />
      <div className="mt-2 h-32 w-full animate-pulse rounded bg-navy-100" />
    </div>
  );
}

/**
 * Minimal record pointer — both the deliveries rows and the inspections
 * rows satisfy this, so both list pages share these modals.
 */
export interface ModalRecord {
  id: string;
  ref: string;
}

/**
 * Modal Close button — same button as the dashboard (inspectLink:
 * 32px height, 4px radius, navy) so modal actions match the rest
 * of the admin UI instead of the rounded-full form buttons.
 */
function ModalCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className={actionStyles.inspectLink} onClick={onClose}>
      Close
    </button>
  );
}

/**
 * Read-only delivery receipt in a modal — same paper as the dedicated
 * detail page, without leaving the deliveries list. Cached per record
 * (same SWR policy as the lists): reopening paints instantly and only
 * revalidates silently when stale.
 */
export function DeliveryDetailModal({
  row,
  onClose,
}: {
  row: ModalRecord | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="pgso-no-scrollbar sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {row ? `Delivery ${row.ref} — read only` : "Delivery detail"}
          </DialogTitle>
          <DialogDescription>
            Official receipt copy as logged by personnel. No changes can be made here.
          </DialogDescription>
        </DialogHeader>
        {row ? <DeliveryDetailBody id={row.id} /> : <LoadingPulse />}
        <DialogFooter>
          <ModalCloseButton onClose={onClose} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveryDetailBody({ id }: { id: string }) {
  const { data: detail, loading } = useCachedAction(
    `${CLIENT_CACHE_KEYS.adminDeliveryDetail}:${id}`,
    () => browseDelivery(id),
    { staleTime: 30_000 }
  );

  if (loading && detail === undefined) return <LoadingPulse />;
  if (detail === null || detail === undefined)
    return <p className="text-sm text-navy-600">Record not found.</p>;
  return <DeliveryReceipt delivery={detail} />;
}

/**
 * Read-only inspection detail in a modal — history, receipt and IAR
 * records, same content as the dedicated page, without navigation.
 * Cached per record, same policy as above.
 */
export function InspectionDetailModal({
  row,
  onClose,
}: {
  row: ModalRecord | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={row !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="pgso-no-scrollbar sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {row ? `Inspection ${row.ref} — read only` : "Inspection detail"}
          </DialogTitle>
          <DialogDescription>
            Inspection history and acceptance records. No changes can be made here.
          </DialogDescription>
        </DialogHeader>
        {row ? <InspectionDetailBody id={row.id} /> : <LoadingPulse />}
        <DialogFooter>
          <ModalCloseButton onClose={onClose} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InspectionDetailBody({ id }: { id: string }) {
  const { data: detail, loading } = useCachedAction(
    `${CLIENT_CACHE_KEYS.adminInspectionDetail}:${id}`,
    () => browseInspection(id),
    { staleTime: 30_000 }
  );

  if (loading && detail === undefined) return <LoadingPulse />;
  if (detail === null || detail === undefined)
    return <p className="text-sm text-navy-600">Record not found.</p>;

  const inspection = detail.delivery.inspection_data ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p style={{ fontSize: "0.8125rem", color: "var(--color-navy-600)" }}>
        {detail.delivery.supplier ?? "Unknown supplier"} ·{" "}
        {detail.delivery.po_reference ?? "no PO"} ·{" "}
        <StatusPill value={detail.delivery.inspection_status} />
      </p>
      <div>
        <h3 style={{ fontSize: "0.9375rem", fontWeight: 700 }}>Inspection history</h3>
        {detail.history.length === 0 ? (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-navy-500)" }}>
            No inspections recorded for this delivery yet.
          </p>
        ) : (
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Inspector</th>
                  <th>Date</th>
                  <th>Result</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {detail.history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.inspector_name ?? "—"}</td>
                    <td>{fmtDate(h.inspection_date)}</td>
                    <td>
                      <StatusPill value={h.result} />
                    </td>
                    <td style={{ whiteSpace: "normal", minWidth: "14rem" }}>
                      {h.remarks ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {inspection ? (
        <div>
          <h3 style={{ fontSize: "0.9375rem", fontWeight: 700 }}>Inspection receipt</h3>
          <InspectionReceipt delivery={detail.delivery} inspection={inspection} />
        </div>
      ) : null}
      {detail.photos.length > 0 || detail.iar.some((r) => r.iar_image_url) ? (
        <div>
          <h3 style={{ fontSize: "0.9375rem", fontWeight: 700 }}>
            Attached images ({detail.photos.length + detail.iar.filter((r) => r.iar_image_url).length})
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
            {detail.photos.map((p, i) => (
              <a key={p.id} href={p.file_url ?? "#"} target="_blank" rel="noopener noreferrer" title={`Documentary photo ${i + 1}`}>
                <img
                  src={p.file_url ?? ""}
                  alt={`Documentary photo ${i + 1}`}
                  width={64}
                  height={64}
                  loading="lazy"
                  decoding="async"
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "0.25rem", border: "1px solid var(--color-navy-200)" }}
                />
              </a>
            ))}
            {detail.iar.filter((r) => r.iar_image_url).map((r) => (
              <a key={r.id} href={r.iar_image_url ?? "#"} target="_blank" rel="noopener noreferrer" title={`IAR scan${r.iar_no ? ` · ${r.iar_no}` : ""}`}>
                <img
                  src={r.iar_image_url ?? ""}
                  alt={`IAR scan${r.iar_no ? ` ${r.iar_no}` : ""}`}
                  width={64}
                  height={64}
                  loading="lazy"
                  decoding="async"
                  style={{ width: 64, height: 64, objectFit: "cover", borderRadius: "0.25rem", border: "1px solid var(--color-navy-200)" }}
                />
              </a>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <h3 style={{ fontSize: "0.9375rem", fontWeight: 700 }}>
          IAR records ({detail.iar.length})
        </h3>
        {detail.iar.length === 0 ? (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-navy-500)" }}>
            No inspection & acceptance reports filed yet.
          </p>
        ) : (
          <div className={tableStyles.tableWrap}>
            <table className={tableStyles.table}>
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>IAR no.</th>
                  <th>IAR date</th>
                  <th>Invoice</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {detail.iar.map((r) => (
                  <tr key={r.id}>
                    <td>{label(r.kind)}</td>
                    <td>{r.iar_no ?? "—"}</td>
                    <td>{fmtDate(r.iar_date)}</td>
                    <td>{r.iar_invoice_no ?? "—"}</td>
                    <td>
                      <StatusPill value={r.inspection_result} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
