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

/** True when there are exactly 10 or 11 digits (Brazilian landline / mobile). */
export function isValidPhoneBR(v: string): boolean {
  const d = onlyDigits(v);
  return d.length === 10 || d.length === 11;
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
