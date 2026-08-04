/**
 * Sistema de cores 100% configurável.
 *
 * As cores escolhidas na Dashboard (Aparência → Cores do Tema) são aplicadas
 * SOMENTE na página pública de agendamento (/p/:slug), via variáveis CSS
 * no elemento raiz dessa página. O restante do sistema usa os padrões.
 */

import type React from "react";

export type AppearanceKey =
  | "primary"
  | "secondary"
  | "accent"
  | "button"
  | "icon"
  | "link"
  | "badge"
  | "card"
  | "border"
  | "background"
  | "header"
  | "input"
  | "hover"
  | "text"
  | "textMuted";

export type Appearance = Record<AppearanceKey, string>;

export const APPEARANCE_FIELDS: Array<{ key: AppearanceKey; label: string; hint: string }> = [
  { key: "primary", label: "Cor Primária", hint: "Identidade principal da marca" },
  { key: "secondary", label: "Cor Secundária", hint: "Superfícies de apoio" },
  { key: "accent", label: "Cor de Destaque", hint: "Ênfase e estados ativos" },
  { key: "button", label: "Cor dos Botões", hint: "Botões principais e gradientes" },
  { key: "icon", label: "Cor dos Ícones", hint: "Ícones decorativos" },
  { key: "link", label: "Cor dos Links", hint: "Links de texto" },
  { key: "badge", label: "Cor dos Badges", hint: "Selos e etiquetas" },
  { key: "card", label: "Cor dos Cards", hint: "Superfície elevada" },
  { key: "border", label: "Cor das Bordas", hint: "Contornos e divisores" },
  { key: "background", label: "Cor do Fundo", hint: "Fundo geral das páginas" },
  { key: "header", label: "Cor do Header", hint: "Topo e barras fixas" },
  { key: "input", label: "Cor dos Inputs", hint: "Fundo dos campos" },
  { key: "hover", label: "Cor dos Hover", hint: "Realce ao passar o mouse" },
  { key: "text", label: "Cor do Texto Principal", hint: "Títulos e conteúdo" },
  { key: "textMuted", label: "Cor do Texto Secundário", hint: "Legendas e apoios" },
];

/** Preset claro — corresponde ao tema padrão do Agendaí. */
export const LIGHT_PRESET: Appearance = {
  primary: "#0C4A6E",
  secondary: "#F1F5F9",
  accent: "#0284C7",
  button: "#0284C7",
  icon: "#0284C7",
  link: "#0284C7",
  badge: "#0284C7",
  card: "#FFFFFF",
  border: "#E2E8F0",
  background: "#FFFFFF",
  header: "#FFFFFF",
  input: "#FFFFFF",
  hover: "#F1F5F9",
  text: "#0F172A",
  textMuted: "#64748B",
};

/** Preset escuro — base premium (superfícies elevadas). */
export const DARK_PRESET: Appearance = {
  primary: "#38BDF8",
  secondary: "#1E293B",
  accent: "#38BDF8",
  button: "#0EA5E9",
  icon: "#38BDF8",
  link: "#38BDF8",
  badge: "#38BDF8",
  card: "#1E293B",
  border: "#334155",
  background: "#0B1220",
  header: "#111C2E",
  input: "#16223A",
  hover: "#233047",
  text: "#F8FAFC",
  textMuted: "#94A3B8",
};

export const COLOR_PRESETS: Array<{ name: string; color: string }> = [
  { name: "Azul", color: "#0284C7" },
  { name: "Dourado", color: "#EAB308" },
  { name: "Vermelho", color: "#DC2626" },
  { name: "Verde", color: "#16A34A" },
  { name: "Roxo", color: "#7C3AED" },
  { name: "Laranja", color: "#EA580C" },
];

const KEY_LIGHT = "agendai-appearance-light";
const KEY_DARK = "agendai-appearance-dark";

export function storageKey(mode: "light" | "dark") {
  return mode === "dark" ? KEY_DARK : KEY_LIGHT;
}

export function loadAppearance(mode: "light" | "dark"): Appearance {
  const base = mode === "dark" ? DARK_PRESET : LIGHT_PRESET;
  if (typeof window === "undefined") return base;
  try {
    const raw = window.localStorage.getItem(storageKey(mode));
    if (!raw) return base;
    return { ...base, ...(JSON.parse(raw) as Partial<Appearance>) };
  } catch {
    return base;
  }
}

