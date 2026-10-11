"use client";

import { useEffect, useState } from "react";
import { getClientCache, setClientCache } from "@/lib/client-cache";
import { defaultsFor } from "@/lib/query-keys";

export interface MasterCatalogOption {
  account_code: string;
  account_title: string;
  asset_type: string;
}

export interface MasterUnitOption {
  name: string;
  abbreviation: string | null;
}

interface MasterDataState {
  catalog: MasterCatalogOption[];
  units: string[];
  loaded: boolean;
}

/**
 * Active Master Data for strict-mode dropdowns. Falls back to empty lists
 * (callers keep legacy inputs) when the fetch fails or nothing is seeded.
 *
 * Static lookup: cached 30min stale / 60min max (shared `query-keys`
 * `static` preset), persisted across reloads (non-sensitive), deduped
 * in-flight, conditional revalidation via ETag (304 → keep cached).
 */
const MASTER_DATA_KEY = "pgso:master-data:active";
const MASTER_ETAG_KEY = "pgso:master-data:etag";
let masterInflight: Promise<MasterDataState> | null = null;

function readEtag(): string | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    return window.sessionStorage.getItem(MASTER_ETAG_KEY);
  } catch {
    return null;
  }
}

function writeEtag(etag: string | null): void {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return;
    if (etag) window.sessionStorage.setItem(MASTER_ETAG_KEY, etag);
  } catch {
    // ignore
  }
}

export function useMasterData(): MasterDataState {
  const [state, setState] = useState<MasterDataState>({
    catalog: [],
    units: [],
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    const { staleTime, maxAge } = defaultsFor("static");
    const load = (): Promise<MasterDataState> => {
      if (masterInflight) return masterInflight;
      masterInflight = (async (): Promise<MasterDataState> => {
        const headers: Record<string, string> = {};
        const etag = readEtag();
        if (etag) headers["If-None-Match"] = etag;
        const res = await fetch("/api/master-data", { headers });
        if (res.status === 304) {
          const cached = getClientCache<MasterDataState>(MASTER_DATA_KEY);
          if (cached) return { ...cached.data, loaded: true };
          // ETag matched but no local copy (cleared storage) — refetch plain.
          const retry = await fetch("/api/master-data", { cache: "no-store" });
          if (!retry.ok) throw new Error(`HTTP ${retry.status}`);
          const json = (await retry.json()) as {
            catalog?: MasterCatalogOption[];
            units?: MasterUnitOption[];
          };
          const next: MasterDataState = {
            catalog: Array.isArray(json.catalog) ? json.catalog : [],
            units: Array.isArray(json.units)
              ? json.units.map((u) => u.name).filter(Boolean)
              : [],
            loaded: true,
          };
          writeEtag(retry.headers.get("etag"));
          setClientCache(MASTER_DATA_KEY, next);
          return next;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          catalog?: MasterCatalogOption[];
          units?: MasterUnitOption[];
        };
        const next: MasterDataState = {
          catalog: Array.isArray(json.catalog) ? json.catalog : [],
          units: Array.isArray(json.units)
            ? json.units.map((u) => u.name).filter(Boolean)
            : [],
          loaded: true,
        };
        writeEtag(res.headers.get("etag"));
        setClientCache(MASTER_DATA_KEY, next);
        return next;
      })();
      const cleanup = () => {
        if (masterInflight === loadPromise) masterInflight = null;
      };
      const loadPromise: Promise<MasterDataState> = masterInflight;
      void loadPromise.then(cleanup, cleanup);
      return loadPromise;
    };
    void (async () => {
      // Instant paint from persisted static cache (same-tab reload safe:
      // master data holds no per-user rows). Stale-but-usable entries still
      // revalidate silently below.
      try {
        const cached = getClientCache<MasterDataState>(MASTER_DATA_KEY);
        if (cached && Date.now() - cached.fetchedAt < maxAge) {
          if (!cancelled) setState({ ...cached.data, loaded: true });
          if (Date.now() - cached.fetchedAt <= staleTime) return;
        }
      } catch {
        /* ignore */
      }
      try {
        const next = await load();
        if (!cancelled) setState(next);
      } catch (e) {
        if (!cancelled) {
          console.error("[useMasterData]", e);
          setState((s) => ({ ...s, loaded: true }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
