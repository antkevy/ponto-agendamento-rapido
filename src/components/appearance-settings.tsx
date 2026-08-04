import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Palette, RotateCcw, CheckCircle2, MapPin } from "lucide-react";
import {
  APPEARANCE_FIELDS,
  COLOR_PRESETS,
  DARK_PRESET,
  LIGHT_PRESET,
  appearanceCssVars,
  loadAppearance,
  resetAppearance,
  saveAppearance,
  type Appearance,
  type ProfessionalTheme,
} from "@/lib/appearance";
import { UIButton, UICard, UICardHeader } from "@/components/ui-kit";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";

function notifyChange() {
  window.dispatchEvent(new Event("agendai-appearance-change"));
}

/** O que cada cor altera na página pública de agendamento (/p/:slug). */
const PART_DESCRIPTIONS: Record<keyof Appearance, string> = {
  primary: "Círculo do logotipo e preços dos planos",
  secondary: "Avatar do profissional (foto ou letra)",
  accent: "Botão \"Continuar\", opções selecionadas e avisos",
  button: "Botão \"Confirmar agendamento\"",
  icon: "Ícones da página",
  link: "Links (Ver no mapa, WhatsApp)",
  badge: "Etiquetas / emblemas",
  card: "Superfície dos cartões",
  border: "Contornos dos cartões e campos",
  input: "Campos de preenchimento (nome, telefone)",
  hover: "Estado ao passar o mouse nos itens",
  background: "Fundo da página de agendamento",
  header: "Faixa superior (cabeçalho)",
  text: "Textos principais (nome do estabelecimento)",
  textMuted: "Textos secundários (descrição)",
};

function FieldLabel({ k, children }: { k: keyof Appearance; children: ReactNode }) {
  const f = APPEARANCE_FIELDS.find((x) => x.key === k);
  return <span className="font-semibold text-foreground">{f?.label ?? k}</span>;
}

/** Destaque com anel + rótulo para o pedaço do preview atingido pela cor. */
function Part({
  k,
  active,
  className = "",
  style,
  children,
}: {
  k: keyof Appearance;
  active: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}) {
  return (
    <div
      data-preview-key={k}
      style={style}
      className={`relative transition-shadow ${
        active ? "ring-2 ring-[var(--ring)] ring-offset-2 ring-offset-[var(--background)] rounded-lg z-10" : ""
      } ${className}`}
    >
      {active && k !== "background" && (
        <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background shadow-md z-20 pointer-events-none">
          <FieldLabel k={k} />
        </span>
      )}
      {children}
    </div>
  );
}

