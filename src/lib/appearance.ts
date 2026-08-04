/**
 * Sistema de cores 100% configurável.
 *
 * Cada token abaixo é escrito em variáveis CSS globais no <html>, portanto
 * qualquer alteração feita na Dashboard (Aparência → Cores do Tema) reflete
 * automaticamente em todo o sistema, sem precisar mexer no código.
 */

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
  applyAppearance(value);
}

/** Aplica os tokens nas variáveis CSS globais. */
export function applyAppearance(a: Appearance) {
  if (typeof document === "undefined") return;
  const s = document.documentElement.style;
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

export function resetAppearance(mode: "light" | "dark") {
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
    for (const k of keys) document.documentElement.style.removeProperty(k);
  }
}
