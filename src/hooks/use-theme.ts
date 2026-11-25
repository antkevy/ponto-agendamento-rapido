import { useCallback, useSyncExternalStore } from "react";
import {
  applyTheme,
  clearStoredTheme,
  resolveTheme,
  setStoredTheme,
  storedTheme,
  type Theme,
} from "@/lib/theme-boot";

export type { Theme } from "@/lib/theme-boot";

const listeners = new Set<() => void>();
let media: MediaQueryList | undefined;
let mediaListener: ((event: MediaQueryListEvent) => void) | undefined;

function emit() {
  listeners.forEach((listener) => listener());
}

function handleSystemChange(event: MediaQueryListEvent) {
  // Override manual tem prioridade; sem ele, o dispositivo manda.
  if (storedTheme()) return;
  const next: Theme = event.matches ? "light" : "dark";
  applyTheme(next);
  emit();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (!media && typeof window !== "undefined" && window.matchMedia) {
    media = window.matchMedia("(prefers-color-scheme: light)");
    mediaListener = handleSystemChange;
    media.addEventListener("change", mediaListener);
  }
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0 && media && mediaListener) {
      media.removeEventListener("change", mediaListener);
      media = undefined;
      mediaListener = undefined;
    }
  };
}

function getSnapshot(): Theme {
  return resolveTheme();
}

function getServerSnapshot(): Theme {
  return "dark";
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setStoredTheme(next);
    emit();
  }, [theme]);

  const useSystem = useCallback(() => {
    clearStoredTheme();
    emit();
  }, []);

  return { theme, toggle, useSystem };
}
