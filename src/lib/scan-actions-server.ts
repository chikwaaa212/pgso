"use server";

/**
 * Auth-scoped resolver for a scanned asset/stock tag.
 *
 * The pick lists in the repair and request dialogs search by text and return
 * only a `PAGE_SIZE` window, so a scanned asset is usually not in them. This
 * action returns exactly one option in the same shape the dialogs consume,
 * plus the current holder so the form can prefill it.
 *
 * Authorization is enforced here: employees (and signed-out callers) cannot
 * resolve arbitrary asset records.
 */

import prisma from "@/lib/prisma";
import { requirePersonnelScope } from "@/lib/personnel-scope";
import { assetOptionDisabledReason } from "@/lib/asset-option";
import { ASSET_TAG_ID_RE } from "@/lib/asset-tag";
import type { ScannedAssetPrefill } from "@/lib/scan-actions";

function label(bits: (string | null | undefined)[], fallback: string): string {
  const text = bits.filter(Boolean).join(" — ");
  return text ? text.slice(0, 80) : fallback;
}

export async function getScannedAssetOption(
  id: string
): Promise<{ prefill: ScannedAssetPrefill } | { error: string }> {
  const assetId = String(id ?? "").trim();
  if (!ASSET_TAG_ID_RE.test(assetId)) {
    return { error: "That tag does not carry a valid record id." };
  }

  try {
    await requirePersonnelScope();
  } catch {
    return { error: "Sign in with a personnel account to act on this asset." };
  }

  try {
    const asset = await prisma.asset
      .findUnique({
        where: { id: assetId },
        select: {
          id: true,
          qr_code: true,
          account_code: true,
          article: true,
          description: true,
          account_title: true,
          account_name: true,
          category: true,
          location: true,
          status: true,
          quantity: true,
          unit_cost: true,
          unit: true,
          assigned_to: true,
          end_user: true,
        },
      })
      .catch(() => null);

    if (asset) {
      let assignedToName: string | null = null;
      if (asset.assigned_to) {
        const holder = await prisma.profile
          .findUnique({
            where: { id: asset.assigned_to },
            select: { full_name: true },
          })
          .catch(() => null);
        assignedToName = holder?.full_name?.trim() || null;
      }
      const holderName =
        assignedToName || asset.end_user?.trim() || null;

      return {
        prefill: {
          option: {
            id: asset.id,
            kind: "asset",
            label: label(
              [asset.qr_code ?? asset.account_code, asset.article, asset.description],
              "Asset"
            ),
            location: asset.location,
            status: asset.status,
            quantity: asset.quantity,
            account_code: asset.account_code,
            account_title: asset.account_title ?? asset.account_name,
            asset_type: asset.category,
            unit_cost: asset.unit_cost != null ? Number(asset.unit_cost) : null,
            disabledReason: assetOptionDisabledReason({
              source: "asset",
              status: asset.status,
              quantity: asset.quantity,
              assigned_to: asset.assigned_to,
            }),
          },
          assignedToId: asset.assigned_to ?? null,
          assignedToName,
          holderName,
        },
      };
    }

    const stock = await prisma.inventoryItem
      .findUnique({
        where: { id: assetId },
        select: {
          id: true,
          item_name: true,
          account_code: true,
          quantity: true,
          location: true,
          unit_cost: true,
        },
      })
      .catch(() => null);

    if (!stock) return { error: "This tag no longer matches a record." };

    return {
      prefill: {
        option: {
          id: stock.id,
          kind: "stock",
          label: label([stock.account_code, stock.item_name], "Stock item"),
          location: stock.location,
          status: "available",
          quantity: stock.quantity,
          account_code: stock.account_code,
          account_title: null,
          asset_type: null,
          unit_cost: stock.unit_cost != null ? Number(stock.unit_cost) : null,
          disabledReason: assetOptionDisabledReason({
            source: "stock",
            quantity: stock.quantity,
          }),
        },
        assignedToId: null,
        assignedToName: null,
        holderName: stock.location?.trim()
          ? `PGSO stock — ${stock.location.trim()}`
          : "PGSO stock",
      },
    };
  } catch (e) {
    console.error("[getScannedAssetOption]", e);
    return { error: "Could not load the scanned record. Please try again." };
  }
}