function AppearancePreview({ colors, activeKey }: { colors: Appearance; activeKey: keyof Appearance | null }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-sm font-semibold">Pré-visualização</span>
        <span className="text-xs text-muted-foreground">como fica na página de agendamento</span>
      </div>

      <div className="w-full max-w-xs">
        {/* Fundo da página (atrás do celular) */}
        <Part
          k="background"
          active={activeKey === "background"}
          className="rounded-[28px] p-3"
          style={{ ...appearanceCssVars(colors), background: "var(--background)" }}
        >
          {/* Moldura do celular / contorno */}
          <Part k="border" active={activeKey === "border"} className="rounded-3xl">
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
              {/* Cabeçalho */}
              <Part k="header" active={activeKey === "header"} className="rounded-t-3xl">
                <div
                  className="px-4 pt-4 pb-2 rounded-t-3xl"
                  style={{ backgroundColor: "color-mix(in oklab, var(--header-color) 55%, transparent)" }}
                >
                  <div className="flex items-center gap-3">
                    <Part k="primary" active={activeKey === "primary"}>
                      <div
                        className="h-12 w-12 rounded-2xl grid place-items-center text-lg font-bold text-white shadow-md"
                        style={{ backgroundColor: "var(--brand)" }}
                      >
                        B
                      </div>
                    </Part>
                    <div className="min-w-0 pt-1.5 pb-2">
                      <Part k="text" active={activeKey === "text"}>
                        <div className="h-3.5 w-32 rounded bg-foreground/15"></div>
                      </Part>
                      <Part k="textMuted" active={activeKey === "textMuted"} className="!rounded-none mt-1.5">
                        <div className="h-2 w-24 rounded bg-muted-foreground/30"></div>
                      </Part>
                    </div>
                  </div>
                </div>
              </Part>

              <div className="space-y-3 p-4">
                {/* Aviso */}
                <Part k="accent" active={activeKey === "accent"}>
                  <div className="ui-notice">
                    <CheckCircle2 className="h-5 w-5 shrink-0 ui-accent-text mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm">Confirmação automática</p>
                      <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">Aviso do estabelecimento</p>
                    </div>
                  </div>
                </Part>

                {/* Cartão com preço + profissional */}
                <Part k="card" active={activeKey === "card"} className="rounded-2xl">
                  <div className="rounded-2xl border border-[var(--border)] p-3" style={{ background: "var(--card)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="h-2.5 w-24 rounded bg-muted-foreground/30"></div>
                      <Part k="primary" active={activeKey === "primary"} className="!rounded-none">
                        <div className="text-base font-black" style={{ color: "var(--brand)" }}>
                          R$ 59,90
                        </div>
                      </Part>
                    </div>
                    <div className="my-3 border-t border-[var(--border)]"></div>
                    <div className="flex items-center gap-2">
                      <Part k="secondary" active={activeKey === "secondary"}>
                        <div
                          className="h-7 w-7 rounded-full grid place-items-center text-[10px] font-bold text-white"
                          style={{ backgroundColor: "var(--secondary)" }}
                        >
                          J
                        </div>
                      </Part>
                      <div className="h-2 w-20 rounded bg-muted-foreground/30"></div>
                      <Part k="badge" active={activeKey === "badge"} className="ml-auto !rounded-none">
                        <span className="ui-badge">Popular</span>
                      </Part>
                    </div>
                  </div>
                </Part>

                {/* Chips */}
                <div className="flex flex-wrap gap-1.5">
                  <Part k="accent" active={activeKey === "accent"}>
                    <button type="button" data-selected="true" className="chip">
                      Corte
                    </button>
                  </Part>
                  <Part k="hover" active={activeKey === "hover"}>
                    <button
                      type="button"
                      className="chip"
                      style={{ backgroundColor: "var(--hover-color)", color: "var(--foreground)", filter: "brightness(1.03)" }}
                    >
                      Barba
                    </button>
                  </Part>
                </div>

                {/* Campo de preenchimento */}
                <Part k="input" active={activeKey === "input"}>
                  <input className="ui-field-input" placeholder="Seu nome e WhatsApp..." readOnly />
                </Part>

                {/* Link */}
                <Part k="link" active={activeKey === "link"} className="!rounded-none">
                  <span className="ui-link inline-flex items-center gap-1 text-xs">
                    <Part k="icon" active={activeKey === "icon"} className="!rounded-md p-0.5">
                      <MapPin className="h-3 w-3 ui-icon-color" />
                    </Part>
                    Ver no mapa
                  </span>
                </Part>

                {/* Botão principal */}
                <Part k="button" active={activeKey === "button"}>
                  <button
                    type="button"
                    className="ui-btn-primary w-full min-h-[48px] px-5 text-sm font-semibold rounded-2xl"
                  >
                    Confirmar agendamento
                  </button>
                </Part>
              </div>
            </div>
          </Part>
        </Part>

        <p className="mt-4 min-h-10 text-center text-xs text-muted-foreground px-2">
          {activeKey ? (
            <>
              <FieldLabel k={activeKey} /> → {PART_DESCRIPTIONS[activeKey]}
            </>
          ) : (
            "Passe o mouse (ou toque) numa cor para ver exatamente o que ela muda na página de agendamento."
          )}
        </p>
      </div>
    </div>
  );
}

export function AppearanceSettings({
  proId,
  initialTheme,
}: {
  proId?: string;
  initialTheme?: ProfessionalTheme | null;
}) {
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [light, setLight] = useState<Appearance>(LIGHT_PRESET);
  const [dark, setDark] = useState<Appearance>(DARK_PRESET);
  const [activeKey, setActiveKey] = useState<keyof Appearance | null>(null);
  const saveTimer = useRef<number | null>(null);

  const colors = mode === "light" ? light : dark;

  // Monta os dois temas (claro/escuro). As cores salvas no banco têm prioridade
  // sobre o localStorage, garantindo que o painel mostre o que o público vê.
  useEffect(() => {
    const current = document.documentElement.classList.contains("dark") ? "dark" : "light";
    setMode(current);
    const l = loadAppearance("light", initialTheme?.light);
    const d = loadAppearance("dark", initialTheme?.dark);
    setLight(l);
    setDark(d);
    saveAppearance("light", l);
    saveAppearance("dark", d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
  }, []);

  function switchMode(next: "light" | "dark") {
    setMode(next);
  }

  function persistToDb(nextLight: Appearance, nextDark: Appearance) {
    if (!proId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const theme: ProfessionalTheme = { light: nextLight, dark: nextDark };
      const { error } = await supabase
        .from(db.profissionais)
        .update({ theme_colors: theme })
        .eq("id", proId);
      if (error) {
        console.error("Falha ao salvar theme_colors:", error);
        toast.error("Não foi possível salvar as cores no servidor.");
      }
    }, 500);
  }

  function commit(next: Appearance, message?: string) {
    const nextLight = mode === "light" ? next : light;
    const nextDark = mode === "dark" ? next : dark;
    (mode === "light" ? setLight : setDark)(next);
    saveAppearance(mode, next);
    notifyChange();
    persistToDb(nextLight, nextDark);
    if (message) toast.success(message);
  }

  function update(key: keyof Appearance, value: string) {
    commit({ ...colors, [key]: value });
  }

  function applyPreset(hex: string) {
    const next: Appearance = { ...colors, primary: hex, accent: hex, button: hex, icon: hex, link: hex, badge: hex };
    commit(next, "Identidade visual atualizada.");
  }

  function reset() {
    const next = mode === "dark" ? DARK_PRESET : LIGHT_PRESET;
    resetAppearance(mode);
    commit(next, "Cores restauradas para o padrão.");
  }

  return (
    <UICard className="p-6 max-w-4xl">
      <UICardHeader
        icon={Palette}
        title="Aparência — Cores do Tema"
        action={
          <UIButton variant="ghost" onClick={reset} icon={RotateCcw} className="!min-h-[40px] !px-3 text-xs">
            Restaurar
          </UIButton>
        }
      />

      <p className="text-sm text-muted-foreground -mt-2 mb-5">
        As cores abaixo são aplicadas em tempo real SOMENTE na sua página pública de agendamento, para o tema
        selecionado. O painel e o resto do sistema não mudam.
      </p>

      <div className="grid grid-cols-2 gap-2 mb-6 max-w-xs">
        {(["light", "dark"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            data-selected={mode === m || undefined}
            className="chip"
          >
            {m === "light" ? "Tema claro" : "Tema escuro"}
          </button>
        ))}
      </div>

      <div className="mb-6">
        <p className="text-sm font-semibold mb-2">Atalhos de identidade</p>
        <div className="flex flex-wrap gap-2">
          {COLOR_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => applyPreset(p.color)}
              className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-semibold hover:bg-[var(--hover-color)] transition-colors min-h-[40px]"
            >
              <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: p.color }} />
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-6">
          <AppearancePreview colors={colors} activeKey={activeKey} />
        </div>

        <div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-sm font-semibold">Cores personalizadas</span>
            <span className="text-xs text-muted-foreground">passe o mouse para localizar no preview</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {APPEARANCE_FIELDS.map((f) => (
              <label
                key={f.key}
                onMouseEnter={() => setActiveKey(f.key)}
                onMouseLeave={() => setActiveKey(null)}
                className="flex items-center gap-3 rounded-xl border border-border p-2.5 hover:bg-[var(--hover-color)] transition-colors"
              >
                <input
                  type="color"
                  value={colors[f.key]}
                  onFocus={() => setActiveKey(f.key)}
                  onBlur={() => setActiveKey(null)}
                  onChange={(e) => update(f.key, e.target.value)}
                  className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0"
                  aria-label={f.label}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{f.label}</span>
                  <span className="block text-xs text-muted-foreground truncate">{f.hint}</span>
                </span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground uppercase">{colors[f.key]}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </UICard>
  );
}
