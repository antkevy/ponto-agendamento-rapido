import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type StatTone = "brand" | "accent" | "success" | "warning" | "destructive";

const TONE_VAR: Record<StatTone, string> = {
  brand: "var(--brand)",
  accent: "var(--accent)",
  success: "var(--success)",
  warning: "var(--warning)",
  destructive: "var(--destructive)",
};

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "accent",
  trend,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
  trend?: number | null;
  className?: string;
}) {
  const color = TONE_VAR[tone];
  const trendUp = (trend ?? 0) >= 0;
  return (
    <div className={cn("card-elevated p-5 animate-fade-in-up", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          <p className="mt-2 text-3xl font-black tracking-tight text-foreground truncate">
            {value}
          </p>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
        <span
          className="h-11 w-11 shrink-0 grid place-items-center rounded-2xl border"
          style={{
            backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)`,
            color,
            borderColor: `color-mix(in oklab, ${color} 28%, transparent)`,
          }}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {typeof trend === "number" && trend !== 0 && (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 mt-3 text-xs font-semibold",
            trendUp ? "text-success" : "text-destructive",
          )}
        >
          {trendUp ? (
            <ArrowUpRight className="h-3.5 w-3.5" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5" />
          )}
          {Math.abs(trend).toFixed(1)}%
          <span className="text-muted-foreground font-normal">vs mês anterior</span>
        </span>
      )}
    </div>
  );
}
