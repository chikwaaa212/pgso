import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ASSET_TAG_ID_RE, type PublicAssetTag } from "@/lib/asset-tag";

/**
 * Public asset-tag lookup for the no-login QR scanner.
 *
 * Asset QR tags encode `/personnel/assets/{id}` (or `/stock/{id}`), and the
 * detail pages behind those URLs require a signed-in personnel account. This
 * endpoint lets the landing-page scanner show enough to identify the property
 * without exposing costs, remarks, supplier/account numbers, or assignees.
 *
 * Only non-sensitive identification fields are returned. Guarded by an
 * unguessable UUID, so no listing/enumeration is possible.
 */

const UUID_RE = ASSET_TAG_ID_RE;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      // Public, non-sensitive metadata: let the CDN absorb repeat scans.
      "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
    },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return json({ error: "Asset not found" }, 404);
  }

  try {
    const asset = await prisma.asset.findUnique({
      where: { id },
      select: {
        id: true,
        property_number: true,
        qr_code: true,
        account_code: true,
        article: true,
        description: true,
        category: true,
        status: true,
        condition: true,
        location: true,
        quantity: true,
        unit: true,
        date_acquired: true,
      },
    });

    if (asset) {
      const tag: PublicAssetTag = {
        kind: "asset",
        id: asset.id,
        property_number: asset.property_number,
        qr_code: asset.qr_code,
        account_code: asset.account_code,
        article: asset.article,
        description: asset.description,
        category: asset.category,
        status: asset.status,
        condition: asset.condition,
        location: asset.location,
        quantity: asset.quantity,
        unit: asset.unit,
        date_acquired: asset.date_acquired?.toISOString().slice(0, 10) ?? null,
      };
      return json(tag);
    }

    // Stock QR tags use `/personnel/assets/stock/{id}` — same UUID space,
    // different table. Try inventory before giving up.
    const stock = await prisma.inventoryItem.findUnique({
      where: { id },
      select: {
        id: true,
        item_name: true,
        account_code: true,
        category: true,
        quantity: true,
        unit: true,
        location: true,
        updated_at: true,
      },
    });

    if (stock) {
      const tag: PublicAssetTag = {
        kind: "stock",
        id: stock.id,
        property_number: null,
        qr_code: null,
        account_code: stock.account_code,
        article: stock.item_name,
        description: null,
        category: stock.category,
        status: "available",
        condition: null,
        location: stock.location,
        quantity: stock.quantity,
        unit: stock.unit,
        date_acquired: null,
      };
      return json(tag);
    }

    return json({ error: "Asset not found" }, 404);
  } catch (e) {
    console.error("[api/public/assets]", e);
    return NextResponse.json(
      { error: "Could not load asset" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
