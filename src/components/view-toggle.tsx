import { LayoutGrid, List } from "lucide-react";

export type ViewMode = "grid" | "list";

export function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-background overflow-hidden">
      <button
        type="button"
        onClick={() => onChange("list")}
        data-selected={value === "list" || undefined}
        className="px-3 py-2 text-sm inline-flex items-center gap-1 text-muted-foreground data-[selected]:bg-secondary data-[selected]:text-foreground"
        title="Lista"
      >
        <List className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange("grid")}
        data-selected={value === "grid" || undefined}
        className="px-3 py-2 text-sm inline-flex items-center gap-1 text-muted-foreground data-[selected]:bg-secondary data-[selected]:text-foreground border-l border-border"
        title="Grade"
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
    </div>
  );
}
