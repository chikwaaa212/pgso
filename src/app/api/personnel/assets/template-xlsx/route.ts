import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { buildAssetTemplateWorkbook } from "@/lib/asset-excel";

export const runtime = "nodejs";

// GET /api/personnel/assets/template-xlsx — exact-header import template.
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
    if (
      !profile ||
      profile.status !== "active" ||
      (profile.role !== "pgso_personnel" && profile.role !== "super_admin")
    ) {
      return new Response("Forbidden.", { status: 403 });
    }
  } catch {
    return new Response("Unauthorized.", { status: 401 });
  }

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
