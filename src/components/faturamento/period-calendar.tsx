import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { WEEKDAYS_PT_SHORT, weekdayInTimeZone } from "@/lib/booking";
import {
  dateKeyOf,
  localDate,
  monthStartKey,
  pad,
  shiftKey,
  shortDate,
} from "@/lib/faturamento-dates";
import { cn } from "@/lib/utils";

/**
 * Grid de datas idêntico ao usado no agendamento público (/p/:slug), adaptado
 * para seleção de intervalo. Sem biblioteca de calendário: carrega rápido no
 * mobile e respeita o fuso horário do estabelecimento.
 */
export function PeriodCalendar({
  from,
  to,
  todayKey,
  timeZone,
  onChange,
}: {
  from: string;
  to: string;
  todayKey: string;
  timeZone: string | null;
  onChange: (from: string, to: string) => void;
}) {
  const [monthStart, setMonthStart] = useState(() => {
    const date = localDate(todayKey);
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date;
  });

  useEffect(() => {
    if (!from) return;
    const date = localDate(from);
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    setMonthStart(date);
  }, [from]);

  const currentMonth = todayKey.slice(0, 7);
  const monthKey = `${monthStart.getFullYear()}-${pad(monthStart.getMonth() + 1)}`;
  const canGoNext = monthKey < currentMonth;

  const daysGrid = useMemo(() => {
    const first = new Date(monthStart);
    const startWeekday = weekdayInTimeZone(first, timeZone);
    const cells: Array<Date | null> = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    const end = new Date(monthStart);
    end.setMonth(end.getMonth() + 1);
    for (let day = new Date(first); day < end; day.setDate(day.getDate() + 1)) {
      cells.push(new Date(day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [monthStart, timeZone]);

  function pick(key: string) {
    if (!from || to || key < from) {
      onChange(key, "");
      return;
    }
    onChange(from, key);
  }

  function goMonth(delta: number) {
    const date = new Date(monthStart);
    date.setMonth(date.getMonth() + delta);
    const target = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
    if (target <= currentMonth) setMonthStart(date);
  }

  const presets = [
    { label: "Hoje", from: todayKey, to: todayKey },
    { label: "7 dias", from: shiftKey(todayKey, -6), to: todayKey },
    { label: "30 dias", from: shiftKey(todayKey, -29), to: todayKey },
    { label: "Este mês", from: monthStartKey(todayKey), to: todayKey },
    {
      label: "Mês passado",
      from: monthStartKey(todayKey, -1),
      to: shiftKey(monthStartKey(todayKey), -1),
    },
  ];

  return (
    <div className="rounded-xl border border-border bg-background/60 p-3">
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            De
          </p>
          <p className="text-sm font-bold tabular-nums text-foreground">
            {from ? shortDate(from) : "—"}
          </p>
        </div>
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Até
          </p>
          <p
            className={cn(
              "text-sm font-bold tabular-nums",
              to ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {to ? shortDate(to) : "Toque na data final"}
          </p>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          aria-label="Mês anterior"
          className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-border transition-colors hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-bold capitalize text-foreground">
          {monthStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
        </span>
        <button
          type="button"
          onClick={() => goMonth(1)}
          disabled={!canGoNext}
          aria-label="Próximo mês"
          className="grid min-h-[44px] min-w-[44px] place-items-center rounded-lg border border-border transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1" aria-hidden>
        {WEEKDAYS_PT_SHORT.map((label) => (
          <span key={label} className="text-center text-[11px] font-semibold text-muted-foreground">
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {daysGrid.map((day, index) => {
          if (!day) return <div key={index} />;
          const key = dateKeyOf(day);
          const isToday = key === todayKey;
          const isStart = from === key;
          const isEnd = !!to && to === key;
          const inRange = !!from && !!to && key > from && key < to;
          return (
            <button
              key={index}
              type="button"
              disabled={key > todayKey}
              onClick={() => pick(key)}
              aria-label={`${shortDate(key)}${isToday ? " — hoje" : ""}`}
              data-selected={isStart || isEnd || undefined}
              data-today={isToday || undefined}
              className={cn(
                "h-11 w-full rounded-lg text-sm font-medium transition-colors",
                "hover:bg-accent/10 hover:text-accent",
                "disabled:cursor-not-allowed disabled:opacity-30",
                inRange && "!bg-accent/15 !text-accent",
                (isStart || isEnd) && "!bg-accent !text-accent-foreground",
                isToday && "ring-1 ring-accent/40",
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange(preset.from, preset.to)}
            data-selected={from === preset.from && to === preset.to}
            className="min-h-[44px] rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted data-[selected=true]:border-accent data-[selected=true]:bg-accent/10 data-[selected=true]:text-accent"
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange("", "")}
          className="min-h-[44px] rounded-lg px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          Limpar
        </button>
      </div>
      {from && !to && (
        <p className="mt-2 text-xs font-semibold text-accent">
          Agora toque na data final do intervalo.
        </p>
      )}
    </div>
  );
}
