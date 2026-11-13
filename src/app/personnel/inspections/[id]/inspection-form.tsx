"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  PackageCheck,
  ClipboardList,
  ShieldCheck,
  ImagePlus,
  LockKeyhole,
  Loader2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toaster";
import { toast as toastSonner } from "sonner";
import { CLIENT_CACHE_KEYS, bustClientCache } from "@/lib/client-cache";
import { resourcePrefix } from "@/lib/query-keys";
import { recordInspection } from "../../deliveries/actions";
import type { DeliveryDetails } from "../../deliveries/actions";
import { DeliveryReceipt } from "../../deliveries/[id]/delivery-receipt";
import type { DeliveryForInspection } from "../actions";
import {
  removePendingInspectionResult,
  upsertPendingInspectionResult,
} from "../optimistic-inspections";
import { isPassedAllowed, remainingOf, toCumulative } from "@/lib/inspection-rules";
import { inspectionHref } from "@/lib/inspection-ref";
import { portalFromPathname } from "@/lib/portal-path";
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

type Verdict = "passed" | "partial" | "failed" | "";

const ITEM_STATUS_OPTIONS: {
  value: Exclude<ItemCheckStatus, "">;
  label: string;
  tone: "ok" | "warn" | "bad";
}[] = [
  { value: "ok", label: "OK", tone: "ok" },
  { value: "short", label: "Short", tone: "warn" },
  { value: "damaged", label: "Damaged", tone: "bad" },
  { value: "missing", label: "Missing", tone: "bad" },
];

