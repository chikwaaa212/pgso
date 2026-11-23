"use client";

import { useEffect } from "react";

/**
 * Page-scoped print mode for dialogs that render an official form.
 *
 * While `active`, the body carries `data-print-active` and the Radix portal
 * wrapper of the dialog is tagged `data-print-portal`. The print stylesheet
 * in `receipt-overlay.module.css` uses those markers to hide the app shell and
 * every other overlay, then un-clips `[data-print-root]` so only the form is
 * printed at full page width.
 *
 * Radix portals the dialog straight into <body>; tagging its wrapper lets the
 * print stylesheet hide the sibling body children without relying on `:has()`.
 */
export function useDialogPrintMode(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const root = document.querySelector('[data-print-root="true"]');
    const portal = root?.parentElement ?? null;
    document.body.dataset.printActive = "true";
    portal?.setAttribute("data-print-portal", "true");
    return () => {
      delete document.body.dataset.printActive;
      portal?.removeAttribute("data-print-portal");
    };
  }, [active]);
}
