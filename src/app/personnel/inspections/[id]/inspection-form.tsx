"use client";

import { useState, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronLeft,
  PackageCheck,
  ClipboardList,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";
import { recordInspection, type InspectionState } from "../../deliveries/actions";
import type { DeliveryForInspection } from "../actions";
import { isPassedAllowed, remainingOf, toCumulative } from "@/lib/inspection-rules";
import { cn } from "@/lib/utils";
import styles from "./page.module.css";

// ─── Local types ──────────────────────────────────────────────────────────────

type YesNo = "yes" | "no" | "";
type ItemCheckStatus = "ok" | "short" | "damaged" | "missing" | "";

interface ItemCheck {
  id: string;
  status: ItemCheckStatus;
  actualQty: string;
  remarks: string;
}

interface SupplierChecks {
  documentsPresent: YesNo;
  supplierMatches: YesNo;
  poNumberMatches: YesNo;
  signaturesPresent: YesNo;
  packagingIntact: YesNo;
  sealedOrSecured: YesNo;
}

type Verdict = "passed" | "partial" | "";

interface InspectionDraft {
  itemChecks: ItemCheck[];
  supplierChecks: SupplierChecks;
  inspectorName: string;
  inspectionDate: string;
  overallRemarks: string;
  verdict: Verdict;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function peso(n: number) {
  return `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function YesNoSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: YesNo;
  onChange: (v: YesNo) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as YesNo)}>
      <SelectTrigger id={id} className={styles.select}>
        <SelectValue placeholder="Select…" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="yes">Yes</SelectItem>
        <SelectItem value="no">No</SelectItem>
      </SelectContent>
    </Select>
  );
}

function StatusBadge({ value }: { value: YesNo }) {
  if (!value) return null;
  return value === "yes" ? (
    <CheckCircle2 className={styles.iconOk} aria-label="Yes" />
  ) : (
    <XCircle className={styles.iconBad} aria-label="No" />
  );
}

function SectionHeading({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className={styles.sectionHead}>
      <span className={styles.sectionIcon}>{icon}</span>
      <div>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {subtitle && <p className={styles.sectionSub}>{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InspectionForm({
  delivery,
}: {
  delivery: DeliveryForInspection;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const alreadyInspected = delivery.inspection_status !== 'pending'
  // Updates stay open for partial inspections (and legacy failed ones so
  // they can move to Partial/Passed). Only Passed and Partial are issued now.
  const isPartial = delivery.inspection_status === 'partial'
  const isLegacyFailed = delivery.inspection_status === 'failed'
  const isEditable = isPartial || isLegacyFailed

// Item-level checks — the input collects THIS ROUND's received quantity
// (prefilled with the outstanding Remaining balance).
  const [itemChecks, setItemChecks] = useState<ItemCheck[]>(() =>
    delivery.items.map((item) => {
      const existingCheck = delivery.inspection_data?.item_checks?.find(
        (c) => c.itemId === item.id
      )
      return {
        id: item.id,
        status: (existingCheck?.status as ItemCheckStatus) || ('' as ItemCheckStatus),
        actualQty: String(remainingOf(item)),
        remarks: existingCheck?.remarks || '',
      }
    })
  )

  // Supplier checks
  const [supplierChecks, setSupplierChecks] = useState<SupplierChecks>({
    documentsPresent: "",
    supplierMatches: "",
    poNumberMatches: "",
    signaturesPresent: "",
    packagingIntact: "",
    sealedOrSecured: "",
  })

  const [inspectorName, setInspectorName] = useState("")
  const [inspectionDate, setInspectionDate] = useState(
    new Date().toISOString().slice(0, 10)
  )
  const [overallRemarks, setOverallRemarks] = useState("")
  const [verdict, setVerdict] = useState<Verdict>("")
  const [idempotencyKey] = useState(() => crypto.randomUUID())

  const [actionState, formAction] = useActionState<InspectionState, FormData>(
    recordInspection,
    {}
  )
  const submittedRef = useRef(false)
  const [hydrated, setHydrated] = useState(false)
  const storageKey = `pgso:inspection-draft:${delivery.id}`

  // Restore the user's in-progress answers (local draft) so a refresh
  // continues where they left off instead of restarting the questions.
  // localStorage is only available post-mount; seeding defers to a microtask.
  useEffect(() => {
    queueMicrotask(() => {
      let existing = delivery.inspection_data ?? null
      try {
        const raw = window.localStorage.getItem(storageKey)
        if (raw) {
          const draft = JSON.parse(raw) as Partial<InspectionDraft>
          if (Array.isArray(draft.itemChecks) && draft.itemChecks.length > 0) {
            setItemChecks(draft.itemChecks.map((c) => ({ ...c })))
          }
          if (draft.supplierChecks && typeof draft.supplierChecks === 'object') {
            setSupplierChecks(draft.supplierChecks as SupplierChecks)
          }
          if (typeof draft.inspectorName === 'string') setInspectorName(draft.inspectorName)
          if (typeof draft.inspectionDate === 'string') setInspectionDate(draft.inspectionDate)
          if (typeof draft.overallRemarks === 'string') setOverallRemarks(draft.overallRemarks)
          if (
            draft.verdict === 'passed' ||
            draft.verdict === 'partial' ||
            draft.verdict === ''
          ) {
            setVerdict(draft.verdict)
          }
          existing = null
        }
      } catch {
        // ignore corrupt drafts
      }

      // Initialize form with existing inspection data for partial updates
      // (legacy failed results reset — only Passed and Partial are issued now)
      if (existing) {
        setInspectorName(existing.inspector_name || '')
        setInspectionDate(existing.inspection_date)
        setOverallRemarks(existing.remarks || '')
        setVerdict(
          existing.result === 'passed' || existing.result === 'partial'
            ? (existing.result as Verdict)
            : ''
        )

        if (existing.supplier_checks) {
          setSupplierChecks(existing.supplier_checks as unknown as SupplierChecks)
        }
      }
      setHydrated(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery.id, storageKey])

  // Persist the draft locally so a refresh never loses answers.
  useEffect(() => {
    if (!hydrated) return
    try {
      const draft: InspectionDraft = {
        itemChecks,
        supplierChecks,
        inspectorName,
        inspectionDate: inspectionDate || '',
        overallRemarks,
        verdict,
      }
      window.localStorage.setItem(storageKey, JSON.stringify(draft))
    } catch {
      // storage may be unavailable
    }
  }, [
    hydrated,
    storageKey,
    itemChecks,
    supplierChecks,
    inspectorName,
    inspectionDate,
    overallRemarks,
    verdict,
  ])

  // Handle server action result
  useEffect(() => {
    if (actionState.success && !submittedRef.current) {
      submittedRef.current = true;
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
      toast({
        title: "Inspection recorded",
        description: `Delivery ${delivery.id.slice(0, 8).toUpperCase()} has been saved.${actionState.stockWarning ? ` ${actionState.stockWarning}` : ""}`,
        variant: "success",
      });
      router.push("/personnel/inspections");
      router.refresh();
    }
    if (actionState.error) {
      toast({
        title: "Save failed",
        description: actionState.error,
        variant: "error",
      });
    }
  }, [actionState, delivery.id, router, toast, storageKey]);

  // ── Derived state ────────────────────────────────────────────────────────────

  const allItemsChecked = itemChecks.every((c) => c.status !== "");
  const allSupplierChecked = Object.values(supplierChecks).every((v) => v !== "");
  const canSubmit =
    allItemsChecked &&
    allSupplierChecked &&
    inspectorName.trim() !== "" &&
    verdict !== "";

  const itemsDone = itemChecks.filter((c) => c.status !== "").length;
  const supplierDone = Object.values(supplierChecks).filter((v) => v !== "").length;
  const totalSteps = delivery.items.length + 6 + 1;
  const doneSoFar = itemsDone + supplierDone + (verdict ? 1 : 0);
  const progressPct = Math.round((doneSoFar / totalSteps) * 100);

  // Effective cumulative totals (already-counted + this round's input).
  // These are what the Passed gate, the saved record, and stocks use.
  const cumulativeChecks = toCumulative(
    itemChecks.map((c) => ({ id: c.id, actualQty: c.actualQty })),
    delivery.items
  );

  // Passed is only allowed when every effective total equals its PO
  // quantity — i.e. the Remaining balance is fully collected.
  const canPass = isPassedAllowed(cumulativeChecks, delivery.items);

  // ── Handlers ──────────────────────────────────────────────────────────────

  function updateItem(
    itemId: string,
    field: keyof Omit<ItemCheck, "id">,
    value: string
  ) {
    let v = value;
    if (field === "actualQty" && v !== "") {
      // This round's input can never exceed the outstanding Remaining.
      const item = delivery.items.find((i) => i.id === itemId);
      const remaining = item ? remainingOf(item) : 0;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) v = "0";
      else if (n > remaining) v = String(remaining);
    }
    const next = itemChecks.map((c) =>
      c.id === itemId ? { ...c, [field]: v } : c
    );
    setItemChecks(next);
    // Passed requires the effective totals to cover every PO quantity —
    // drop a now-invalid Passed verdict as soon as quantities diverge.
    if (
      verdict === "passed" &&
      !isPassedAllowed(
        toCumulative(
          next.map((c) => ({ id: c.id, actualQty: c.actualQty })),
          delivery.items
        ),
        delivery.items
      )
    ) {
      setVerdict("");
    }
  }

  function updateSupplier<K extends keyof SupplierChecks>(
    key: K,
    value: SupplierChecks[K]
  ) {
    setSupplierChecks((prev) => ({ ...prev, [key]: value }));
  }

const deliveryRef = delivery.id.slice(0, 8).toUpperCase();

  // ── Already inspected (read-only) banner ──────────────────────

  if (alreadyInspected && !isEditable) {
    const tone = delivery.inspection_status === "passed" ? "ok" : "warn";
    const label =
      delivery.inspection_status === "passed" ? "Passed" : "Partial";

    return (
      <section className={styles.section}>
        <p className={styles.crumb}>
          Personnel /{" "}
          <Link href="/personnel/inspections" className={styles.crumbLink}>
            Inspections
          </Link>{" "}
          / {deliveryRef}
        </p>
        <Card className={styles.successCard}>
          <CheckCircle2 className={styles.successIcon} />
          <h1 className={styles.successTitle}>Already inspected</h1>
          <p className={styles.successSub}>
            Delivery <strong>{deliveryRef}</strong> has already been inspected.
          </p>
          <p className={styles.successSub}>
            Result:{" "}
            <span className={styles.verdictBadge} data-tone={tone}>
              {label}
            </span>
          </p>
          <div className={styles.successActions}>
            <Button
              variant="outline"
              onClick={() => router.push(`/personnel/inspections/${delivery.id}/receipt`)}
            >
              View Details
            </Button>
            <Button
              variant="outline"
              onClick={() => router.push("/personnel/inspections")}
            >
              Back to inspections
            </Button>
          </div>
        </Card>
      </section>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────

  return (
    <section className={styles.section}>
      <p className={styles.crumb}>
        Personnel /{" "}
        <Link href="/personnel/inspections" className={styles.crumbLink}>
          Inspections
        </Link>{" "}
        / {deliveryRef}
      </p>

      <div className={styles.headerRow}>
        <div>
          <Link href="/personnel/inspections" className={styles.backLink}>
            <ChevronLeft className="inline h-4 w-4" />
            Back
          </Link>
          <h1 className={styles.title}>
            Delivery Inspection — {deliveryRef}
          </h1>
          <p className={styles.subtitle}>
            {isEditable
              ? 'Update the inspection results for this delivery. Collect the remaining balance to pass.'
              : 'Cross-verify items and supplier documents, then record a verdict.'}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className={styles.progressWrap} aria-label="Inspection progress">
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className={styles.progressLabel}>{progressPct}% complete</span>
      </div>

      {/* Hidden fields are injected into the form via a wrapper so the
          server action receives them without cluttering JSX */}
      <form action={formAction} className={styles.form} noValidate>
        {/* Hidden action inputs */}
        <input type="hidden" name="deliveryId" value={delivery.id} />
        <input type="hidden" name="result" value={verdict} />
        <input type="hidden" name="inspectorName" value={inspectorName} />
        <input type="hidden" name="inspectionDate" value={inspectionDate} />
        <input type="hidden" name="remarks" value={overallRemarks} />
        <input
          type="hidden"
          name="supplierChecks"
          value={JSON.stringify(supplierChecks)}
        />
        <input
          type="hidden"
          name="itemChecks"
          value={JSON.stringify(
            itemChecks.map((c) => ({
              itemId: c.id,
              status: c.status,
              actualQty:
                cumulativeChecks.find((t) => t.id === c.id)?.actualQty ?? 0,
              remarks: c.remarks,
            }))
          )}
        />
        <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

        {/* ── Section 1: Delivery Record ─────────────────────────────── */}
        <Card className={styles.card}>
          <SectionHeading
            icon={<FileText className="h-5 w-5" />}
            title="Delivery Record"
            subtitle="Confirm the information below matches the physical delivery receipt."
          />
          <div className={styles.summaryGrid}>
            {[
              ["Delivery ID", deliveryRef],
              ["PO Reference", delivery.po_reference ?? "—"],
              ["Supplier", delivery.supplier ?? "—"],
              ["Date Delivered", fmt(delivery.date_delivered)],
              ["Received By", delivery.recipient_name ?? delivery.received_by.slice(0, 8)],
              ["Recipient Role", delivery.recipient_role ?? "—"],
              ["Asset Type / Code", `${delivery.asset_type ?? "—"} — ${delivery.account_code ?? "—"}`],
              ["Account Type", delivery.account_type ?? "—"],
            ].map(([label, value]) => (
              <div key={label} className={styles.summaryItem}>
                <span className={styles.summaryLabel}>{label}</span>
                <span className={styles.summaryValue}>{value}</span>
              </div>
            ))}
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>Delivery Status</span>
              <span
                className={styles.statusBadge}
                data-tone={
                  delivery.delivery_status === "complete" ? "ok" : "warn"
                }
              >
                {delivery.delivery_status === "complete" ? "Complete" : "Partial"}
              </span>
            </div>
          </div>
        </Card>

        {/* ── Section 2: Supplier & Document Verification ───────────── */}
        <Card className={styles.card}>
          <SectionHeading
            icon={<ShieldCheck className="h-5 w-5" />}
            title="Supplier & Document Verification"
            subtitle="Answer each question by comparing the physical documents with the system record."
          />
          <div className={styles.checkList}>
            {(
              [
                { key: "documentsPresent" as const, question: "Are the delivery receipt (DR) and PO copy physically present?" },
                { key: "supplierMatches"  as const, question: "Does the supplier name on the DR match the PO on record?" },
                { key: "poNumberMatches"  as const, question: "Does the PO number printed on the physical DR match the system record?" },
                { key: "signaturesPresent" as const, question: "Are the required signatures of the supplier and receiving officer present?" },
                { key: "packagingIntact"  as const, question: "Was the packaging intact and undamaged upon receipt?" },
                { key: "sealedOrSecured"  as const, question: "Were the items properly sealed or secured during delivery?" },
              ] as { key: keyof SupplierChecks; question: string }[]
            ).map(({ key, question }, idx) => (
              <div key={key} className={styles.checkRow}>
                <span className={styles.checkIndex}>{idx + 1}</span>
                <p className={styles.checkQuestion}>{question}</p>
                <div className={styles.checkControl}>
                  <YesNoSelect
                    id={`supplier-${key}`}
                    value={supplierChecks[key]}
                    onChange={(v) => updateSupplier(key, v)}
                  />
                  <StatusBadge value={supplierChecks[key]} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Section 3: Item Cross-Verification ───────────────────── */}
        <Card className={styles.card}>
          <SectionHeading
            icon={<PackageCheck className="h-5 w-5" />}
            title="Item Cross-Verification"
            subtitle={`Verify each of the ${delivery.items.length} delivered item${delivery.items.length !== 1 ? "s" : ""} against the PO quantities. Enter this round's received quantity per item — Received and Remaining show what earlier inspections already counted.`}
          />
          <div className={styles.itemTableWrap}>
            <table className={styles.itemTable}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item Description</th>
                  <th>Unit</th>
                  <th>Qty (PO)</th>
                  <th>Received</th>
                  <th>Remaining</th>
                  <th>Unit Cost</th>
                  <th>{isEditable ? "Qty Received (this round)" : "Actual Qty Received"}</th>
                  <th>Status</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {delivery.items.map((item, idx) => {
                  const check = itemChecks.find((c) => c.id === item.id)!;
                  // Receiving history: what already arrived vs what is left.
                  const received = item.stocked_qty ?? 0;
                  const remaining = Math.max(0, item.quantity - received);
                  return (
                    <tr key={item.id} data-status={check.status || undefined}>
                      <td className={styles.tdIndex}>{idx + 1}</td>
                      <td className={styles.tdDesc}>{item.item_name}</td>
                      <td>{item.unit ?? "—"}</td>
                      <td className={styles.tdNum}>{item.quantity}</td>
                      <td className={styles.tdNum}>{received}</td>
                      <td className={styles.tdNum}>
                        <span
                          className={
                            remaining > 0 ? styles.remainingDue : undefined
                          }
                        >
                          {remaining}
                        </span>
                      </td>
                      <td className={styles.tdNum}>
                        {item.unit_cost != null ? peso(item.unit_cost) : "—"}
                      </td>
                      <td className={styles.tdNum}>
                        <Input
                          type="number"
                          min={0}
                          max={remaining}
                          value={check.actualQty}
                          onChange={(e) =>
                            updateItem(item.id, "actualQty", e.target.value)
                          }
                          className={styles.qtyInput}
                          aria-label={`Actual quantity for ${item.item_name}`}
                        />
                      </td>
                      <td>
                        <Select
                          value={check.status}
                          onValueChange={(v) => updateItem(item.id, "status", v)}
                        >
                          <SelectTrigger
                            className={styles.statusSelect}
                            aria-label={`Status for ${item.item_name}`}
                          >
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ok">✓ OK</SelectItem>
                            <SelectItem value="short">⚠ Short</SelectItem>
                            <SelectItem value="damaged">✗ Damaged</SelectItem>
                            <SelectItem value="missing">✗ Missing</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td>
                        <Input
                          type="text"
                          value={check.remarks}
                          onChange={(e) =>
                            updateItem(item.id, "remarks", e.target.value)
                          }
                          placeholder="Optional note…"
                          className={styles.remarksInput}
                          aria-label={`Remarks for ${item.item_name}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Item summary chips */}
          <div className={styles.itemSummary}>
            {(["ok", "short", "damaged", "missing"] as ItemCheckStatus[]).map(
              (s) => {
                const count = itemChecks.filter((c) => c.status === s).length;
                if (count === 0) return null;
                const tone =
                  s === "ok" ? "ok" : s === "short" ? "warn" : "bad";
                return (
                  <span key={s} className={styles.summaryChip} data-tone={tone}>
                    {s === "ok"
                      ? "✓ OK"
                      : s === "short"
                      ? "⚠ Short"
                      : s === "damaged"
                      ? "✗ Damaged"
                      : "✗ Missing"}
                    : {count}
                  </span>
                );
              }
            )}
          </div>
        </Card>

        {/* ── Section 4: Inspector Info & Verdict ───────────────────── */}
        <Card className={styles.card}>
          <SectionHeading
            icon={<ClipboardList className="h-5 w-5" />}
            title="Inspector Information & Verdict"
            subtitle="Provide your details and issue the final inspection verdict."
          />
          <div className={styles.verdictGrid}>
            <div className={styles.field}>
              <Label htmlFor="inspector-name">
                Inspector Name <span className={styles.required}>*</span>
              </Label>
              <Input
                id="inspector-name"
                type="text"
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                placeholder="Full name of the inspector"
                className={!inspectorName ? styles.inputError : undefined}
                aria-invalid={!inspectorName || undefined}
              />
            </div>

            <div className={styles.field}>
              <Label htmlFor="inspection-date">
                Inspection Date <span className={styles.required}>*</span>
              </Label>
              <DatePicker
                id="inspection-date"
                value={inspectionDate ? new Date(inspectionDate) : undefined}
                onChange={(date) =>
                  setInspectionDate(date ? date.toISOString().slice(0, 10) : "")
                }
                placeholder="Pick a date"
                hasError={!inspectionDate}
              />
            </div>

            <div className={styles.fieldFull}>
              <Label htmlFor="overall-remarks">Overall Remarks</Label>
              <textarea
                id="overall-remarks"
                value={overallRemarks}
                onChange={(e) => setOverallRemarks(e.target.value)}
                placeholder="Any additional observations from the inspection…"
                className={styles.textarea}
                rows={3}
              />
            </div>

            <div className={styles.fieldFull}>
              <Label>
                Inspection Verdict <span className={styles.required}>*</span>
              </Label>
              <div
                className={cn(
                  styles.verdictOptions,
                  !verdict && styles.verdictError
                )}
                role="group"
                aria-label="Inspection verdict"
              >
                {(
                  [
                    {
                      value: "passed",
                      label: "Passed",
                      desc: "Remaining balance collected — actual received now matches every PO quantity.",
                      icon: <CheckCircle2 className="h-5 w-5" />,
                      tone: "ok",
                    },
                    {
                      value: "partial",
                      label: "Partial",
                      desc: "Some quantities still outstanding; only received items move to stocks.",
                      icon: <AlertCircle className="h-5 w-5" />,
                      tone: "warn",
                    },
                  ] as {
                    value: Verdict;
                    label: string;
                    desc: string;
                    icon: React.ReactNode;
                    tone: string;
                  }[]
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={styles.verdictOption}
                    data-active={verdict === opt.value}
                    data-tone={opt.tone}
                    onClick={() => setVerdict(opt.value)}
                    aria-pressed={verdict === opt.value}
                    disabled={opt.value === "passed" && !canPass}
                    title={
                      opt.value === "passed" && !canPass
                        ? "Passed requires every actual received quantity to equal its PO quantity."
                        : undefined
                    }
                  >
                    <span className={styles.verdictOptionIcon}>{opt.icon}</span>
                    <span className={styles.verdictOptionLabel}>{opt.label}</span>
                    <span className={styles.verdictOptionDesc}>{opt.desc}</span>
                  </button>
                ))}
              </div>
              {!canPass ? (
                <p className={styles.hint}>
                  <AlertCircle className="inline h-4 w-4 mr-1" />
                  Passed unlocks once the entered quantity covers the
                  Remaining for every item (entries can&apos;t exceed
                  Remaining).
                </p>
              ) : null}
            </div>
          </div>
        </Card>

        {/* ── Submit row ────────────────────────────────────────────── */}
        <div className={styles.submitRow}>
          {!allItemsChecked && (
            <p className={styles.hint}>
              <AlertCircle className="inline h-4 w-4 mr-1" />
              All items must have a status set.
            </p>
          )}
          {!allSupplierChecked && (
            <p className={styles.hint}>
              <AlertCircle className="inline h-4 w-4 mr-1" />
              All supplier verification questions must be answered.
            </p>
          )}
          {actionState.error && (
            <p className={styles.hint} style={{ color: "#991b1b", background: "#fee2e2", borderColor: "#fca5a5" }}>
              <AlertCircle className="inline h-4 w-4 mr-1" />
              {actionState.error}
            </p>
          )}

          <div className={styles.submitActions}>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push("/personnel/inspections")}
            >
              Cancel
            </Button>
            <SubmitButton
              disabled={!canSubmit}
              pendingLabel={isEditable ? "Updating…" : "Recording…"}
            >
              {isEditable ? 'Update Inspection' : 'Record Inspection'}
            </SubmitButton>
          </div>
        </div>
      </form>
    </section>
  );
}
