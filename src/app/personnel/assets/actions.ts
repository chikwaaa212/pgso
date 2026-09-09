"use server";

import prisma from "@/lib/prisma";
import { generateQrDataUrl } from "@/lib/qrcode";

export interface AssetRow {
  id: string;
  property_number: string | null;
  qr_code: string | null;
  category: string | null;
  description: string | null;
  condition: string | null;
  location: string | null;
  assigned_to: string | null;
  status: string | null;
  date_acquired: string | null;
  image_url: string | null;
  created_at: string | null;
  /** Base64 SVG data-URL for the QR code (generated from qr_code, property_number or id). */
  qr_data_url: string;
}

/**
 * Fetch every asset with a server-generated QR code data URL.
 * The QR encodes the stored `qr_code` value when present; otherwise it encodes
 * the property number, falling back to the asset id.
 */
export async function getAssets(): Promise<AssetRow[]> {
  const assets = await prisma.asset.findMany({
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      property_number: true,
      qr_code: true,
      category: true,
      description: true,
      condition: true,
      location: true,
      assigned_to: true,
      status: true,
      date_acquired: true,
      image_url: true,
      created_at: true,
    },
  });

  const rows: AssetRow[] = await Promise.all(
    assets.map(async (a) => ({
      id: a.id,
      property_number: a.property_number,
      qr_code: a.qr_code,
      category: a.category,
      description: a.description,
      condition: a.condition,
      location: a.location,
      assigned_to: a.assigned_to,
      status: a.status,
      date_acquired: a.date_acquired?.toISOString().slice(0, 10) ?? null,
      image_url: a.image_url,
      created_at: a.created_at?.toISOString() ?? null,
      qr_data_url: await generateQrDataUrl(
        a.qr_code ?? a.property_number ?? a.id,
      ),
    })),
  );

  return rows;
}
