"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  CACHE_BUSTED_EVENT,
  clearAllClientCache,
  clearLegacyPersistedSnapshots,
} from "@/lib/client-cache";

/** Cross-tab logout broadcast (localStorage is shared; sessionStorage is not). */
export const LOGOUT_BROADCAST_KEY = "pgso:logout-broadcast";

export function broadcastLogout(): void {
  clearAllClientCache();
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(LOGOUT_BROADCAST_KEY, String(Date.now()));
    }
  } catch {
    // ignore
  }
}

function isAuthPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/signup" ||
    pathname.startsWith("/signup/") ||
    pathname.startsWith("/auth/")
  );
}

/**
 * Global client-cache hygiene, mounted once in the root layout:
 * - Drops legacy persisted per-user snapshots written by older builds.
 * - Clears the entire cache (backstop) whenever an auth page mounts —
 *   covers logout redirects without depending on every logout button.
 * - Relays logout clears across open tabs via a localStorage broadcast.
 * Renders nothing.
 */
export function ClientCacheManager(): null {
  const pathname = usePathname();

  useEffect(() => {
    clearLegacyPersistedSnapshots();
  }, []);

  useEffect(() => {
    if (isAuthPath(pathname)) {
      clearAllClientCache();
    }
  }, [pathname]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOGOUT_BROADCAST_KEY && e.newValue) {
        clearAllClientCache();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Cross-tab full-clear relay: when any tab busts everything, peers drop
  // their in-memory copies too (their sessionStorage is per-tab, already
  // cleared locally by the originating tab's broadcast on logout).
  useEffect(() => {
    const onBusted = (e: Event) => {
      const prefixes = (e as CustomEvent<string[]>).detail ?? [];
      if (prefixes.includes("pgso:")) {
        try {
          if (typeof window !== "undefined" && window.localStorage) {
            window.localStorage.setItem(LOGOUT_BROADCAST_KEY, String(Date.now()));
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener(CACHE_BUSTED_EVENT, onBusted);
    return () => window.removeEventListener(CACHE_BUSTED_EVENT, onBusted);
  }, []);

  return null;
}
