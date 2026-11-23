import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ASSET_TAG_ID_RE, type PublicAssetTag } from "@/lib/asset-tag";

/**
 * Public QR lookup for one individually tracked piece (asset_units row).
 *
 * The tag encodes `/personnel/assets/unit/{id}`; this endpoint gives a
 * signed-out scanner the non-sensitive identification fields only. Costs,
 * remarks, suppliers, account numbers, and the assignee are never returned.
 */

const UUID_RE = ASSET_TAG_ID_RE;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return json({ error: "Unit not found" }, 404);

  try {
    const unit = await prisma.assetUnit.findUnique({
      where: { id },
      select: {
        id: true,
        item_code: true,
        status: true,
        condition: true,
        asset: {
          select: {
            property_number: true,
            qr_code: true,
            account_code: true,
            article: true,
            description: true,
            category: true,
            location: true,
            unit: true,
            date_acquired: true,
          },
        },
        inventory: {
          select: {
            account_code: true,
            item_name: true,
            category: true,
            location: true,
            unit: true,
          },
        },
      },
    });

    if (!unit) return json({ error: "Unit not found" }, 404);

    const parent = unit.asset ?? unit.inventory;
    const tag: PublicAssetTag = {
      kind: "unit",
      id: unit.id,
      item_code: unit.item_code,
      property_number: unit.asset?.property_number ?? null,
      qr_code: unit.asset?.qr_code ?? unit.item_code,
      account_code: parent?.account_code ?? null,
      article:
        unit.asset?.article ?? unit.inventory?.item_name ?? null,
      description: unit.asset?.description ?? null,
      category: parent?.category ?? null,
      status: unit.status,
      condition: unit.condition ?? null,
      location: parent?.location ?? null,
      quantity: 1,
      unit: parent?.unit ?? null,
      date_acquired:
        unit.asset?.date_acquired?.toISOString().slice(0, 10) ?? null,
    };
    return json(tag);
  } catch (e) {
    console.error("[api/public/asset-units]", e);
    return NextResponse.json(
      { error: "Could not load unit" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
