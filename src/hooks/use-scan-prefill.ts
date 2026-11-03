"use client";

/**
 * Opens a create dialog from a scanned asset deep link.
 *
 * The scanner links to `…?asset={id}` (plus `scan=transfer|replenish`). This
 * hook resolves the option through the auth-scoped resolver — the scanned
 * asset is usually outside the dialogs' 15-row text-search window — then
 * hands it to the page and strips the params so a refresh or back-navigation
 * cannot re-open the dialog.
 */

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { getScannedAssetOption } from "@/lib/scan-actions-server";
import type { ScannedAssetPrefill } from "@/lib/scan-actions";

export function useScanPrefill(
  onReady: (prefill: ScannedAssetPrefill, scan: string | null) => void
) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fired = useRef(false);
  const ready = useRef(onReady);

  useEffect(() => {
    ready.current = onReady;
  }, [onReady]);

  const assetId = params.get("asset");
  const scan = params.get("scan");

  useEffect(() => {
    if (!assetId || fired.current) return;
    fired.current = true;

    // Strip the deep-link params first so the dialog cannot re-open on a
    // re-render, refresh, or back-navigation.
    const url = new URL(window.location.href);
    url.searchParams.delete("asset");
    url.searchParams.delete("scan");
    router.replace(`${pathname}${url.search}`, { scroll: false });

    void getScannedAssetOption(assetId)
      .then((res) => {
        if ("error" in res) {
          toast.error(res.error, { duration: 3000, closeButton: true });
          return;
        }
        ready.current(res.prefill, scan);
      })
      .catch(() => {
        toast.error("Could not load the scanned record. Please try again.", {
          duration: 3000,
          closeButton: true,
        });
      });
  }, [assetId, scan, pathname, router]);
}
