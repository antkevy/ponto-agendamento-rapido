/**
 * Brazilian phone number utilities.
 *
 * We always STORE the digits-only string (10 or 11 digits) and
 * FORMAT for display: (XX) XXXXX-XXXX (mobile) or (XX) XXXX-XXXX (landline).
 */

export function onlyDigits(v: string): string {
  return (v ?? "").replace(/\D+/g, "");
}

/** Format any input into a partial mask while typing. Accepts partial strings. */
export function formatPhoneBR(v: string): string {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Format a phone with the BR mask starting by DDD: (XX) XXXXX-XXXX.
 * If the input carries the +55 country code (12-13 digits), it's shown as a
 * "+55 " prefix and the mask applies to the rest, so searching with or without
 * the DDI works the same.
 */
export function formatPhoneBRTolerant(v: string): string {
  let d = onlyDigits(v);
  let prefix = "";
  if (d.length >= 12 && d.startsWith("55")) {
    prefix = "+55 ";
    d = d.slice(2);
  }
  d = d.slice(0, 11);
  if (d.length === 0) return prefix ? "+55" : "";
  if (d.length <= 2) return `${prefix}(${d}`;
  if (d.length <= 6) return `${prefix}(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `${prefix}(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `${prefix}(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** True when there are exactly 10 or 11 digits (Brazilian landline / mobile). */
export function isValidPhoneBR(v: string): boolean {
  const d = onlyDigits(v);
  return d.length === 10 || d.length === 11;
}

/**
 * Normalize a contact to the canonical BR digits (10 or 11). Removes a leading
 * "55" country code when present (12-13 digit input), so searches match rows
 * stored without the DDI.
 */
export function normalizeBRNumber(v: string): string {
  const d = onlyDigits(v);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d.slice(2);
  return d;
}

/**
 * Format a stored phone value for display. Returns the original value if it
 * doesn't look like a valid BR number, so legacy rows don't render as "()".
 */
export function displayPhoneBR(v: string | null | undefined): string {
  if (!v) return "";
  const d = onlyDigits(v);
  if (d.length === 10 || d.length === 11) return formatPhoneBR(d);
  return v;
}
