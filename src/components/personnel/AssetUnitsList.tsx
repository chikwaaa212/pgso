"use client";

import { useEffect, useState } from "react";
import { Loader2, QrCode, UserRound } from "lucide-react";
import { getAssetUnits, type AssetUnitRow } from "@/app/personnel/assets/actions";
import { cn } from "@/lib/utils";

interface Props {
  recordId: string;
  /** Shown only when the record has no per-piece rows (legacy data). */
  fallbackQr?: string;
  fallbackCode?: string | null;
  className?: string;
}

function fmtDate(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function tone(status: string | null): string {
  const s = (status ?? "").toLowerCase();
  if (s === "available") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (s === "assigned" || s === "in use") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (s === "maintenance") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

/**
 * Per-piece tag list: every unit's immutable item code, its QR tag, and the
 * current holder. Used on the asset list QR dialog and the detail page, so
 * personnel and super-admin read the same piece-level record.
 */
export function AssetUnitsList({ recordId, fallbackQr, fallbackCode, className }: Props) {
  // State is keyed by record id so switching records shows a loader without a
  // synchronous setState reset inside the effect.
  const [state, setState] = useState<{
    recordId: string;
    units: AssetUnitRow[] | null;
    error: boolean;
  }>({ recordId, units: null, error: false });
  const current =
    state.recordId === recordId
      ? state
      : { recordId, units: null as AssetUnitRow[] | null, error: false };

  useEffect(() => {
    let alive = true;
    getAssetUnits(recordId)
      .then((rows) => {
        if (alive) setState({ recordId, units: rows, error: false });
      })
      .catch(() => {
        if (alive) setState((prev) => ({ ...prev, recordId, units: [], error: true }));
      });
    return () => {
      alive = false;
    };
  }, [recordId]);

  const { units, error } = current;

  if (units === null) {
    return (
      <div className={cn("flex items-center justify-center gap-2 py-6 text-xs text-slate-500", className)}>
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        Loading unit tags…
      </div>
    );
  }

  if (error) {
    return <p className={cn("py-4 text-center text-xs text-rose-600", className)}>Could not load unit tags.</p>;
  }

  if (units.length === 0) {
    return (
      <div className={cn("flex flex-col items-center gap-2 py-4 text-center", className)}>
        {fallbackQr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fallbackQr}
            alt={`QR code for ${fallbackCode ?? "asset"}`}
            width={96}
            height={96}
            className="h-24 w-24"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-400">
            <QrCode size={22} aria-hidden="true" />
          </span>
        )}
        <p className="text-xs font-semibold text-navy-900">{fallbackCode ?? "—"}</p>
        <p className="text-[11px] text-slate-500">
          No per-piece tags yet — this record predates unit tracking.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("max-h-[55vh] space-y-2 overflow-y-auto pr-1", className)}>
      <p className="text-[11px] font-medium text-slate-500">
        {units.length} tracked piece{units.length === 1 ? "" : "s"} · each has its own item code and QR tag
      </p>
      {units.map((unit) => (
        <div
          key={unit.id}
          className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-2.5"
        >
          {unit.qr_data_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={unit.qr_data_url}
              alt={`QR code for ${unit.item_code}`}
              width={72}
              height={72}
              className="h-[72px] w-[72px] shrink-0"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded border border-dashed border-slate-300 text-slate-400">
              <QrCode size={18} aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-navy-900">
                {unit.item_code}
              </code>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize ring-1",
                  tone(unit.status)
                )}
              >
                {unit.status ?? "available"}
              </span>
            </div>
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-700">
              <UserRound size={11} aria-hidden="true" className="shrink-0 text-slate-400" />
              {unit.holder_name ?? "Unassigned — on hand"}
            </p>
            {unit.assigned_at ? (
              <p className="text-[10px] text-slate-500">Assigned {fmtDate(unit.assigned_at)}</p>
            ) : unit.condition ? (
              <p className="text-[10px] capitalize text-slate-500">{unit.condition}</p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
