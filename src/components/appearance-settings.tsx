import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Palette, RotateCcw } from "lucide-react";
import {
  APPEARANCE_FIELDS,
  COLOR_PRESETS,
  DARK_PRESET,
  LIGHT_PRESET,
  loadAppearance,
  resetAppearance,
  saveAppearance,
  type Appearance,
} from "@/lib/appearance";
import { UIButton, UICard, UICardHeader } from "@/components/ui-kit";

function notifyChange() {
  window.dispatchEvent(new Event("agendai-appearance-change"));
}

export function AppearanceSettings() {
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [colors, setColors] = useState<Appearance>(LIGHT_PRESET);

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
        Todas as cores abaixo são aplicadas em tempo real em todo o sistema (painel, página pública e login),
        para o tema selecionado.
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

      <div className="grid gap-3 sm:grid-cols-2">
        {APPEARANCE_FIELDS.map((f) => (
          <label
            key={f.key}
            className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-[var(--hover-color)] transition-colors"
          >
            <input
              type="color"
              value={colors[f.key]}
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
