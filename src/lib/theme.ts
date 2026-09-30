import { useCallback, useEffect, useState } from "react";

export type Theme = "light" | "dark";

/** The same key is read by the inline script in index.html before the first paint. */
export const themeStorageKey = "kolobochnaya.theme";
const themeChangedEvent = "kolobochnaya:theme";

function systemTheme(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function chosenTheme(): Theme | null {
  if (typeof document === "undefined") return null;
  const value = document.documentElement.dataset.theme;
  return value === "dark" || value === "light" ? value : null;
}

/** The theme on screen: the visitor's own choice, otherwise the system setting. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => chosenTheme() ?? systemTheme());

  useEffect(() => {
    const update = () => setTheme(chosenTheme() ?? systemTheme());
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    update();
    media?.addEventListener("change", update);
    window.addEventListener(themeChangedEvent, update);
    return () => {
      media?.removeEventListener("change", update);
      window.removeEventListener(themeChangedEvent, update);
    };
  }, []);

  const toggle = useCallback(() => {
    const next: Theme = (chosenTheme() ?? systemTheme()) === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(themeStorageKey, next);
    } catch {
      // The choice still applies to the open page when storage is unavailable.
    }
    window.dispatchEvent(new Event(themeChangedEvent));
  }, []);

  return { theme, toggle };
}