export function saveAppearance(mode: "light" | "dark", value: Appearance) {
  try {
    window.localStorage.setItem(storageKey(mode), JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/**
 * Aplica os tokens nas variáveis CSS. As cores escolhidas na Dashboard só
 * devem valer para a página pública de agendamento (/p/:slug) — por isso o
 * alvo padrão não é mais o <html>, e sim o elemento raiz da página de
 * agendamento (via useBookingTheme). Passar target deixa o escopo explícito.
 */
export function applyAppearance(a: Appearance, target?: HTMLElement) {
  if (typeof document === "undefined") return;
  const s = (target ?? document.documentElement).style;
  const set = (name: string, value: string) => s.setProperty(name, value);

  set("--primary", a.primary);
  set("--brand", a.primary);
  set("--sidebar-primary", a.primary);
  set("--secondary", a.secondary);
  set("--accent", a.accent);
  set("--ring", a.accent);
  set("--sidebar-ring", a.accent);
  set("--btn-color", a.button);
  set("--icon-color", a.icon);
  set("--link-color", a.link);
  set("--badge-color", a.badge);
  set("--card", a.card);
  set("--popover", a.card);
  set("--border", a.border);
  set("--sidebar-border", a.border);
  set("--input", a.border);
  set("--background", a.background);
  set("--surface", a.background);
  set("--header-color", a.header);
  set("--sidebar", a.header);
  set("--input-bg", a.input);
  set("--hover-color", a.hover);
  set("--muted", a.hover);
  set("--sidebar-accent", a.hover);
  set("--foreground", a.text);
  set("--card-foreground", a.text);
  set("--popover-foreground", a.text);
  set("--secondary-foreground", a.text);
  set("--sidebar-foreground", a.text);
  set("--sidebar-accent-foreground", a.text);
  set("--muted-foreground", a.textMuted);
}

export function resetAppearance(mode: "light" | "dark", target?: HTMLElement) {
  try {
    window.localStorage.removeItem(storageKey(mode));
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    const keys = [
      "--primary", "--brand", "--sidebar-primary", "--secondary", "--accent", "--ring",
      "--sidebar-ring", "--btn-color", "--icon-color", "--link-color", "--badge-color",
      "--card", "--popover", "--border", "--sidebar-border", "--input", "--background",
      "--surface", "--header-color", "--sidebar", "--input-bg", "--hover-color", "--muted",
      "--sidebar-accent", "--foreground", "--card-foreground", "--popover-foreground",
      "--secondary-foreground", "--sidebar-foreground", "--sidebar-accent-foreground",
      "--muted-foreground",
    ];
    const el = (target ?? document.documentElement) as HTMLElement;
    for (const k of keys) el.style.removeProperty(k);
  }
}

/** Retorna true se o usuário já personalizou alguma cor do tema. */
export function isCustomizedAppearance(a: Appearance, mode: "light" | "dark") {
  const preset = mode === "dark" ? DARK_PRESET : LIGHT_PRESET;
  return APPEARANCE_FIELDS.some((f) => a[f.key] !== preset[f.key]);
}

/** Converte a aparência em variáveis CSS para uso inline (preview e página). */
export function appearanceCssVars(a: Appearance): React.CSSProperties {
  return {
    "--primary": a.primary,
    "--brand": a.primary,
    "--sidebar-primary": a.primary,
    "--secondary": a.secondary,
    "--accent": a.accent,
    "--ring": a.accent,
    "--sidebar-ring": a.accent,
    "--btn-color": a.button,
    "--icon-color": a.icon,
    "--link-color": a.link,
    "--badge-color": a.badge,
    "--card": a.card,
    "--popover": a.card,
    "--border": a.border,
    "--input": a.border,
    "--background": a.background,
    "--surface": a.background,
    "--header-color": a.header,
    "--input-bg": a.input,
    "--hover-color": a.hover,
    "--muted": a.hover,
    "--foreground": a.text,
    "--card-foreground": a.text,
    "--muted-foreground": a.textMuted,
  } as React.CSSProperties;
}
