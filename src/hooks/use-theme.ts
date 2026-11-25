import { useCallback, useSyncExternalStore } from "react";
import { applyTheme, currentTheme, type Theme } from "@/lib/theme-boot";

export type { Theme } from "@/lib/theme-boot";

const listeners = new Set<() => void>();
let media: MediaQueryList | undefined;
let mediaListener: ((event: MediaQueryListEvent) => void) | undefined;

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);

  if (!media && typeof window !== "undefined" && window.matchMedia) {
    media = window.matchMedia("(prefers-color-scheme: light)");
    mediaListener = (event) => {
      // O dispositivo é sempre a fonte da verdade.
      applyTheme(event.matches ? "light" : "dark");
      emit();
    };
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
  return currentTheme();
}

function getServerSnapshot(): Theme {
  return "dark";
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    emit();
  }, []);

  return { theme, toggle };
}
