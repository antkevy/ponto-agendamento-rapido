import { useEffect } from "react";
import { CalendarRange, LayoutGrid, List } from "lucide-react";
import { CATALOG_VIEWS, type ViewMode } from "@/lib/view-modes";

const ALL_BUTTONS: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
  { mode: "list", icon: <List className="h-4 w-4" />, label: "Lista" },
  { mode: "grid", icon: <LayoutGrid className="h-4 w-4" />, label: "Grade" },
  { mode: "calendar", icon: <CalendarRange className="h-4 w-4" />, label: "Semana" },
];

export function ViewToggle({
  value,
  onChange,
  availableViews = CATALOG_VIEWS,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  availableViews?: ViewMode[];
}) {
  const fallback = availableViews[0] ?? "list";

  useEffect(() => {
    if (availableViews.length > 0 && !availableViews.includes(value)) {
      onChange(fallback);
    }
  }, [value, availableViews, onChange, fallback]);

  const buttons = ALL_BUTTONS.filter((b) => availableViews.includes(b.mode));
  const active = availableViews.includes(value) ? value : fallback;

  return (
    <div className="inline-flex rounded-lg border border-border bg-background overflow-hidden">
      {buttons.map((b, i) => (
        <button
          key={b.mode}
          type="button"
          onClick={() => onChange(b.mode)}
          aria-label={`Visualizar em ${b.label}`}
          aria-pressed={active === b.mode}
          data-selected={active === b.mode || undefined}
          className={`min-h-[44px] min-w-[44px] px-3 text-sm inline-flex items-center justify-center gap-1 text-muted-foreground data-[selected]:bg-secondary data-[selected]:text-foreground${i > 0 ? " border-l border-border" : ""}`}
        >
          {b.icon}
        </button>
      ))}
    </div>
  );
}
