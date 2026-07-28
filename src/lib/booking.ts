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

/** Round a Date up to the next multiple of `stepMinutes` minutes. */
function roundUp(d: Date, stepMinutes: number): Date {
  const ms = stepMinutes * 60 * 1000;
  return new Date(Math.ceil(d.getTime() / ms) * ms);
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
}): Date[] {
  const step = params.stepMinutes ?? 15;
  const now = params.now ?? new Date();
  const weekday = params.day.getDay();
  const rows = params.availability.filter((r) => r.weekday === weekday);
  if (rows.length === 0) return [];

  const dayStart = new Date(params.day);
  dayStart.setHours(0, 0, 0, 0);

  const candidates: Date[] = [];
  for (const row of rows) {
    const startMin = timeToMinutes(row.start_time);
    const endMin = timeToMinutes(row.end_time);
    for (let m = startMin; m + params.serviceDurationMinutes <= endMin; m += step) {
      const s = new Date(dayStart.getTime() + m * 60 * 1000);
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

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatLongDate(d: Date): string {
  return d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
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
