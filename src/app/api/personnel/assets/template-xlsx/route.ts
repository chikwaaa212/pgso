import { buildAssetTemplateWorkbook } from "@/lib/asset-excel";

export const runtime = "nodejs";

// GET /api/personnel/assets/template-xlsx — exact-header import template.
export async function GET() {
  const wb = buildAssetTemplateWorkbook();
  const raw = await wb.xlsx.writeBuffer();
  const body = new Uint8Array(raw as ArrayBuffer);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="ASSET-TEMPLATE.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
