/** Tema global: sempre detectado automaticamente pelo dispositivo. */

export type Theme = "light" | "dark";

export function systemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

/**
 * Executado no <head>, antes da primeira pintura. Define o tema lendo direto
 * do dispositivo e continua reagindo a mudanças do sistema operacional.
 * Não há preferência gravada: o site sempre identifica o tema sozinho.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var r=document.documentElement,m=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)"),set=function(light){r.classList.toggle("dark",!light);r.style.colorScheme=light?"light":"dark"};set(!!(m&&m.matches));if(m&&m.addEventListener){m.addEventListener("change",function(e){set(e.matches)})}}catch(e){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"}})();`;
