import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { getDeliveryForInspection } from "@/app/personnel/inspections/actions";
import { buildAirWorkbook } from "@/lib/air-excel";
import { PERSONNEL_API_ROLES, isUuid, resolveApiAccess } from "@/lib/api-guard";

export const runtime = "nodejs";

function fmt(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  });
}

function val(v: string | null | undefined) {
  return v?.trim() ? v.trim() : "";
}

function fileName(part: string) {
  return part.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) || "AIR";
}

// GET /api/personnel/inspections/:id/air-xlsx?entity=…&department=…&…
// Guard order: UUID → 401 (anonymous) → 403 (wrong role: personnel/
// super_admin only, active) → 404 (not found / not mine). Ownership is
// enforced inside getDeliveryForInspection (fail-closed via notFound()).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!isUuid(id)) {
    return new Response("Record not found.", { status: 404 });
  }
  const q = new URL(req.url).searchParams;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const profile = user
      ? await prisma.profile
          .findUnique({ where: { id: user.id }, select: { role: true, status: true } })
          .catch(() => null)
      : null;
    const access = resolveApiAccess(
      { userId: user?.id ?? null, role: profile?.role ?? null, status: profile?.status ?? null },
      PERSONNEL_API_ROLES
    );
    if (access === 401) return new Response("Unauthorized.", { status: 401 });
    if (access === 403) return new Response("Forbidden.", { status: 403 });
  } catch {
    return new Response("Unauthorized.", { status: 401 });
  }
  let delivery: Awaited<ReturnType<typeof getDeliveryForInspection>>;
  try {
    delivery = await getDeliveryForInspection(id);
  } catch {
    return new Response("Record not found.", { status: 404 });
  }
  const inspection = delivery.inspection_data;
  const ref = delivery.id.slice(0, 8).toUpperCase();

  const checks = inspection?.item_checks ?? [];
  const items = delivery.items.map((item) => ({
     stockNo: val(delivery.account_code),
    description: item.item_name,
    unit: item.unit ?? "",
    qty: checks.find((c) => c.itemId === item.id)?.actualQty ?? item.quantity,
  }));

  const poNoDate = delivery.po_reference
    ? `${delivery.po_reference}${delivery.date_delivered ? ` / ${fmt(delivery.date_delivered)}` : ""}`
    : fmt(delivery.date_delivered);

  const wb = buildAirWorkbook({
    entity: val(q.get("entity")),
    supplier: val(delivery.supplier),
    poNoDate: val(poNoDate),
    department: val(q.get("department")),
    rcCode: val(q.get("rcCode")),
    fundCluster: val(q.get("fundCluster")),
    iarNo: val(q.get("iarNo")),
    iarDate: fmt(q.get("iarDate")),
    invoiceNo: val(q.get("invoiceNo")),
    invoiceDate: fmt(q.get("invoiceDate")),
    items,
    // From the saved inspection record (questioning page)
    dateInspected: inspection ? fmt(inspection.inspection_date) : "",
    inspectorName: inspection?.inspector_name ?? "",
    inspectionPassed:
      (inspection?.result ?? delivery.inspection_status) === "passed",
    dateReceived: fmt(delivery.date_delivered),
    complete: delivery.delivery_status === "complete",
    partial: delivery.delivery_status === "partial",
    custodianName: delivery.recipient_name ?? "",
  });

  const raw = await wb.xlsx.writeBuffer();
  const body = new Uint8Array(raw as ArrayBuffer);
  const name = fileName(`AIR-${q.get("iarNo")?.trim() || ref}`);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
