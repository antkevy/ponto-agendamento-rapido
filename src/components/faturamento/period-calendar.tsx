import { useEffect, useMemo, useState } from "react";
import { ptBR } from "date-fns/locale";
import { type DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { dateKeyOf, localDate, monthStartKey, shiftKey, shortDate } from "@/lib/faturamento-dates";

/**
 * Mini calendário de intervalo carregado sob demanda (somente quando o
 * usuário escolhe "Período"). Mantém a rota de faturamento leve no mobile.
 */
export function PeriodCalendar({
  from,
  to,
  todayKey,
  onChange,
}: {
  from: string;
  to: string;
  todayKey: string;
  onChange: (from: string, to: string) => void;
}) {
  const [month, setMonth] = useState(() => localDate(from || todayKey));

  useEffect(() => {
    if (from) setMonth(localDate(from));
  }, [from]);

  const selected = useMemo<DateRange | undefined>(() => {
    if (!from) return undefined;
    const first = localDate(from);
    const last = to ? localDate(to) : undefined;
    return { from: first, to: last && last >= first ? last : undefined };
  }, [from, to]);

  function apply(range: DateRange | undefined) {
    if (!range?.from) {
      onChange("", "");
      return;
    }
    const first = dateKeyOf(range.from);
    const last = range.to ? dateKeyOf(range.to) : "";
    onChange(first, last && last >= first ? last : "");
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
            className={`text-sm font-bold tabular-nums ${to ? "text-foreground" : "text-muted-foreground"}`}
          >
            {to ? shortDate(to) : "Toque na data final"}
          </p>
        </div>
      </div>

      <Calendar
        mode="range"
        selected={selected}
        onSelect={apply}
        month={month}
        onMonthChange={setMonth}
        locale={ptBR}
        weekStartsOn={1}
        showOutsideDays={false}
        disabled={{ after: localDate(todayKey) }}
        numberOfMonths={1}
        className="w-full p-0 [--cell-size:2.75rem] sm:[--cell-size:2.5rem]"
        classNames={{
          root: "w-full",
          months: "w-full",
          month: "flex w-full flex-col gap-2",
          nav: "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          button_previous: "h-10 w-10 p-0",
          button_next: "h-10 w-10 p-0",
          month_caption: "flex h-10 w-full items-center justify-center px-10",
          weekday: "flex h-10 flex-1 items-center justify-center text-xs font-semibold",
          week: "mt-0 flex w-full",
          day: "relative h-11 w-full p-0",
        }}
      />

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
