import { importPpmpFromExcel, type ImportPpmpState } from "@/app/personnel/ppmp/actions";
import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * PPMP workbook upload.
 *
 * Why a route handler instead of a Server Action: the browser sends the whole
 * workbook before the server can inspect `file.size`, and Server Actions reject
 * oversized request bodies at the transport layer. That surfaces as a bare
 * `TypeError: Failed to fetch` with no readable reason. A route handler streams
 * the multipart body itself, so the import can return a real message (and the
 * configured action limit no longer caps PPMP uploads).
 */
export async function POST(req: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }

  const profile = await prisma.profile
    .findUnique({ where: { id: user.id }, select: { role: true, status: true } })
    .catch(() => null);
  if (
    !profile ||
    profile.status !== "active" ||
    (profile.role !== "pgso_personnel" && profile.role !== "super_admin")
  ) {
    return Response.json(
      { success: false, error: "You do not have access to PPMP imports." },
      { status: 403 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch (e) {
    console.error("[ppmp-import-route] formData", e);
    return Response.json(
      { success: false, error: "The upload could not be read. Try again." },
      { status: 400 }
    );
  }

  try {
    const result: ImportPpmpState = await importPpmpFromExcel({}, formData);
    return Response.json(result);
  } catch (e) {
    console.error("[ppmp-import-route] import", e);
    return Response.json(
      { success: false, error: "Import failed unexpectedly. Try again." },
      { status: 500 }
    );
  }
}
