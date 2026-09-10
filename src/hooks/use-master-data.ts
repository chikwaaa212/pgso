"use client";

import { useEffect, useState } from "react";

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
 */
export function useMasterData(): MasterDataState {
  const [state, setState] = useState<MasterDataState>({
    catalog: [],
    units: [],
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/master-data", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          catalog?: MasterCatalogOption[];
          units?: MasterUnitOption[];
        };
        if (cancelled) return;
        setState({
          catalog: Array.isArray(json.catalog) ? json.catalog : [],
          units: Array.isArray(json.units)
            ? json.units.map((u) => u.name).filter(Boolean)
            : [],
          loaded: true,
        });
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
