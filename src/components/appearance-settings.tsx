import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Palette, RotateCcw, CheckCircle2, MapPin, Check } from "lucide-react";
import {
  COLOR_PRESETS,
  DARK_PRESET,
  LIGHT_PRESET,
  appearanceCssVars,
  foregroundFor,
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

/** Campos que uma cor predefinida altera na página de agendamento. */
const PRESET_KEYS = ["accent", "button", "icon", "link", "badge"] as const;

function AppearancePreview({ colors }: { colors: Appearance }) {
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-sm font-semibold">Pré-visualização</span>
        <span className="text-xs text-muted-foreground">como fica na página de agendamento</span>
      </div>

      <div className="w-full max-w-xs">
        <div
          className="rounded-[28px] p-3"
          style={{ ...appearanceCssVars(colors), background: "var(--background)" }}
        >
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-2xl">
            {/* Cabeçalho */}
            <div
              className="px-4 pt-4 pb-2 rounded-t-3xl"
              style={{
                backgroundColor: "color-mix(in oklab, var(--header-color) 55%, transparent)",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="h-12 w-12 rounded-2xl grid place-items-center text-lg font-bold text-brand-foreground shadow-md"
                  style={{ backgroundColor: "var(--brand)" }}
                >
                  B
                </div>
                <div className="min-w-0 pt-1.5 pb-2">
                  <div className="h-3.5 w-32 rounded bg-foreground/15"></div>
                  <div className="h-2 w-24 rounded bg-muted-foreground/30 mt-1.5"></div>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-4">
              {/* Aviso */}
              <div className="ui-notice">
                <CheckCircle2 className="h-5 w-5 shrink-0 ui-accent-text mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-sm">Confirmação automática</p>
                  <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
                    Aviso do estabelecimento
                  </p>
                </div>
              </div>

              {/* Cartão com preço + profissional */}
              <div
                className="rounded-2xl border border-[var(--border)] p-3"
                style={{ background: "var(--card)" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="h-2.5 w-24 rounded bg-muted-foreground/30"></div>
                  <div className="text-base font-black" style={{ color: "var(--brand)" }}>
                    R$ 59,90
                  </div>
                </div>
                <div className="my-3 border-t border-[var(--border)]"></div>
                <div className="flex items-center gap-2">
                  <div
                    className="h-7 w-7 rounded-full grid place-items-center text-[10px] font-bold text-secondary-foreground"
                    style={{ backgroundColor: "var(--secondary)" }}
                  >
                    J
                  </div>
                  <div className="h-2 w-20 rounded bg-muted-foreground/30"></div>
                  <span className="ui-badge ml-auto">Popular</span>
                </div>
              </div>

              {/* Chips */}
              <div className="flex flex-wrap gap-1.5">
                <button type="button" data-selected="true" className="chip">
                  Corte
                </button>
                <button
                  type="button"
                  className="chip"
                  style={{
                    backgroundColor: "var(--hover-color)",
                    color: "var(--foreground)",
                    filter: "brightness(1.03)",
                  }}
                >
                  Barba
                </button>
              </div>

              {/* Campo de preenchimento */}
              <input className="ui-field-input" placeholder="Seu nome e WhatsApp..." readOnly />

              {/* Link */}
              <span className="ui-link inline-flex items-center gap-1 text-xs">
                <MapPin className="h-3 w-3 ui-icon-color" /> Ver no mapa
              </span>

              {/* Botão principal */}
              <button
                type="button"
                className="ui-btn-primary w-full min-h-[48px] px-5 text-sm font-semibold rounded-2xl"
              >
                Confirmar agendamento
              </button>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground px-2">
          A cor da marca aparece em botões, preços, ícones, links e seleções da página pública.
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

  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    },
    [],
  );

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

  function applyPreset(hex: string) {
    // A cor da marca vale para os DOIS temas (claro e escuro). Assim, trocar o
    // tema na página pública mantém a cor escolhida — antes ela só era gravada
    // no modo ativo e o outro voltava ao padrão.
    const branded: Partial<Appearance> = {
      primary: hex,
      accent: hex,
      button: hex,
      icon: hex,
      link: hex,
      badge: hex,
    };
    const lightNext: Appearance = { ...light, ...branded };
    const darkNext: Appearance = { ...dark, ...branded };
    setLight(lightNext);
    setDark(darkNext);
    saveAppearance("light", lightNext);
    saveAppearance("dark", darkNext);
    notifyChange();
    persistToDb(lightNext, darkNext);
    toast.success("Identidade visual atualizada.");
  }

  function reset() {
    resetAppearance("light");
    resetAppearance("dark");
    setLight(LIGHT_PRESET);
    setDark(DARK_PRESET);
    notifyChange();
    persistToDb(LIGHT_PRESET, DARK_PRESET);
    toast.success("Cores restauradas para o padrão.");
  }

  const activePreset = COLOR_PRESETS.find((p) => PRESET_KEYS.every((k) => colors[k] === p.color));

  return (
    <UICard className="p-6 max-w-4xl">
      <UICardHeader
        icon={Palette}
        title="Aparência — Cor da Marca"
        action={
          <UIButton
            variant="ghost"
            onClick={reset}
            icon={RotateCcw}
            className="!min-h-[40px] !px-3 text-xs"
          >
            Restaurar
          </UIButton>
        }
      />

      <p className="text-sm text-muted-foreground -mt-2 mb-5">
        Escolha a cor da sua marca. Ela é aplicada em tempo real na sua página pública de
        agendamento, para o tema selecionado. O painel e o resto do sistema não mudam.
      </p>

      <div className="grid grid-cols-2 gap-2 mb-6 max-w-xs">
        {(["light", "dark"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            data-selected={mode === m || undefined}
            className="chip"
          >
            {m === "light" ? "Tema claro" : "Tema escuro"}
          </button>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <div className="lg:sticky lg:top-6">
          <AppearancePreview colors={colors} />
        </div>

        <div>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-sm font-semibold">Cores predefinidas</span>
            <span className="text-xs text-muted-foreground">
              escolha uma e ela é aplicada na hora
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {COLOR_PRESETS.map((p) => {
              const selected = activePreset?.name === p.name;
              return (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => applyPreset(p.color)}
                  data-selected={selected || undefined}
                  className="flex items-center gap-3 rounded-xl border border-border p-2.5 min-h-[56px] hover:bg-[var(--hover-color)] transition-colors data-[selected]:border-accent data-[selected]:ring-2 data-[selected]:ring-accent/30"
                >
                  <span
                    className="h-9 w-9 shrink-0 rounded-lg border border-border grid place-items-center"
                    style={{ backgroundColor: p.color }}
                  >
                    {selected && (
                      <Check className="h-4 w-4" style={{ color: foregroundFor(p.color) }} />
                    )}
                  </span>
                  <span className="text-sm font-medium">{p.name}</span>
                  {selected && <Check className="ml-auto h-4 w-4 ui-accent-text" />}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            A cor escolhida é salva no servidor e vale para todos os visitantes da sua página de
            agendamento.
          </p>
        </div>
      </div>
    </UICard>
  );
}
