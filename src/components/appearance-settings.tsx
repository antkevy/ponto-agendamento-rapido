import { useEffect, useState, type ReactNode } from "react";
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
} from "@/lib/appearance";
import { UIButton, UICard, UICardHeader } from "@/components/ui-kit";

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
  children,
}: {
  k: keyof Appearance;
  active: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-preview-key={k}
      className={`relative transition-shadow ${
        active ? "ring-2 ring-[var(--ring)] ring-offset-2 ring-offset-[var(--background)] rounded-lg z-10" : ""
      } ${className}`}
    >
      {active && (
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
    <div className="mb-8">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-sm font-semibold">Pré-visualização</span>
        <span className="text-xs text-muted-foreground">como fica na página de agendamento</span>
      </div>

      <div className="mx-auto w-full max-w-xs">
        <div
          className="rounded-3xl border border-[var(--border)] shadow-2xl"
          style={{ ...appearanceCssVars(colors), background: "var(--background)" }}
        >
          {/* Cabeçalho */}
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
                <div className="h-3.5 w-32 rounded bg-foreground/15"></div>
                <div className="mt-1.5 h-2 w-24 rounded bg-muted-foreground/30"></div>
              </div>
            </div>
          </div>

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
                <MapPin className="h-3 w-3 ui-icon-color" /> Ver no mapa
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

export function AppearanceSettings() {
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [colors, setColors] = useState<Appearance>(LIGHT_PRESET);
  const [activeKey, setActiveKey] = useState<keyof Appearance | null>(null);

  useEffect(() => {
    const current = document.documentElement.classList.contains("dark") ? "dark" : "light";
    setMode(current);
    setColors(loadAppearance(current));
  }, []);

  function switchMode(next: "light" | "dark") {
    setMode(next);
    setColors(loadAppearance(next));
  }

  function update(key: keyof Appearance, value: string) {
    const next = { ...colors, [key]: value };
    setColors(next);
    saveAppearance(mode, next);
    notifyChange();
  }

  function applyPreset(hex: string) {
    const next: Appearance = { ...colors, primary: hex, accent: hex, button: hex, icon: hex, link: hex, badge: hex };
    setColors(next);
    saveAppearance(mode, next);
    notifyChange();
    toast.success("Identidade visual atualizada.");
  }

  function reset() {
    resetAppearance(mode);
    setColors(mode === "dark" ? DARK_PRESET : LIGHT_PRESET);
    notifyChange();
    toast.success("Cores restauradas para o padrão.");
  }

  return (
    <UICard className="p-6 max-w-2xl">
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

      <AppearancePreview colors={colors} activeKey={activeKey} />

      <div className="grid gap-3 sm:grid-cols-2">
        {APPEARANCE_FIELDS.map((f) => (
          <label
            key={f.key}
            onMouseEnter={() => setActiveKey(f.key)}
            onMouseLeave={() => setActiveKey(null)}
            className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-[var(--hover-color)] transition-colors"
          >
            <input
              type="color"
              value={colors[f.key]}
              onFocus={() => setActiveKey(f.key)}
              onBlur={() => setActiveKey(null)}
              onChange={(e) => update(f.key, e.target.value)}
              className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-border bg-transparent p-0"
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
    </UICard>
  );
}
