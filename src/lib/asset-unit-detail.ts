import "server-only";

import prisma from "@/lib/prisma";
import { generateAssetUnitQrDataUrl } from "@/lib/qrcode";

export interface AssetUnitDetail {
  id: string;
  item_code: string;
  status: string;
  condition: string | null;
  assigned_to: string | null;
  holder_name: string | null;
  assigned_at: string | null;
  created_at: string | null;
  qr_data_url: string;
  parent: {
    kind: "asset" | "stock";
    id: string;
    property_number: string | null;
    account_code: string | null;
    article: string | null;
    description: string | null;
    category: string | null;
    location: string | null;
    unit: string | null;
    date_acquired: string | null;
  } | null;
  issuance: {
    id: string;
    doc_type: string | null;
    doc_no: string | null;
    doc_date: string | null;
  } | null;
}

export async function getAssetUnitDetail(id: string): Promise<AssetUnitDetail | null> {
  if (!id) return null;
  try {
    const unit = await prisma.assetUnit.findUnique({
      where: { id },
      select: {
        id: true,
        item_code: true,
        status: true,
        condition: true,
        assigned_to: true,
        assigned_at: true,
        issuance_id: true,
        created_at: true,
        asset: {
          select: {
            id: true,
            property_number: true,
            account_code: true,
            article: true,
            description: true,
            category: true,
            location: true,
            unit: true,
            date_acquired: true,
            condition: true,
          },
        },
        inventory: {
          select: {
            id: true,
            account_code: true,
            item_name: true,
            category: true,
            location: true,
            unit: true,
          },
        },
      },
    });
    if (!unit) return null;

    const [holder, issuance, qr] = await Promise.all([
      unit.assigned_to
        ? prisma.profile
            .findUnique({
              where: { id: unit.assigned_to },
              select: { full_name: true, position: true, office: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
      unit.issuance_id
        ? prisma
            .$queryRaw<
              Array<{ id: string; doc_type: string | null; doc_no: string | null; doc_date: Date | string | null }>
            >`SELECT id::text AS id, doc_type, doc_no, doc_date
              FROM issuance_records WHERE id = ${unit.issuance_id}::uuid LIMIT 1`
            .then((rows) => rows[0] ?? null)
            .catch(() => null)
        : Promise.resolve(null),
      generateAssetUnitQrDataUrl(unit.id).catch(() => ""),
    ]);

    const parent = unit.asset
      ? {
          kind: "asset" as const,
          id: unit.asset.id,
          property_number: unit.asset.property_number,
          account_code: unit.asset.account_code,
          article: unit.asset.article,
          description: unit.asset.description,
          category: unit.asset.category,
          location: unit.asset.location,
          unit: unit.asset.unit,
          date_acquired: unit.asset.date_acquired?.toISOString().slice(0, 10) ?? null,
        }
      : unit.inventory
        ? {
            kind: "stock" as const,
            id: unit.inventory.id,
            property_number: null,
            account_code: unit.inventory.account_code,
            article: unit.inventory.item_name,
            description: null,
            category: unit.inventory.category,
            location: unit.inventory.location,
            unit: unit.inventory.unit,
            date_acquired: null,
          }
        : null;

    return {
      id: unit.id,
      item_code: unit.item_code,
      status: unit.status,
      condition: unit.condition ?? unit.asset?.condition ?? null,
      assigned_to: unit.assigned_to,
      holder_name: holder?.full_name ?? null,
      assigned_at: unit.assigned_at?.toISOString() ?? null,
      created_at: unit.created_at?.toISOString() ?? null,
      qr_data_url: qr,
      parent,
      issuance: issuance
        ? {
            id: issuance.id,
            doc_type: issuance.doc_type,
            doc_no: issuance.doc_no,
            doc_date: issuance.doc_date
              ? new Date(issuance.doc_date).toISOString().slice(0, 10)
              : null,
          }
        : null,
    };
  } catch (e) {
    console.error("[getAssetUnitDetail]", e);
    return null;
  }
}
