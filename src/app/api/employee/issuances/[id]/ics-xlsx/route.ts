import { getMyIssuanceDetail } from "@/app/employee/actions";
import { buildIcsWorkbook } from "@/lib/ics-excel";
import { requireEmployee } from "@/lib/auth-guard";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmt(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-PH", {
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
  return part.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) || "ICS";
}

// GET /api/employee/issuances/:id/ics-xlsx — own ICS records only.
// Order: 401 (anonymous) → 403 (wrong role) → 404 (not found / not mine /
// wrong type). Never reuses the personnel route; the lookup is scoped by
// employee_id server-side via getMyIssuanceDetail.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return new Response("ICS record not found.", { status: 404 });
  }
  try {
    await requireEmployee();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.startsWith("Forbidden")) {
      return new Response("Forbidden.", { status: 403 });
    }
    return new Response("Unauthorized.", { status: 401 });
  }
  const r = await getMyIssuanceDetail(id);
  if (!r || r.doc_type !== "ICS") {
    return new Response("ICS record not found.", { status: 404 });
  }
  const d = (r.issuance_data ?? {}) as Record<string, unknown> & {
    lines?: Array<{
      quantity?: number;
      unit?: string;
      unitCost?: number;
      total?: number;
      description?: string;
      label?: string;
      inventoryItemNo?: string;
      estUsefulLife?: string;
    }>;
  };

  const lines = Array.isArray(d.lines) && d.lines.length > 0 ? d.lines : null;
  const items = lines
    ? lines.map((l) => ({
        quantity: l.quantity ?? 1,
        unit: val(l.unit),
        unitCost: l.unitCost ?? "",
        totalCost: l.total ?? "",
        description: val(l.description) || val(l.label) || r.item_label,
        inventoryItemNo: val(l.inventoryItemNo),
        estUsefulLife: val(l.estUsefulLife),
      }))
    : [
        {
          quantity: r.quantity,
          unit: val(d.unit as string | null | undefined),
          unitCost: r.unit_cost ?? "",
          totalCost: r.total_amount ?? "",
          description:
            val(d.description as string | null | undefined) || r.item_label,
          inventoryItemNo: val(d.inventoryItemNo as string | null | undefined),
          estUsefulLife: val(d.estUsefulLife as string | null | undefined),
        },
      ];

  const wb = buildIcsWorkbook({
    entity: val(d.entity as string | null | undefined),
    fundCluster: val(d.fundCluster as string | null | undefined),
    icsNo: val(r.doc_no),
    items,
    receivedFromName: val(d.fromName as string | null | undefined),
    receivedFromPosition: val(d.fromPosition as string | null | undefined),
    receivedFromDate: fmt(
      val(d.fromDate as string | null | undefined) || r.doc_date || undefined
    ),
    receivedByName:
      val(d.toName as string | null | undefined) || r.employee_name,
    receivedByPosition: val(d.toPosition as string | null | undefined),
    receivedByDate: fmt(
      val(d.toDate as string | null | undefined) || r.doc_date || undefined
    ),
  });

  const raw = await wb.xlsx.writeBuffer();
  const body = new Uint8Array(raw as ArrayBuffer);
  const name = fileName(`ICS-${r.doc_no?.trim() || r.id.slice(0, 8).toUpperCase()}`);

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
