"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export interface AdminRealtimeTable {
  table: string;
  /** Optional postgres_changes filter, e.g. `status=eq.pending`. */
  filter?: string;
}

interface UseAdminRealtimeOptions {
  /** Channel name — unique per page so mounts don't clash. */
  channel: string;
  tables: AdminRealtimeTable[];
  /** Silent revalidation (keep visible data, never flash a skeleton). */
  onEvent: () => void;
  enabled?: boolean;
}

/**
 * Scoped Supabase Realtime sync for Super Admin lists.
 *
 * - One channel per page, unsubscribed on unmount (no leaks/duplicates).
 * - Events are coalesced (min 2s between refreshes) so a burst of writes
 *   triggers one silent `refresh()`, never a skeleton flash.
 * - Read-only: the database stays the source of truth, but all writes still
 *   go through authorized server actions. If RLS blocks the channel the
 *   hook silently no-ops and SWR polling remains the fallback.
 */
export function useAdminRealtime({ channel, tables, onEvent, enabled = true }: UseAdminRealtimeOptions) {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  // String key — stable across renders for inline literals with the same
  // content, so the subscription effect doesn't resubscribe every render.
  const tablesKey = tables.map((t) => `${t.table}:${t.filter ?? ""}`).join(",");
  const tablesRef = useRef(tables);
  useEffect(() => {
    tablesRef.current = tables;
  }, [tables]);

  useEffect(() => {
    if (!enabled || tablesRef.current.length === 0) return;
    const watched = tablesRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastRefresh = 0;
    let supabase: ReturnType<typeof createClient> | null = null;
    let realtimeChannel: import("@supabase/supabase-js").RealtimeChannel | null = null;

    const schedule = () => {
      const now = Date.now();
      if (now - lastRefresh < 2000) {
        if (!timer) {
          timer = setTimeout(() => {
            timer = undefined;
            lastRefresh = Date.now();
            onEventRef.current();
          }, 2000 - (now - lastRefresh));
        }
        return;
      }
      lastRefresh = now;
      onEventRef.current();
    };

    try {
      supabase = createClient();
      realtimeChannel = supabase.channel(channel);
      for (const t of watched) {
        realtimeChannel.on(
          "postgres_changes",
          { event: "*", schema: "public", table: t.table, ...(t.filter ? { filter: t.filter } : {}) },
          schedule
        );
      }
      void realtimeChannel.subscribe();
    } catch {
      // Realtime unavailable — SWR revalidation remains the fallback.
      return;
    }

    return () => {
      if (timer) clearTimeout(timer);
      try {
        if (supabase && realtimeChannel) void supabase.removeChannel(realtimeChannel);
      } catch {
        // ignore cleanup errors
      }
    };
  }, [channel, enabled, tablesKey]);
}
