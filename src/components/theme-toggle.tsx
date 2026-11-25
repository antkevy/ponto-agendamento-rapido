import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggle, useSystem, isAuto } = useTheme();
  const base =
    "p-2 min-h-[44px] min-w-[44px] grid place-items-center rounded-full border border-border bg-card text-foreground hover:bg-muted transition-colors";

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
        title={theme === "dark" ? "Tema claro" : "Tema escuro"}
        className={base}
      >
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      {!isAuto && (
        <button
          type="button"
          onClick={useSystem}
          aria-label="Seguir tema do dispositivo"
          title="Seguir tema do dispositivo"
          className={base}
        >
          <Monitor className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
