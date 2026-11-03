/**
 * Pure scan-to-action matrix.
 *
 * The scanner shows the same identifying card to everyone, but the actions it
 * offers depend on the portal: personnel and super admins can log a repair,
 * request a transfer, or request a replenishment, while the public `/scan`
 * page stays read-only (identification only). Keeping this in a pure module
 * means the matrix is unit-tested without rendering React.
 *
 * No mutation happens here — the actions are deep links into existing pages
 * whose server actions still enforce their own authorization.
 */

import { assetTagHref, type AssetTagRef } from "./asset-tag";

export type ScanPortal = "personnel" | "super-admin" | "public";

export type ScanActionId =
  | "open"
  | "history"
  | "repair"
  | "transfer"
  | "replenish";

export interface ScanAction {
  id: ScanActionId;
  label: string;
  href: string;
  kind: "primary" | "secondary";
}

/** One pick-list option resolved from a scanned tag (asset or stock). */
export interface ScannedAssetOption {
  id: string;
  kind: "asset" | "stock";
  label: string;
  location: string | null;
  status: string | null;
  quantity: number | null;
  account_code: string | null;
  account_title: string | null;
  asset_type: string | null;
  unit_cost: number | null;
  disabledReason: string | null;
}

/** Everything a scan can prefill: the pick-list option + current holder. */
export interface ScannedAssetPrefill {
  option: ScannedAssetOption;
  assignedToId: string | null;
  assignedToName: string | null;
  holderName: string | null;
}

/** Portal base path used for the action links. */
function portalBase(portal: ScanPortal): string {
  return portal === "super-admin" ? "/super-admin" : "/personnel";
}

export function scanActionsFor(
  ref: AssetTagRef,
  portal: ScanPortal
): ScanAction[] {
  const superAdmin = portal === "super-admin";
  const openHref = assetTagHref(ref, superAdmin);
  const actions: ScanAction[] = [
    {
      id: "open",
      label: ref.kind === "stock" ? "Open stock item" : "Open asset details",
      href: openHref,
      kind: "primary",
    },
  ];

  // The public scanner may only identify; acting requires signing in, and the
  // detail page itself redirects to login.
  if (portal === "public") return actions;

  const base = portalBase(portal);
  const id = encodeURIComponent(ref.id);

  if (ref.kind === "stock") {
    // Consumables are restocked, never repaired — and stock lots have no
    // custody history section.
    actions.push({
      id: "replenish",
      label: "Request replenishment",
      href: `${base}/requests?asset=${id}&scan=replenish`,
      kind: "secondary",
    });
    return actions;
  }

  actions.push(
    {
      id: "history",
      label: "View history",
      href: `${openHref}#asset-history`,
      kind: "secondary",
    },
    {
      id: "repair",
      label: "Log repair",
      href: `${base}/repairs?asset=${id}`,
      kind: "secondary",
    },
    {
      id: "transfer",
      label: "Request transfer",
      href: `${base}/requests?asset=${id}&scan=transfer`,
      kind: "secondary",
    }
  );
  return actions;
}
