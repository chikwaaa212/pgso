"use client"

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { checkDatabaseStatus } from "@/app/personnel/system/actions";

/** Fixed toast id so the banner never stacks and can be dismissed on recovery. */
const DB_DOWN_TOAST_ID = "pgso-db-down";

/** Re-check cadence while the database stays unreachable. */
const RETRY_INTERVAL_MS = 30_000;

/**
 * Watches database reachability for the Personnel shell and pops a
 * top-center Sonner reminder when the DB can't be reached — tables would
 * otherwise just look empty with no explanation.
 *
 * - Checks on mount, when the browser goes back online, and every 30s
 *   while down; the Retry button re-checks immediately.
 * - Stays up until the database answers (fixed id, no duplicates, no
 *   auto-dismiss); on recovery it dismisses and shows a brief back-online
 *   note.
 */
export function DbDownNotifier() {
  const downRef = useRef(false);
  const checkingRef = useRef(false);

  const showDownBanner = useCallback(() => {
    downRef.current = true;
    toast.error("Can't reach the database", {
      id: DB_DOWN_TOAST_ID,
      position: "top-center",
      duration: Infinity,
      description:
        "You're seeing cached or empty data. Check your internet connection, then tap Retry.",
      action: {
        label: "Retry",
        onClick: () => {
          void checkNow();
        },
      },
    });
  }, []);

  const clearDownBanner = useCallback((recovered: boolean) => {
    if (!downRef.current) return;
    downRef.current = false;
    toast.dismiss(DB_DOWN_TOAST_ID);
    if (recovered) {
      toast.success("Database is back online", {
        position: "top-center",
        duration: 4000,
        description: "Your data will refresh automatically.",
      });
    }
  }, []);

  const checkNow = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const { ok } = await checkDatabaseStatus();
      if (ok) {
        clearDownBanner(downRef.current);
      } else {
        showDownBanner();
      }
      return ok;
    } catch {
      showDownBanner();
      return false;
    } finally {
      checkingRef.current = false;
    }
  }, [clearDownBanner, showDownBanner]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    let mounted = true;

    void checkNow().then((ok) => {
      // Only keep polling while the database stays down.
      if (mounted && ok === false) {
        interval = setInterval(() => {
          void checkNow().then((recovered) => {
            if (recovered && interval) {
              clearInterval(interval);
              interval = undefined;
            }
          });
        }, RETRY_INTERVAL_MS);
      }
    });

    const onOnline = () => {
      void checkNow();
    };
    window.addEventListener("online", onOnline);
    return () => {
      mounted = false;
      window.removeEventListener("online", onOnline);
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount + online only; checkNow is ref-guarded
  }, []);

  return null;
}