interface InspectionDraft {
  itemChecks: ItemCheck[];
  supplierChecks: SupplierChecks;
  inspectorName: string;
  inspectionDate: string;
  overallRemarks: string;
  verdict: Verdict;
  photoUrls: string[];
}

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_BUCKET = "iar-attachments";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function peso(n: number) {
  return `₱${n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
  const pathname = usePathname();
  const portal = portalFromPathname(pathname);
  const listHref = `/${portal}/inspections`;
  const { toast } = useToast();

  const alreadyInspected = delivery.inspection_status !== 'pending'
  // Updates stay open for partial inspections and returned deliveries
  // (failed) so they can be re-inspected or confirmed as sent back.
  // Mirror the list predicate (`canEditInspection` in inspections/page.tsx):
  // either the delivery-level status OR the latest inspection result being
  // Partial/Failed keeps the form editable, so the two can never disagree.
  const statusOf = (v: string | null | undefined) => (v ?? '').toLowerCase()
  const isPartial =
    statusOf(delivery.inspection_status) === 'partial' ||
    statusOf(delivery.inspection_data?.result) === 'partial'
  const isLegacyFailed =
    statusOf(delivery.inspection_status) === 'failed' ||
    statusOf(delivery.inspection_data?.result) === 'failed'
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
  // Item cross-verification lives in an overlay opened from the supplier card.
  const [itemsOpen, setItemsOpen] = useState(false)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  // Documentary photos (optional): uploaded immediately to storage (same
  // bucket + rules as IAR scans); their URLs ride the hidden photoUrlsJson
  // input into recordInspection, which files them as inspection documents.
  // Uploads orphan only if the inspector abandons the form — same tradeoff
  // as the standalone IAR attach button.
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [photoError, setPhotoError] = useState("")
  const photoInputRef = useRef<HTMLInputElement>(null)
  // Guards against a double click before the optimistic navigation lands.
  const submittingRef = useRef(false)

  const [hydrated, setHydrated] = useState(false)
  const storageKey = `pgso:inspection-draft:${delivery.id}`

  // Warm the list route so submitting closes the form immediately instead of
  // waiting for the target route to load over the network.
  useEffect(() => {
    router.prefetch(listHref)
  }, [router, listHref])

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
            draft.verdict === 'failed' ||
            draft.verdict === ''
          ) {
            setVerdict(draft.verdict)
          }
          if (Array.isArray(draft.photoUrls)) {
            setPhotos(
              draft.photoUrls
                .filter((u): u is string => typeof u === 'string')
                .map((u) => u.trim())
                .filter((u) => u.startsWith('https://'))
                .slice(0, MAX_PHOTOS)
            )
          }
          existing = null
        }
      } catch {
        // ignore corrupt drafts
      }

      // Initialize form with existing inspection data for partial updates
      // (a legacy failed inspection stays "Return to Supplier" so it can be
      // re-inspected or the return confirmed).
      if (existing) {
        setInspectorName(existing.inspector_name || '')
        setInspectionDate(existing.inspection_date)
        setOverallRemarks(existing.remarks || '')
        setVerdict(
          existing.result === 'passed' ||
            existing.result === 'partial' ||
            existing.result === 'failed'
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
        photoUrls: photos,
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
    photos,
  ])

  // ── Derived state ────────────────────────────────────────────────────────────

  const allItemsChecked = itemChecks.every((c) => c.status !== "");
  const allSupplierChecked = Object.values(supplierChecks).every((v) => v !== "");
  // The inspector/verdict card stays locked until every item has a status.
  const itemsVerified = itemChecks.length > 0 && allItemsChecked;

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
  // quantity — i.e. the Remaining balance is fully collected AND every item
  // was cross-verified as OK.
  const canPass = isPassedAllowed(cumulativeChecks, delivery.items);
  const allItemsOk =
    itemChecks.length > 0 && itemChecks.every((c) => c.status === "ok");
  const hasMissingOrDamaged = itemChecks.some(
    (c) => c.status === "missing" || c.status === "damaged"
  );
  // Verdict gates:
  //  • Passed / Complete — only when every item is OK and fully received.
  //  • Return to Supplier — only when at least one item is missing/damaged.
  //  • Partial — always available (short, or anything not fully resolved).
  const canComplete = allItemsOk && canPass;
  const canReturn = hasMissingOrDamaged;
  // A verdict is only submittable when its item-status gate allows it.
  const verdictAllowed =
    verdict === "partial" ||
    (verdict === "passed" && canComplete) ||
    (verdict === "failed" && canReturn);
  const canSubmit =
    itemsVerified &&
    allSupplierChecked &&
    inspectorName.trim() !== "" &&
    verdictAllowed &&
    !uploading;

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Incomplete submissions surface as top-center sonner toasts so the
  // guidance lands where the inspector is looking. Valid submissions navigate
  // back to the list immediately and paint the new result optimistically;
  // the server action keeps running in the background.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return;

    if (!canSubmit) {
      const topCenter = {
        position: "top-center" as const,
        duration: 2500,
        closeButton: true,
      };
      if (uploading)
        toastSonner.error("Photos are still uploading — wait a moment.", topCenter);
      if (!allItemsChecked)
        toastSonner.error("All items must have a status set.", topCenter);
      if (!allSupplierChecked)
        toastSonner.error(
          "All supplier verification questions must be answered.",
          topCenter
        );
      if (inspectorName.trim() === "")
        toastSonner.error("Inspector name is required.", topCenter);
      if (verdict === "")
        toastSonner.error("Select an inspection verdict.", topCenter);
      else if (verdict === "passed" && !canComplete)
        toastSonner.error(
          allItemsOk
            ? "Passed requires the remaining quantity to be fully received for every item."
            : "Passed is only allowed when every item status is OK.",
          topCenter
        );
      else if (verdict === "failed" && !canReturn)
        toastSonner.error(
          "Return to Supplier is only allowed when an item is missing or damaged.",
          topCenter
        );
      return;
    }

    submittingRef.current = true;
    const formData = new FormData(e.currentTarget);
    const ref = delivery.id.slice(0, 8).toUpperCase();
    const result = verdict as "passed" | "partial" | "failed";

    // Instant UI — paint the row, close the form, navigate now.
    upsertPendingInspectionResult({
      deliveryId: delivery.id,
      result,
      inspectorName: inspectorName.trim(),
      inspectionDate,
      at: Date.now(),
    });
    router.push(listHref);

    // Defer the write to the next task: invoking the server action inside the
    // submit event can hold the form in a pending state and delay the route
    // change. The list already shows the optimistic result.
    setTimeout(() => {
      void (async () => {
        let res: Awaited<ReturnType<typeof recordInspection>>;
        try {
          res = await recordInspection({}, formData);
        } catch {
          res = {
            error: "Could not reach the server. Please try again.",
          };
        }

        if (res.error) {
          // Roll the row back to Pending and reopen the draft if the user is
          // still sitting on the inspections list.
          removePendingInspectionResult(delivery.id);
          toast({
            title: "Save failed",
            description: res.error,
            variant: "error",
            duration: 8000,
          });
          if (
            typeof window !== "undefined" &&
            window.location.pathname === listHref
          ) {
            router.push(inspectionHref(delivery.id, "", portal));
          }
          submittingRef.current = false;
          return;
        }

        // Committed — the draft is no longer needed.
        try {
          window.localStorage.removeItem(storageKey);
        } catch {
          // ignore
        }
        // Statuses changed — drop the cached lists + dashboard + stocks so
        // the visible list refetches instead of serving pre-inspection data.
        bustClientCache([
          CLIENT_CACHE_KEYS.inspections,
          CLIENT_CACHE_KEYS.deliveries,
          CLIENT_CACHE_KEYS.dashboard,
          CLIENT_CACHE_KEYS.inventory,
          resourcePrefix("personnel", "inspections"),
          resourcePrefix("personnel", "inspections-air"),
          resourcePrefix("personnel", "inspections-counts"),
          resourcePrefix("personnel", "deliveries"),
          resourcePrefix("personnel", "dashboard"),
          resourcePrefix("personnel", "inventory"),
          resourcePrefix("personnel", "inventory-stats"),
        ]);
        toast({
          title: "Inspection recorded",
          description: `Delivery ${ref} has been saved.${res.stockWarning ? ` ${res.stockWarning}` : ""}`,
          variant: "success",
        });
        // Safety net: the refetched row now matches, drop the overlay.
        setTimeout(() => removePendingInspectionResult(delivery.id), 8_000);
      })();
    }, 0);
  }

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
    // Drop a verdict the new item data no longer supports:
    //  • Passed needs every item OK and every PO quantity covered.
    //  • Return to Supplier needs at least one missing/damaged item.
    //  • Partial is never invalidated.
    if (verdict === "passed") {
      const nextAllOk =
        next.length > 0 && next.every((c) => c.status === "ok");
      const nextCanPass = isPassedAllowed(
        toCumulative(
          next.map((c) => ({ id: c.id, actualQty: c.actualQty })),
          delivery.items
        ),
        delivery.items
      );
      if (!nextAllOk || !nextCanPass) setVerdict("");
    } else if (verdict === "failed") {
      const nextHasMissingOrDamaged = next.some(
        (c) => c.status === "missing" || c.status === "damaged"
      );
      if (!nextHasMissingOrDamaged) setVerdict("");
    }
  }

  function updateSupplier<K extends keyof SupplierChecks>(
    key: K,
    value: SupplierChecks[K]
  ) {
    setSupplierChecks((prev) => ({ ...prev, [key]: value }));
  }

  async function onPickPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPhotoError("");
    const picked = Array.from(files);
    if (photos.length + picked.length > MAX_PHOTOS) {
      setPhotoError(`At most ${MAX_PHOTOS} photos — remove one first.`);
      return;
    }
    for (const f of picked) {
      if (!f.type.startsWith("image/")) {
        setPhotoError("Please choose image files (JPG or PNG).");
        return;
      }
      if (f.size > MAX_PHOTO_BYTES) {
        setPhotoError("Each photo must be 8 MB or smaller.");
        return;
      }
    }
    setUploading(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const uploaded: string[] = [];
      for (const file of picked) {
        const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_") || "photo";
        const path = `inspection-photos/${delivery.id}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (upErr) throw new Error(upErr.message);
        const {
          data: { publicUrl },
        } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
        uploaded.push(publicUrl);
      }
      setPhotos((prev) => [...prev, ...uploaded].slice(0, MAX_PHOTOS));
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "Photo upload failed.");
    } finally {
      setUploading(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function onRemovePhoto(url: string) {
    setPhotos((prev) => prev.filter((u) => u !== url));
    // Best-effort: delete the orphaned upload too.
    try {
      const marker = `/${PHOTO_BUCKET}/`;
      const i = url.indexOf(marker);
      if (i >= 0) {
        const path = url.slice(i + marker.length);
        const { createClient } = await import("@/lib/supabase/client");
        await createClient()
          .storage.from(PHOTO_BUCKET)
          .remove([path])
          .catch(() => undefined);
      }
    } catch {
      /* orphan stays — harmless */
    }
  }

const deliveryRef = delivery.id.slice(0, 8).toUpperCase();

  // Same record the deliveries list shows in its View Details modal — rendered
  // inline here so the inspector sees the full delivery without opening one.
  const receiptDelivery: DeliveryDetails = {
    id: delivery.id,
    delivery_ref: deliveryRef,
    supplier: delivery.supplier,
    po_reference: delivery.po_reference,
    date_delivered: delivery.date_delivered,
    expected_arrival_date: delivery.expected_arrival_date,
    delivery_kind: delivery.delivery_kind,
    delivery_status: delivery.delivery_status,
    inspection_status: delivery.inspection_status,
    asset_type: delivery.asset_type,
    stock_type: delivery.stock_type,
    account_code: delivery.account_code,
    account_title: delivery.account_title,
    recipient_role: delivery.recipient_role,
    recipient_name: delivery.recipient_name,
    received_by: delivery.received_by,
    logged_by_name: delivery.logged_by_name,
    created_at: delivery.created_at,
    items: delivery.items.map((item) => ({
      id: item.id,
      item_name: item.item_name,
      unit: item.unit,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
    })),
  };

  // ── Already inspected (read-only) banner ──────────────────────

  if (alreadyInspected && !isEditable) {
    const tone = delivery.inspection_status === "passed" ? "ok" : "warn";
    const label =
      delivery.inspection_status === "passed"
        ? "Passed"
        : delivery.inspection_status === "failed"
          ? "Returned to Supplier"
          : "Partial";

    return (
      <section className={styles.section}>
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
              className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
              onClick={() => router.push(inspectionHref(delivery.id, "/receipt", portal))}
            >
              View Details
            </Button>
            <Button
              variant="outline"
              className="h-8 rounded-[4px] px-3.5 text-xs font-semibold"
              onClick={() => router.push(listHref)}
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
      <div className={styles.headerRow}>
        <div>
          <Link href={listHref} className={styles.backLink}>
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
      <form onSubmit={handleSubmit} className={styles.form} noValidate>
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
        <input type="hidden" name="photoUrlsJson" value={JSON.stringify(photos)} />

        {/* ── Section 1: Delivery Record + Supplier & Document Verification ──
            One review section, two cards side by side: the delivery record
            (same content as View Details, rendered inline) and the document
            checklist the inspector answers. */}
        <div className={styles.reviewGrid}>
          <DeliveryReceipt delivery={receiptDelivery} maxItems={4} />

          <Card className={cn(styles.card, styles.verificationCard)}>
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

            <button
              type="button"
              className={styles.crossVerifyBanner}
              data-complete={allItemsChecked || undefined}
              onClick={() => setItemsOpen(true)}
            >
              <span className={styles.crossVerifyIcon}>
                <PackageCheck className="h-5 w-5" />
              </span>
              <span className={styles.crossVerifyText}>
                <span className={styles.crossVerifyTitle}>
                  {allItemsChecked
                    ? "Review item cross-verification"
                    : "Start item cross-verification"}
                </span>
                <span className={styles.crossVerifySub}>
                  {allItemsChecked
                    ? `All ${delivery.items.length} item${delivery.items.length !== 1 ? "s" : ""} verified — open to review or edit.`
                    : `Set the status of each of the ${delivery.items.length} delivered item${delivery.items.length !== 1 ? "s" : ""}.`}
                </span>
              </span>
              <span className={styles.crossVerifyProgress}>
                {itemsDone}/{delivery.items.length} done
              </span>
            </button>
          </Card>
        </div>

        {/* ── Item Cross-Verification overlay ─────────────────────────
            Opened from the banner in the Supplier & Document Verification
            card. Kept inside the form so its controls still drive the hidden
            itemChecks input (portaled, but state lives here). */}
        <Dialog open={itemsOpen} onOpenChange={setItemsOpen}>
          <DialogContent className="bg-white sm:max-w-6xl dark:bg-white">
            <DialogHeader>
              <DialogTitle>Item Cross-Verification</DialogTitle>
              <DialogDescription>
                Verify each of the {delivery.items.length} delivered item
                {delivery.items.length !== 1 ? "s" : ""} against the PO
                quantities. Enter this round&apos;s received quantity per item —
                Received and Remaining show what earlier inspections already
                counted.
              </DialogDescription>
            </DialogHeader>
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
                          <div
                            className={styles.statusGroup}
                            role="radiogroup"
                            aria-label={`Status for ${item.item_name}`}
                          >
                            {ITEM_STATUS_OPTIONS.map((opt) => (
                              <label
                                key={opt.value}
                                className={styles.statusChip}
                                data-tone={opt.tone}
                                data-checked={check.status === opt.value}
                              >
                                <input
                                  type="radio"
                                  name={`status-${item.id}`}
                                  value={opt.value}
                                  checked={check.status === opt.value}
                                  onChange={() =>
                                    updateItem(item.id, "status", opt.value)
                                  }
                                  className={styles.statusRadio}
                                />
                                <span>{opt.label}</span>
                              </label>
                            ))}
                          </div>
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
              {ITEM_STATUS_OPTIONS.map((opt) => {
                const count = itemChecks.filter(
                  (c) => c.status === opt.value
                ).length;
                if (count === 0) return null;
                return (
                  <span
                    key={opt.value}
                    className={styles.summaryChip}
                    data-tone={opt.tone}
                  >
                    {opt.value === "ok"
                      ? "✓ OK"
                      : opt.value === "short"
                      ? "⚠ Short"
                      : opt.value === "damaged"
                      ? "✗ Damaged"
                      : "✗ Missing"}
                    : {count}
                  </span>
                );
              })}
            </div>

            <div className={styles.dialogFooter}>
              <p className={styles.dialogHint}>
                {allItemsOk
                  ? "All items are OK — Passed becomes available once the remaining quantities are fully received."
                  : hasMissingOrDamaged
                  ? "A missing or damaged item allows Partial or Return to Supplier only."
                  : "Mark each item to see which verdicts become available."}
              </p>
              <Button
                type="button"
                className="h-6 rounded-[4px] border border-yellow-600 bg-yellow-500 px-2.5 text-[0.6875rem] font-semibold text-navy-900 hover:bg-yellow-600 hover:text-navy-900"
                onClick={() => setItemsOpen(false)}
              >
                Done
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Section 2: Documentary Photos + Inspector & Verdict ──────
            One section, two equal-height cards — matching the delivery
            record / verification row above. */}
        <div className={styles.reviewGrid}>

        {/* ── Section 4: Documentary Photos (optional) ───────────── */}
        <Card className={styles.card}>
          <SectionHeading
            icon={<ImagePlus className="h-5 w-5" />}
            title="Documentary Photos"
            subtitle={`Optional — up to ${MAX_PHOTOS} photos of the delivered items (damage, labels, serials). They are filed with this inspection and visible to Super Admin oversight.`}
          />
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-label="Choose documentary photos"
            onChange={(e) => void onPickPhotos(e.target.files)}
          />
          <div className={styles.photoBody}>
            <div className={styles.photoGrid}>
              {photos.map((url) => (
                <figure key={url} style={{ position: "relative", margin: 0 }}>
                  <img
                    src={url}
                    alt="Documentary photo for this inspection"
                    width={96}
                    height={96}
                    loading="lazy"
                    decoding="async"
                    style={{ width: 96, height: 96, objectFit: "cover", borderRadius: "0.375rem", border: "1px solid var(--color-navy-200)" }}
                  />
                  <button
                    type="button"
                    onClick={() => void onRemovePhoto(url)}
                    aria-label="Remove photo"
                    title="Remove photo"
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      width: 22,
                      height: 22,
                      borderRadius: 9999,
                      border: "1px solid var(--color-navy-200)",
                      background: "#fff",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#991b1b",
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </figure>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploading}
                  className={styles.addPhotoTile}
                >
                  {uploading ? (
                    <Loader2 className="h-7 w-7 animate-spin" />
                  ) : (
                    <ImagePlus className="h-7 w-7" />
                  )}
                  {uploading ? "Uploading…" : "Add photo"}
                </button>
              )}
            </div>
            {photoError ? (
              <p role="alert" className={styles.photoError}>
                {photoError}
              </p>
            ) : (
              <p className={cn(styles.hint, styles.photoHint)}>
                JPG or PNG, 8 MB or smaller each. Photos upload immediately and are attached when you record the inspection.
              </p>
            )}
          </div>
        </Card>

        {/* ── Section 5: Inspector Info & Verdict ───────────────────── */}
        <Card className={styles.card} data-locked={!itemsVerified || undefined}>
          <SectionHeading
            icon={<ClipboardList className="h-5 w-5" />}
            title="Inspector Information & Verdict"
            subtitle="Provide your details and issue the final inspection verdict."
          />
          {!itemsVerified ? (
            <div className={styles.lockNotice} role="status">
              <span className={styles.lockIcon}>
                <LockKeyhole className="h-5 w-5" />
              </span>
              <div className={styles.lockText}>
                <p className={styles.lockTitle}>Item cross-verification required</p>
                <p className={styles.lockSub}>
                  Record the status of all {delivery.items.length} delivered item
                  {delivery.items.length !== 1 ? "s" : ""} before filling in the
                  inspector details and issuing a verdict.
                </p>
              </div>
              <Button
                type="button"
                className="h-6 shrink-0 rounded-[4px] border border-yellow-600 bg-yellow-500 px-2.5 text-[0.6875rem] font-semibold text-navy-900 hover:bg-yellow-600 hover:text-navy-900"
                onClick={() => setItemsOpen(true)}
              >
                Verify items
              </Button>
            </div>
          ) : null}
          <div
            className={cn(styles.verdictGrid, !itemsVerified && styles.lockedBody)}
          >
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
                disabled={!itemsVerified}
                className={
                  !inspectorName && itemsVerified ? styles.inputError : undefined
                }
                aria-invalid={
                  itemsVerified ? !inspectorName || undefined : undefined
                }
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
                hasError={!inspectionDate && itemsVerified}
                disabled={!itemsVerified}
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
                disabled={!itemsVerified}
              />
            </div>

            <div className={styles.fieldFull}>
              <Label>
                Inspection Verdict <span className={styles.required}>*</span>
              </Label>
              <div
                className={cn(
                  styles.verdictOptions,
                  itemsVerified && !verdict && styles.verdictError
                )}
                role="group"
                aria-label="Inspection verdict"
              >
                {(
                  [
                    {
                      value: "passed",
                      label: "Passed / Complete",
                      desc: "Every item is OK and the full PO quantity has been received.",
                      tone: "ok",
                      disabled: !canComplete,
                      disabledReason:
                        "Passed requires every item status to be OK and the remaining quantity to be fully received.",
                    },
                    {
                      value: "partial",
                      label: "Partial",
                      desc: "Some items are short or still outstanding; only received items move to stocks.",
                      tone: "warn",
                      disabled: false,
                      disabledReason: undefined,
                    },
                    {
                      value: "failed",
                      label: "Return to Supplier",
                      desc: "An item is missing or damaged — the delivery is sent back to the supplier.",
                      tone: "bad",
                      disabled: !canReturn,
                      disabledReason:
                        "Return to Supplier is only allowed when an item status is Missing or Damaged.",
                    },
                  ] as {
                    value: Verdict;
                    label: string;
                    desc: string;
                    tone: string;
                    disabled: boolean;
                    disabledReason?: string;
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
                    disabled={!itemsVerified || opt.disabled}
                    title={
                      !itemsVerified
                        ? "Complete item cross-verification first."
                        : opt.disabled
                        ? opt.disabledReason
                        : undefined
                    }
                  >
                    <span className={styles.verdictOptionLabel}>{opt.label}</span>
                    <span className={styles.verdictOptionDesc}>{opt.desc}</span>
                  </button>
                ))}
              </div>
              {!itemsVerified ? (
                <p className={styles.hint}>
                  <LockKeyhole className="inline h-4 w-4 mr-1" />
                  The verdict unlocks once every item has a cross-verification
                  status.
                </p>
              ) : !canComplete || !canReturn ? (
                <p className={styles.hint}>
                  <AlertCircle className="inline h-4 w-4 mr-1" />
                  {!canComplete && !canReturn
                    ? "Passed needs every item OK with full quantities; Return to Supplier needs a missing or damaged item."
                    : !canComplete
                    ? "Passed unlocks when every item is OK and the entered quantity covers the Remaining for every item (entries can't exceed Remaining)."
                    : "Return to Supplier unlocks when at least one item is marked Missing or Damaged."}
                </p>
              ) : null}
            </div>
          </div>
        </Card>
        </div>

        {/* ── Submit row ────────────────────────────────────────────── */}
        {/* Incomplete-form guidance fires as top-center sonner toasts via
            handleSubmit. A valid submit navigates instantly; the write runs
            in the background and only a toast reports a failure. */}
        <div className={styles.submitRow}>
          <div className={styles.submitActions}>
            <Button
              type="submit"
              className="h-6 gap-1 rounded-[4px] border border-yellow-600 bg-yellow-500 px-2.5 text-[0.6875rem] font-semibold text-navy-900 hover:bg-yellow-600 hover:text-navy-900"
              disabled={verdict === ""}
              title={
                verdict === ""
                  ? "Select an inspection verdict first."
                  : undefined
              }
            >
              {isEditable ? 'Update Inspection' : 'Record Inspection'}
            </Button>
          </div>
        </div>
      </form>
    </section>
  );
}
