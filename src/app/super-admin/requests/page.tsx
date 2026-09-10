"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  BrowseTable,
  StatusPill,
  fmtDate,
  type BrowseColumn,
} from "@/components/super-admin/BrowseTable";
import { browseRequests, type BrowseRequestRow } from "../browse/actions";
import { setReplenishmentStatus } from "./actions";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import { label } from "@/lib/labels";
import styles from "./page.module.css";

type AdminStatus = "approved" | "rejected" | "completed";

export default function SuperAdminRequestsPage() {
  const [rows, setRows] = useState<BrowseRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionRow, setActionRow] = useState<BrowseRequestRow | null>(null);
  const [actionStatus, setActionStatus] = useState<AdminStatus>("approved");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const reload = () => {
    setLoading(true);
    void browseRequests().then((r) => {
      setRows(r);
      setLoading(false);
    });
  };

  useEffect(() => {
    reload();
  }, []);

  const replenishmentCount = rows.filter(
    (r) => r.request_type === "stock_replenishment" && (r.status ?? "pending") === "pending"
  ).length;

  function openAction(row: BrowseRequestRow, status: AdminStatus) {
    setActionRow(row);
    setActionStatus(status);
    setNote("");
    setFormError("");
    setActionError("");
    setDialogOpen(true);
  }

  async function onConfirm() {
    if (!actionRow) return;
    if (note.trim() === "") {
      setFormError("Enter remarks for this action.");
      return;
    }
    setSaving(true);
    setFormError("");
    setActingId(actionRow.id);
    const res = await setReplenishmentStatus(actionRow.id, actionStatus, note);
    setActingId(null);
    setSaving(false);
    if (!res.success) {
      setFormError(res.error ?? "Failed to update the request.");
      return;
    }
    setDialogOpen(false);
    setActionRow(null);
    setNote("");
    reload();
  }

  const columns: BrowseColumn<BrowseRequestRow>[] = [
    { key: "employee", label: "Requester", value: (r) => r.employee_name, text: (r) => r.employee_name },
    { key: "logged_by", label: "Filed By", value: (r) => r.logged_by ?? "—", text: (r) => r.logged_by ?? "" },
    { key: "type", label: "Type", value: (r) => label(r.request_type), text: (r) => r.request_type },
    { key: "asset", label: "Item", value: (r) => r.asset_label ?? "—", text: (r) => r.asset_label ?? "" },
    {
      key: "detail",
      label: "Detail",
      value: (r) => (
        <span className="whitespace-pre-wrap" title={r.description}>
          {r.description.length > 120 ? `${r.description.slice(0, 120)}…` : r.description}
        </span>
      ),
      text: (r) => r.description,
    },
    { key: "date", label: "Requested", value: (r) => fmtDate(r.date_requested), text: (r) => r.date_requested ?? "" },
    { key: "status", label: "Status", value: (r) => <StatusPill value={r.status} />, text: (r) => r.status ?? "" },
    {
      key: "qr",
      label: "QR",
      value: (r) =>
        (r.status ?? "pending") === "completed" ? (
          <RequestQrButton requestId={r.id} />
        ) : (
          <span className="text-sm text-zinc-400">—</span>
        ),
      text: () => "",
    },
    {
      key: "action",
      label: "Action",
      value: (r) => {
        const status = r.status ?? "pending";
        const busy = actingId === r.id;
        if (r.request_type !== "stock_replenishment") {
          return <span className="text-sm text-zinc-400">Read-only</span>;
        }
        if (status === "pending") {
          return (
            <span className="inline-flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => openAction(r, "approved")}
                className="cursor-pointer font-medium text-emerald-700 hover:underline disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => openAction(r, "rejected")}
                className="cursor-pointer font-medium text-red-700 hover:underline disabled:opacity-50"
              >
                Reject
              </button>
            </span>
          );
        }
        if (status === "approved") {
          return (
            <button
              type="button"
              disabled={busy}
              onClick={() => openAction(r, "completed")}
              className="cursor-pointer font-medium text-emerald-700 hover:underline disabled:opacity-50"
            >
              Complete
            </button>
          );
        }
        return <span className="text-sm text-zinc-400">—</span>;
      },
      text: () => "",
    },
  ];

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Super Admin / Requests</p>
      <div>
        <h1 className={styles.title}>Requests</h1>
        <p className={styles.subtitle}>
          {loading
            ? "Loading…"
            : `${rows.length} ${rows.length === 1 ? "request" : "requests"}`}
          {replenishmentCount > 0 && !loading
            ? ` · ${replenishmentCount} replenishment pending`
            : ""}
          {" · "}personnel replenishment is actionable; employee requests are read-only
        </p>
      </div>
      {actionError ? (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {actionError}
        </p>
      ) : null}
      <Card className={styles.panel}>
        <BrowseTable rows={rows} columns={columns} searchPlaceholder="Search requester, filer, type, item…" pageSizeKey="pgso:admin:requests" />
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {actionStatus === "approved"
                ? "Approve replenishment"
                : actionStatus === "rejected"
                  ? "Reject replenishment"
                  : "Complete replenishment"}
            </DialogTitle>
            <DialogDescription>
              {actionRow
                ? `${actionRow.employee_name} — ${actionRow.asset_label ?? "stock request"}. Remarks are required and recorded on the request.`
                : "Remarks are required and recorded on the request."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5 py-1">
            <Label htmlFor="admin-req-note">
              Remarks <span className="text-red-600">*</span>
            </Label>
            <textarea
              id="admin-req-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                actionStatus === "rejected"
                  ? "e.g. Reason for rejection…"
                  : actionStatus === "completed"
                    ? "e.g. Procurement / delivery reference…"
                    : "e.g. Approved — procurement in progress…"
              }
              rows={3}
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
            />
          </div>
          {formError ? (
            <p
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {formError}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={note.trim() === "" || saving}
              onClick={() => void onConfirm()}
            >
              {saving
                ? "Saving…"
                : actionStatus === "approved"
                  ? "Approve"
                  : actionStatus === "rejected"
                    ? "Reject"
                    : "Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
