"use client";

import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "pgso:theme-preference";

function isPreference(v: unknown): v is ThemePreference {
  return v === "light" || v === "dark" || v === "system";
}

/**
 * Remembers the user's appearance choice (Light / Dark / System) in
 * localStorage and mirrors it onto `html[data-theme]` for future theming.
 *
 * Menu-rows only for now: selecting an option records the preference and
 * moves the check mark, but page colors stay as-is until a theme system
 * lands. Safe for SSR — storage is read inside an effect, so the first
 * render always matches the server ("light").
 */
export function useThemePreference() {
  const [theme, setThemeState] = useState<ThemePreference>("light");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const initial = isPreference(stored) ? stored : "light";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional hydration from persisted preference
      setThemeState(initial);
      document.documentElement.dataset.theme = initial;
    } catch {
      // Storage blocked (private mode) — fall back to light.
    }
  }, []);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.dataset.theme = next;
    } catch {
      // Storage blocked — in-memory choice still applies to the menu.
    }
  }, []);

  return { theme, setTheme };
}
