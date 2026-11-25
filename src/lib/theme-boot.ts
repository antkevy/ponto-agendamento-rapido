/** Tema global: preferência do dispositivo com override manual opcional. */

export type Theme = "light" | "dark";

export const THEME_KEY = "agendai-theme";

function safeLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Preferência salva pelo usuário; null = seguir o dispositivo. */
export function storedTheme(): Theme | null {
  const value = safeLocalStorage()?.getItem(THEME_KEY);
  return value === "light" || value === "dark" ? value : null;
}

export function systemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveTheme(): Theme {
  return storedTheme() ?? systemTheme();
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function setStoredTheme(theme: Theme): void {
  try {
    safeLocalStorage()?.setItem(THEME_KEY, theme);
  } catch {
    /* storage bloqueado: o tema ainda é aplicado nesta sessão */
  }
  applyTheme(theme);
}

/** Volta a seguir automaticamente o dispositivo. */
export function clearStoredTheme(): void {
  try {
    safeLocalStorage()?.removeItem(THEME_KEY);
  } catch {
    /* ignore */
  }
  applyTheme(resolveTheme());
}

/**
 * Executado no <head> antes de qualquer pintura. Sem isso, a página pisca o
 * tema errado e só corrige quando o React monta (foi o que causou o delay).
 * Também reage a mudanças do sistema operacional enquanto não houver override.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_KEY)},r=document.documentElement,m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)"),get=function(){try{return localStorage.getItem(k)}catch(e){return null}};var s=get(),t=(s==="light"||s==="dark")?s:(m&&m.matches?"light":"dark");r.classList.toggle("dark",t==="dark");r.style.colorScheme=t;if(m){m.addEventListener("change",function(e){var cur=get();if(cur==="light"||cur==="dark")return;var n=e.matches?"light":"dark";r.classList.toggle("dark",n==="dark");r.style.colorScheme=n;});}}catch(e){document.documentElement.classList.add("dark");}})();`;
