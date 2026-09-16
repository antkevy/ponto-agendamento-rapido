import { CalendarRange, LayoutGrid, List } from "lucide-react";

export type ViewMode = "grid" | "list" | "calendar";

const ALL_VIEWS: ViewMode[] = ["list", "grid", "calendar"];

export function ViewToggle({
  value,
  onChange,
  availableViews = ALL_VIEWS,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  availableViews?: ViewMode[];
}) {
  const allButtons: { mode: ViewMode; icon: React.ReactNode; label: string }[] = [
    { mode: "list", icon: <List className="h-4 w-4" />, label: "Lista" },
    { mode: "grid", icon: <LayoutGrid className="h-4 w-4" />, label: "Grade" },
    { mode: "calendar", icon: <CalendarRange className="h-4 w-4" />, label: "Semana" },
  ];
  const buttons = allButtons.filter((b) => availableViews.includes(b.mode));

  if (value === "calendar" && !availableViews.includes("calendar")) {
    onChange("list");
  }

  return (
    <div className="inline-flex rounded-lg border border-border bg-background overflow-hidden">
      {buttons.map((b, i) => (
        <button
          key={b.mode}
          type="button"
          onClick={() => onChange(b.mode)}
          data-selected={value === b.mode || undefined}
          className={`px-3 py-2 text-sm inline-flex items-center gap-1 text-muted-foreground data-[selected]:bg-secondary data-[selected]:text-foreground${i > 0 ? " border-l border-border" : ""}`}
          title={b.label}
        >
          {b.icon}
        </button>
      ))}
    </div>
  );
}
