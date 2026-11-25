/**
 * Availability calculation utilities. Pure functions used both on
 * the public booking page and (potentially) the professional dashboard.
 */

export interface AvailabilityRow {
  weekday: number; // 0=Sun..6=Sat
  start_time: string; // "HH:MM:SS"
  end_time: string;
}

export interface Block {
  starts_at: string;
  ends_at: string;
}

export interface BusySlot {
  starts_at: string;
  ends_at: string;
}

/** Parse "HH:MM(:SS)?" into minutes since midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Verifica se o valor é um fuso IANA válido (ex.: "America/Sao_Paulo"). */
export function isValidTimeZone(value?: string | null): value is string {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Deslocamento (ms) entre o horário civil em `timeZone` e o instante UTC. */
function zonedOffsetMs(utc: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utc);
  const num = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const civilAsUtc = Date.UTC(
    num("year"),
    num("month") - 1,
    num("day"),
    num("hour"),
    num("minute"),
    num("second"),
  );
  return civilAsUtc - Math.floor(utc.getTime() / 1000) * 1000;
}

/** Converte um horário civil (AAAA-MM-DD + minutos) no fuso informado em Date. */
export function zonedTimeToDate(
  year: number,
  month: number,
  day: number,
  minutes: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  // Duas iterações bastam para estabilizar em mudanças de DST.
  let instant = guess - zonedOffsetMs(new Date(guess), timeZone);
  instant = guess - zonedOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

/**
 * Compute free start-time candidates for a given local day.
 * Returns an array of Date objects (each representing a valid start moment).
 */
export function computeSlots(params: {
  day: Date; // local date (midnight local)
  serviceDurationMinutes: number;
  availability: AvailabilityRow[];
  blocks: Block[];
  busy: BusySlot[];
  stepMinutes?: number;
  now?: Date;
  /** Fuso IANA do profissional; quando ausente usa o fuso do navegador. */
  timeZone?: string | null;
}): Date[] {
  const step = params.stepMinutes ?? 15;
  const now = params.now ?? new Date();
  const useZone = isValidTimeZone(params.timeZone) ? params.timeZone : null;
  const year = params.day.getFullYear();
  const month = params.day.getMonth() + 1;
  const date = params.day.getDate();

  const weekday = useZone
    ? zonedTimeToDate(year, month, date, 12 * 60, useZone).getUTCDay()
    : params.day.getDay();
  const rows = params.availability.filter((r) => r.weekday === weekday);
  if (rows.length === 0) return [];

  const candidates: Date[] = [];
  for (const row of rows) {
    const startMin = timeToMinutes(row.start_time);
    const endMin = timeToMinutes(row.end_time);
    for (let m = startMin; m + params.serviceDurationMinutes <= endMin; m += step) {
      const s = useZone
        ? zonedTimeToDate(year, month, date, m, useZone)
        : new Date(year, month - 1, date, Math.floor(m / 60), m % 60);
      if (s < now) continue;
      candidates.push(s);
    }
  }

  const durMs = params.serviceDurationMinutes * 60 * 1000;
  const busyRanges = [
    ...params.busy.map((b) => ({ s: new Date(b.starts_at), e: new Date(b.ends_at) })),
    ...params.blocks.map((b) => ({ s: new Date(b.starts_at), e: new Date(b.ends_at) })),
  ];

  return candidates.filter((s) => {
    const e = new Date(s.getTime() + durMs);
    for (const r of busyRanges) {
      if (s < r.e && e > r.s) return false;
    }
    return true;
  });
}

/** Chave "AAAA-MM-DD" do dia civil em `timeZone` (padrão: fuso local). */
export function zonedDateKey(d: Date, timeZone?: string | null): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (!isValidTimeZone(timeZone)) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return `${value("year")}-${pad(value("month"))}-${pad(value("day"))}`;
}

/** Limites [início, fim) do dia civil no fuso informado. */
export function zonedDayBounds(
  year: number,
  month: number,
  day: number,
  timeZone?: string | null,
): { start: Date; end: Date } {
  const tz = isValidTimeZone(timeZone) ? timeZone : undefined;
  const start = tz
    ? zonedTimeToDate(year, month, day, 0, tz)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = tz
    ? zonedTimeToDate(year, month, day + 1, 0, tz)
    : new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { start, end };
}

/** Limites [início, fim) do mês civil no fuso informado. */
export function zonedMonthBounds(
  year: number,
  month: number,
  timeZone?: string | null,
): { start: Date; end: Date } {
  return zonedDayBounds(year, month, 1, timeZone);
}

/** Dia de hoje no fuso informado, como "AAAA-MM-DD". */
export function zonedTodayKey(timeZone?: string | null): string {
  return zonedDateKey(new Date(), timeZone);
}

/** Minuto (0–59) da hora civil em determinado fuso IANA. */
export function minuteInTimeZone(d: Date, timeZone?: string | null): number {
  if (!isValidTimeZone(timeZone)) return d.getMinutes();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    minute: "2-digit",
  }).formatToParts(d);
  return Number(parts.find((p) => p.type === "minute")?.value ?? d.getMinutes());
}

/** Dia da semana (0=Dom) da data civil em determinado fuso IANA. */
export function weekdayInTimeZone(d: Date, timeZone?: string | null): number {
  if (!isValidTimeZone(timeZone)) return d.getDay();
  return zonedTimeToDate(
    d.getFullYear(),
    d.getMonth() + 1,
    d.getDate(),
    12 * 60,
    timeZone,
  ).getUTCDay();
}

/** Hora civil (0–23) de um instante em determinado fuso IANA. */
export function hourInTimeZone(d: Date, timeZone?: string | null): number {
  if (!isValidTimeZone(timeZone)) return d.getHours();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  return Number(parts.find((p) => p.type === "hour")?.value ?? d.getHours());
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatTime(d: Date, timeZone?: string | null): string {
  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    ...(isValidTimeZone(timeZone) ? { timeZone } : {}),
  });
}

export function formatLongDate(d: Date, timeZone?: string | null): string {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    ...(isValidTimeZone(timeZone) ? { timeZone } : {}),
  });
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export const WEEKDAYS_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const WEEKDAYS_PT_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
