import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/db-tables";
import {
  formatTime,
  hourInTimeZone,
  minuteInTimeZone,
  weekdayInTimeZone,
  zonedDateKey,
  zonedDayBounds,
  zonedTodayKey,
  WEEKDAYS_PT_SHORT,
} from "@/lib/booking";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import type { Appt, StatusFilter } from "./types";
import { ROW_BORDER } from "./types";

const CAL_HOUR_PX = 56;
const CAL_MIN_HOUR = 6;
const CAL_MAX_HOUR = 22;

export function calStartOfWeek(d: Date): Date {
  const s = new Date(d);
  const day = (s.getDay() + 6) % 7;
  s.setDate(s.getDate() - day);
  s.setHours(0, 0, 0, 0);
  return s;
}

type LayeredEvent = { a: Appt; lane: number; lanes: number };

export function layEvents(events: Appt[]): LayeredEvent[] {
  const sorted = [...events].sort(
    (x, y) => new Date(x.starts_at).getTime() - new Date(y.starts_at).getTime(),
  );
  const out: LayeredEvent[] = [];
  let cluster: { ev: Appt; end: number }[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  // Um "cluster" é um grupo de eventos conectados por sobreposição. Só depois
  // de fechá-lo sabemos quantas lanes existem; usar lanes.length durante a
  // inserção fazia eventos antigos ficarem mais largos do que os posteriores.
  const flush = () => {
    if (cluster.length === 0) return;
    const lanes: Appt[][] = [];
    const placed: { ev: Appt; lane: number }[] = [];
    for (const { ev } of cluster) {
      const start = new Date(ev.starts_at).getTime();
      let lane = lanes.findIndex((items) =>
        items.every((o) => start >= new Date(o.ends_at).getTime()),
      );
      if (lane === -1) {
        lanes.push([]);
        lane = lanes.length - 1;
      }
      lanes[lane].push(ev);
      placed.push({ ev, lane });
    }
    for (const item of placed) out.push({ a: item.ev, lane: item.lane, lanes: lanes.length });
    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };

  for (const ev of sorted) {
    const start = new Date(ev.starts_at).getTime();
    const end = new Date(ev.ends_at).getTime();
    if (cluster.length > 0 && start >= clusterEnd) flush();
    cluster.push({ ev, end });
    clusterEnd = Math.max(clusterEnd, end);
  }
  flush();
  return out;
}

export function WeekCalendar({
  proId,
  status,
  search,
  timeZone,
  onSelect,
}: {
  proId: string;
  status: StatusFilter;
  search: string;
  timeZone?: string | null;
  onSelect: (a: Appt) => void;
}) {
  const [weekStart, setWeekStart] = useState(() => calStartOfWeek(new Date()));

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekStart]);

  const { data, isError } = useQuery({
    queryKey: ["appt-calendar-week", proId, weekStart.toISOString(), timeZone],
    queryFn: async () => {
      const { start: from } = zonedDayBounds(
        weekStart.getFullYear(),
        weekStart.getMonth() + 1,
        weekStart.getDate(),
        timeZone,
      );
      const lastDay = new Date(weekStart);
      lastDay.setDate(lastDay.getDate() + 6);
      const { end: until } = zonedDayBounds(
        lastDay.getFullYear(),
        lastDay.getMonth() + 1,
        lastDay.getDate(),
        timeZone,
      );
      const { data, error } = await supabase
        .from(db.agendamentos)
        .select(
          "id, starts_at, ends_at, client_name, client_phone, client_email, service_snapshot_name, service_snapshot_price_cents, status, notes",
        )
        .eq("professional_id", proId)
        .gte("starts_at", from.toISOString())
        .lt("starts_at", until.toISOString())
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data as Appt[];
    },
  });

  const events = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(
      (a) =>
        (status === "all" || a.status === status) &&
        (!q ||
          a.client_name.toLowerCase().includes(q) ||
          a.service_snapshot_name.toLowerCase().includes(q) ||
          (a.client_phone ?? "").includes(q) ||
          (a.client_email ?? "").toLowerCase().includes(q)),
    );
  }, [data, status, search]);

  const { hours, fullPx } = useMemo(() => {
    let min = CAL_MIN_HOUR;
    let max = CAL_MAX_HOUR;
    if (events.length > 0) {
      for (const a of events) {
        const st = new Date(a.starts_at);
        const ed = new Date(a.ends_at);
        const sh = hourInTimeZone(st, timeZone);
        const eh =
          minuteInTimeZone(ed, timeZone) > 0 || ed.getSeconds() > 0
            ? hourInTimeZone(ed, timeZone) + 1
            : hourInTimeZone(ed, timeZone);
        if (sh < min) min = sh;
        if (eh > max) max = eh;
      }
      min = Math.max(CAL_MIN_HOUR, min - 1);
      max = Math.min(CAL_MAX_HOUR + 1, max + 1);
    }
    const arr: number[] = [];
    for (let h = min; h < max; h++) arr.push(h);
    return { hours: arr, fullPx: arr.length * CAL_HOUR_PX };
  }, [events, timeZone]);

  const todayKey = useMemo(() => zonedTodayKey(timeZone), [timeZone]);

  const weekRangeStr = useMemo(() => {
    const a = weekDays[0];
    const b = weekDays[6];
    const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    return sameMonth
      ? `${a.getDate()} – ${b.getDate()} de ${a.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`
      : `${a.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${b.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;
  }, [weekDays]);

  const navBtn =
    "min-h-[44px] min-w-[44px] grid place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors";

  return (
    <div className="card-elevated p-3 sm:p-4 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={navBtn}
            onClick={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() - 7);
              setWeekStart(d);
            }}
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(calStartOfWeek(new Date()))}
            className="btn-outline-brand inline-flex items-center !py-2 text-sm"
          >
            Hoje
          </button>
          <button
            type="button"
            className={navBtn}
            onClick={() => {
              const d = new Date(weekStart);
              d.setDate(d.getDate() + 7);
              setWeekStart(d);
            }}
            aria-label="Próxima semana"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm font-bold text-foreground capitalize truncate">{weekRangeStr}</p>
      </div>

      {isError ? (
        <div role="alert" className="py-10 text-center text-sm text-destructive">
          Não foi possível carregar a semana. Tente novamente.
        </div>
      ) : events.length === 0 ? (
        <div className="py-10 text-center">
          <CalendarRange className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm font-semibold text-foreground">Nenhum agendamento nesta semana</p>
          <p className="text-xs text-muted-foreground mt-1">
            {search || status !== "all"
              ? "Ajuste os filtros para ver os horários."
              : "Use \u201cNovo agendamento\u201d para marcar um horário."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto scrollbar-slim">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))]">
              <div className="h-10" />
              {weekDays.map((d) => {
                const isToday = zonedDateKey(d, timeZone) === todayKey;
                return (
                  <div
                    key={d.toISOString()}
                    className={cn(
                      "flex flex-col items-center justify-center gap-0.5 border-l border-border text-center",
                      isToday && "bg-accent/[0.06]",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-wide",
                        isToday ? "text-accent" : "text-muted-foreground",
                      )}
                    >
                      {WEEKDAYS_PT_SHORT[weekdayInTimeZone(d, timeZone)]}
                    </span>
                    <span
                      className={cn(
                        "grid h-7 w-7 place-items-center rounded-full text-sm font-bold",
                        isToday && "bg-accent text-accent-foreground shadow-sm",
                      )}
                    >
                      {d.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>
            <div
              className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-t border-border"
              style={{ height: fullPx }}
            >
              <div className="relative border-r border-border">
                {hours.map((h) => (
                  <span
                    key={h}
                    className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                    style={{ top: (h - hours[0]) * CAL_HOUR_PX }}
                  >
                    {String(h).padStart(2, "0")}:00
                  </span>
                ))}
              </div>
              {weekDays.map((d) => {
                const dayKey = zonedDateKey(d, timeZone);
                const dayEvents = layEvents(
                  events.filter((a) => zonedDateKey(new Date(a.starts_at), timeZone) === dayKey),
                );
                const isToday = dayKey === todayKey;
                return (
                  <div
                    key={d.toISOString()}
                    className={cn("relative border-l border-border", isToday && "bg-accent/[0.04]")}
                  >
                    {hours.map((h) => (
                      <span
                        key={h}
                        aria-hidden="true"
                        className="absolute inset-x-0 border-t border-border/40"
                        style={{ top: (h - hours[0]) * CAL_HOUR_PX }}
                      />
                    ))}
                    {dayEvents.map(({ a, lane, lanes }) => {
                      const start = new Date(a.starts_at);
                      const end = new Date(a.ends_at);
                      const startMin =
                        hourInTimeZone(start, timeZone) * 60 + minuteInTimeZone(start, timeZone);
                      const dayStartMin = hours[0] * 60;
                      const durationMin = Math.max(
                        15,
                        Math.round((end.getTime() - start.getTime()) / 60000),
                      );
                      const topPx = ((startMin - dayStartMin) / 60) * CAL_HOUR_PX;
                      const heightPx = Math.max((durationMin / 60) * CAL_HOUR_PX, 28);
                      const color = ROW_BORDER[a.status];
                      const laneW = 100 / lanes;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => onSelect(a)}
                          aria-label={`${a.client_name} · ${a.service_snapshot_name} · ${formatTime(start, timeZone)} · ${a.status}`}
                          className={cn(
                            "absolute z-10 overflow-hidden rounded-md border-l-[3px] bg-card text-left shadow-sm transition-transform hover:z-20 hover:shadow-md hover:-translate-y-px",
                            a.status === "cancelled" && "opacity-70",
                          )}
                          style={{
                            top: topPx,
                            left: `calc(${lane * laneW}% + 3px)`,
                            width: `calc(${laneW}% - 5px)`,
                            height: heightPx,
                            borderLeftColor: color,
                            background: "color-mix(in srgb, var(--card) 80%, transparent)",
                          }}
                        >
                          <span
                            className="pointer-events-none absolute inset-x-0 inset-y-0 opacity-[0.07]"
                            style={{ background: color }}
                          />
                          <span className="relative flex h-full flex-col justify-center gap-0.5 px-1.5">
                            <span className="truncate text-[10px] font-bold leading-tight text-foreground">
                              {formatTime(start)} · {a.client_name}
                            </span>
                            {heightPx >= 34 && (
                              <span className="truncate text-[10px] leading-tight text-muted-foreground">
                                {a.service_snapshot_name}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
