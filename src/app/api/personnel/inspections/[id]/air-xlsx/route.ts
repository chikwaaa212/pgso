import { createClient } from "@/lib/supabase/server";
import { getDeliveryForInspection } from "@/app/personnel/inspections/actions";
import { buildAirWorkbook } from "@/lib/air-excel";

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
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Ownership is enforced inside getDeliveryForInspection (fail-closed);
    // this gate keeps signed-out callers on a 401 instead of a 404.
    if (!user) return new Response("Unauthorized.", { status: 401 });
  } catch {
    return new Response("Unauthorized.", { status: 401 });
  }
  const delivery = await getDeliveryForInspection(id);
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
