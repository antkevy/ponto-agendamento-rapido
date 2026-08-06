import { useEffect, useState, type RefObject } from "react";
import {
  applyAppearance,
  DARK_PRESET,
  LIGHT_PRESET,
  loadAppearance,
  type Appearance,
  type ProfessionalTheme,
} from "@/lib/appearance";

/**
 * Cor efetiva de marca da página de agendamento.
 * - Se há cores personalizadas (banco ou localStorage), usa a Cor Primária.
 * - Caso contrário, usa o brand_color salvo no banco (o que os visitantes veem).
 */
function effectiveBrand(brandColor: string | null | undefined, a?: Appearance): string {
  const mode =
    typeof document === "undefined"
      ? "light"
      : document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";
  const appearance = a ?? loadAppearance(mode);
  const preset = mode === "dark" ? DARK_PRESET : LIGHT_PRESET;
  const customizedPrimary = appearance.primary !== preset.primary;
  return customizedPrimary ? appearance.primary : brandColor || "#0284C7";
}

/**
 * Aplica as cores configuradas na Dashboard SOMENTE no elemento raiz da
 * página pública de agendamento (/p/:slug). Nada disso toca o <html>, então
 * o painel e as demais páginas continuam com as cores padrão.
 *
 * As variáveis vivem apenas no elemento raiz: quando a página desmonta, elas
 * desaparecem junto. Reage à troca de tema (claro/escuro) e a mudanças nas
 * cores (mesma aba via evento, outras abas via evento storage).
 *
 * @param savedTheme cores salvas no banco (profissionais.theme_colors); têm
 *   prioridade sobre o localStorage do dono para que visitantes vejam o mesmo.
 */
export function useBookingTheme(
  rootRef: RefObject<HTMLElement | null>,
  brandColor: string | null | undefined,
  savedTheme?: ProfessionalTheme | null,
): string {
  const [brand, setBrand] = useState<string>(() => brandColor || "#0284C7");

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const sync = () => {
      const mode = document.documentElement.classList.contains("dark") ? "dark" : "light";
      const a = loadAppearance(mode, savedTheme?.[mode]);
      applyAppearance(a, el);
      const b = effectiveBrand(brandColor, a);
      el.style.setProperty("--brand", b);
      setBrand(b);
    };

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("storage", sync);
    window.addEventListener("agendai-appearance-change", sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", sync);
      window.removeEventListener("agendai-appearance-change", sync);
    };
  }, [rootRef, brandColor, savedTheme]);

  return brand;
}
