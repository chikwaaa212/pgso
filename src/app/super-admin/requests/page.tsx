"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/action-button";
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
  StatusPill,
  fmtDate,
  type BrowseColumn,
} from "@/components/super-admin/BrowseTable";
import { browseRequestsPage, type BrowseRequestRow } from "../browse/actions";
import { setReplenishmentStatus } from "./actions";
import { RequestQrButton } from "@/components/personnel/RequestQrButton";
import { label } from "@/lib/labels";
import { Input } from "@/components/ui/input";
import { TablePager } from "@/components/personnel/TablePager";
import { useCachedAction } from "@/hooks/use-cached-action";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { buildQueryKey } from "@/lib/query-keys";
import { useAdminRealtime } from "@/hooks/use-admin-realtime";
import { PAGE_SIZE } from "@/lib/constants";
import RequestsLoading from "./loading";
import browseStyles from "../users/page.module.css";
import styles from "./page.module.css";

type AdminStatus = "approved" | "rejected" | "completed";

export default function SuperAdminRequestsPage() {
  // Server-paged window (PAGE_SIZE = 15): the DB returns only the window +
  // exact total per filter set (30s, busted by request writes).
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);
  const [page, setPage] = useState(1);
  const { data: paged, loading, refresh, isValidating } = useCachedAction(
    buildQueryKey({ module: 'super-admin', resource: 'requests', page, filters: { q: debouncedQuery } }),
    () => browseRequestsPage({ page, q: debouncedQuery }),
    { staleTime: 30_000 }
  );
  const rows = useMemo(() => paged?.rows ?? [], [paged]);
  const total = paged?.total ?? 0;
  const pendingReplenishment = paged?.pendingReplenishment ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionRow, setActionRow] = useState<BrowseRequestRow | null>(null);
  const [actionStatus, setActionStatus] = useState<AdminStatus>("approved");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Decisions bust the server caches — refresh() refetches silently with
  // rows kept visible (no skeleton flash).
  const reload = () => {
    refresh();
  };

  // Another authorized user deciding a replenishment updates this queue
  // without requiring refresh or navigate-away-and-back.
  useAdminRealtime({
    channel: "admin-requests",
    tables: [{ table: "request" }],
    onEvent: reload,
  });

  const replenishmentCount = pendingReplenishment;

  function openAction(row: BrowseRequestRow, status: AdminStatus) {
    setActionRow(row);
    setActionStatus(status);
    setNote("");
    setFormError("");
    setActionError("");
    setDialogOpen(true);
  }

  const processingLabel =
    actionStatus === "approved" ? "Approving…" : actionStatus === "rejected" ? "Rejecting…" : "Completing…";
  const successTitle =
    actionStatus === "approved" ? "Request approved" : actionStatus === "rejected" ? "Request rejected" : "Request completed";

  async function onConfirm() {
    if (!actionRow) return;
    if (note.trim() === "") {
      setFormError("Enter remarks for this action.");
      return;
    }
    setSaving(true);
    setFormError("");
    setActingId(actionRow.id);
    try {
      const res = await setReplenishmentStatus(actionRow.id, actionStatus, note);
      if (!res.success) {
        setFormError(res.error ?? "Failed to update the request.");
        toast.error("Update failed", { description: res.error ?? "Failed to update the request.", duration: 2000, closeButton: true });
        return;
      }
      setDialogOpen(false);
      setActionRow(null);
      setNote("");
      toast.success(successTitle, { duration: 2000, closeButton: true });
      reload();
    } catch {
      setFormError("Failed to update the request. Please try again.");
      toast.error("Update failed", { description: "Failed to update the request. Please try again.", duration: 2000, closeButton: true });
    } finally {
      setActingId(null);
      setSaving(false);
    }
  }

  const columns: BrowseColumn<BrowseRequestRow>[] = [
    { key: "employee", label: "Requester", value: (r) => r.employee_name, text: (r) => r.employee_name },
    { key: "logged_by", label: "Filed By", value: (r) => r.logged_by ?? "—", text: (r) => r.logged_by ?? "" },
    { key: "type", label: "Type", value: (r) => label(r.request_type), text: (r) => r.request_type },
    { key: "asset", label: "Item", value: (r) => r.account_code ?? "—", text: (r) => `${r.account_code ?? ""} ${r.asset_label ?? ""}` },
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

  if (loading && rows.length === 0) {
    return <RequestsLoading />;
  }

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>Requests</p>
      <div>
        <h1 className={styles.title}>Requests</h1>
        <p className={styles.subtitle}>
          {`${total} ${total === 1 ? "request" : "requests"}`}
          {replenishmentCount > 0
            ? ` · ${replenishmentCount} replenishment pending`
            : ""}
          {" · "}personnel replenishment is actionable; employee requests are read-only
          {isValidating ? " · updating…" : ""}
        </p>
      </div>
      {actionError ? (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {actionError}
        </p>
      ) : null}
      <Card className={styles.panel}>
        <div className={browseStyles.searchRow}>
          <Input
            type="search"
            aria-label="Search requests"
            placeholder="Search requester, filer, type, item…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
          {isValidating ? (
            <span role="status" aria-live="polite" style={{ fontSize: "0.75rem", color: "var(--color-navy-500)", whiteSpace: "nowrap" }}>
              Updating…
            </span>
          ) : null}
        </div>
        <div className={browseStyles.tableWrap}>
          <table className={browseStyles.table}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {columns.map((c) => (
                    <td key={c.key}>{c.value(r)}</td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className={browseStyles.empty}>
                    No records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > 0 ? (
          <TablePager
            id="admin-requests"
            total={total}
            pageSize={PAGE_SIZE}
            page={safePage}
            onPageChange={setPage}
          />
        ) : null}
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
            <ActionButton
              type="button"
              disabled={note.trim() === "" || saving}
              onClick={onConfirm}
              loadingLabel={processingLabel}
            >
              {actionStatus === "approved"
                ? "Approve"
                : actionStatus === "rejected"
                  ? "Reject"
                  : "Complete"}
            </ActionButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
