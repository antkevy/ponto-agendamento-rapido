import { useLayoutEffect, useState, type RefObject } from "react";
import {
  applyAppearance,
  DARK_PRESET,
  LIGHT_PRESET,
  loadAppearance,
  type ProfessionalTheme,
} from "@/lib/appearance";

/**
 * Aplica as cores configuradas na Dashboard SOMENTE no elemento raiz da
 * página pública de agendamento (/p/:slug). Nada disso toca o <html>, então
 * o painel e as demais páginas continuam com as cores padrão.
 *
 * A cor retornada é sempre a primária efetiva do tema aplicado — a mesma
 * usada em `--brand`. Assim, avatar/placeholder, botões e ícones nunca
 * divergem (antes, um fallback para `brand_color` podia deixar o placeholder
 * vermelho enquanto o resto da página estava amarelo).
 *
 * @param savedTheme cores salvas no banco (profissionais.theme_colors); têm
 *   prioridade sobre o localStorage do dono para que visitantes vejam o mesmo.
 * @param applyCustom quando false, ignora a aparência personalizada e mantém
 *   o tema padrão. Usado em "Meus agendamentos" acessado fora da página pública.
 */
export function useBookingTheme(
  rootRef: RefObject<HTMLElement | null>,
  savedTheme?: ProfessionalTheme | null,
  applyCustom = true,
): string {
  const [brand, setBrand] = useState<string>(() => {
    const mode =
      typeof document !== "undefined" && document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";
    return (mode === "dark" ? DARK_PRESET : LIGHT_PRESET).primary;
  });

  // useLayoutEffect (e não useEffect) para aplicar as cores ANTES do browser
  // pintar — sem isso, a página pública pisca o tema padrão no primeiro frame.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const sync = () => {
      const mode = document.documentElement.classList.contains("dark") ? "dark" : "light";
      const appearance = applyCustom
        ? loadAppearance(mode, savedTheme?.[mode])
        : mode === "dark"
          ? DARK_PRESET
          : LIGHT_PRESET;

      applyAppearance(appearance, el);
      el.style.setProperty("--brand", appearance.primary);
      setBrand(appearance.primary);
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
  }, [rootRef, savedTheme, applyCustom]);

  return brand;
}
