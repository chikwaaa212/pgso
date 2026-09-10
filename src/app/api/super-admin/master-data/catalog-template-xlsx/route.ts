import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { buildCatalogTemplateWorkbook } from "@/lib/account-catalog-excel";

export const runtime = "nodejs";

// GET /api/super-admin/master-data/catalog-template-xlsx — exact-header
// account catalog import template (matches Sample Header Sheet1).
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized.", { status: 401 });
    const profile = await prisma.profile
      .findUnique({ where: { id: user.id }, select: { role: true, status: true } })
      .catch(() => null);
    if (!profile || profile.role !== "super_admin" || profile.status !== "active") {
      return new Response("Forbidden.", { status: 403 });
    }
  } catch {
    return new Response("Unauthorized.", { status: 401 });
  }

  const wb = buildCatalogTemplateWorkbook();
  const raw = await wb.xlsx.writeBuffer();
  const body = new Uint8Array(raw as ArrayBuffer);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        'attachment; filename="ACCOUNT-CATALOG-TEMPLATE.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
