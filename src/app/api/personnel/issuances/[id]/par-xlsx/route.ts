import { getIssuance } from "@/app/personnel/issuances/actions";
import { buildParWorkbook } from "@/lib/par-excel";

export const runtime = "nodejs";

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
  return part.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) || "PAR";
}

// GET /api/personnel/issuances/:id/par-xlsx — filled Appendix 71 PAR workbook.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const r = await getIssuance(id);
  if (!r || r.doc_type !== "PAR") {
    return new Response("PAR record not found.", { status: 404 });
  }
  const d = (r.issuance_data ?? {}) as Record<string, unknown> & {
    lines?: Array<{
      quantity?: number;
      unit?: string;
      description?: string;
      label?: string;
      propertyNo?: string;
      dateAcquired?: string;
      total?: number;
    }>;
  };

  const lines = Array.isArray(d.lines) && d.lines.length > 0 ? d.lines : null;
  const items = lines
    ? lines.map((l) => ({
        quantity: l.quantity ?? 1,
        unit: val(l.unit),
        description: val(l.description) || val(l.label) || r.item_label,
        propertyNo: val(l.propertyNo),
        dateAcquired: fmt(val(l.dateAcquired) || undefined),
        amount: l.total ?? "",
      }))
    : [
        {
          quantity: r.quantity,
          unit: val(d.unit as string | null | undefined),
          description:
            val(d.description as string | null | undefined) || r.item_label,
          propertyNo: val(d.propertyNo as string | null | undefined),
          dateAcquired: fmt(
            val(d.dateAcquired as string | null | undefined) || undefined
          ),
          amount: r.total_amount ?? "",
        },
      ];

  const wb = buildParWorkbook({
    entity: val(d.entity as string | null | undefined),
    fundCluster: val(d.fundCluster as string | null | undefined),
    parNo: val(r.doc_no),
    items,
    receivedName: val(d.toName as string | null | undefined) || r.employee_name,
    receivedPosition: val(d.toPosition as string | null | undefined),
    receivedDate: fmt(
      val(d.toDate as string | null | undefined) || r.doc_date || undefined
    ),
    issuedName: val(d.fromName as string | null | undefined),
    issuedPosition: val(d.fromPosition as string | null | undefined),
    issuedDate: fmt(
      val(d.fromDate as string | null | undefined) || r.doc_date || undefined
    ),
  });

  const raw = await wb.xlsx.writeBuffer();
  const body = new Uint8Array(raw as ArrayBuffer);
  const name = fileName(`PAR-${r.doc_no?.trim() || r.id.slice(0, 8).toUpperCase()}`);

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
