/** Helpers de data compartilhados pela tela de faturamento e pelo mini calendário. */

export const pad = (n: number) => String(n).padStart(2, "0");

export function civilDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function parseDateKey(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Data local ao meio-dia: evita deslocamento de dia no calendário. */
export function localDate(key: string): Date {
  const parts = parseDateKey(key);
  if (!parts) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2], 12);
}

export function dateKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function shiftKey(key: string, days: number): string {
  const date = localDate(key);
  date.setDate(date.getDate() + days);
  return dateKeyOf(date);
}

export function monthStartKey(key: string, offset = 0): string {
  const [year, month] = parseDateKey(key) ?? [2026, 1];
  const total = year * 12 + (month - 1) + offset;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`;
}

export function shortDate(key: string): string {
  const parts = parseDateKey(key) ?? ([2026, 1, 1] as [number, number, number]);
  return civilDate(...parts).toLocaleDateString("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
  });
}
