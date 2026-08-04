import { useEffect } from "react";
import { applyAppearance, loadAppearance } from "@/lib/appearance";

/**
 * Aplica as cores configuradas na Dashboard como variáveis CSS globais.
 * Reage à troca de tema (claro/escuro) observando a classe do <html>.
 */
export function AppearanceProvider() {
  useEffect(() => {
    const sync = () => {
      const mode = document.documentElement.classList.contains("dark") ? "dark" : "light";
      applyAppearance(loadAppearance(mode));
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
  }, []);

  return null;
}
