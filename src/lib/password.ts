/**
 * Política de senha do Agendaí: força mínima e rotação a cada 90 dias.
 * A complexidade é validada no cliente (cadastro/login/recuperação) e a
 * expiração é rastreada pela tabela `user_security.password_changed_at`
 * (atualizada por trigger no `auth.users` quando a senha muda).
 */

export const MIN_PASSWORD_LENGTH = 8;
export const PASSWORD_MAX_AGE_DAYS = 90;

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export function passwordScore(password: string): PasswordScore {
  let score: PasswordScore = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score = (score + 1) as PasswordScore;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score = (score + 1) as PasswordScore;
  if (/\d/.test(password)) score = (score + 1) as PasswordScore;
  if (/[^A-Za-z0-9]/.test(password)) score = (score + 1) as PasswordScore;
  return score;
}

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= MIN_PASSWORD_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export function passwordStrengthLabel(score: PasswordScore): string {
  if (score <= 1) return "Fraca";
  if (score === 2) return "Média";
  if (score === 3) return "Boa";
  return "Forte";
}

export function passwordStrengthHint(password: string): string | null {
  if (password.length === 0) return null;
  if (password.length < MIN_PASSWORD_LENGTH)
    return `Use pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (!/[A-Z]/.test(password)) return "Inclua uma letra maiúscula.";
  if (!/[a-z]/.test(password)) return "Inclua uma letra minúscula.";
  if (!/\d/.test(password)) return "Inclua um número.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Inclua um caractere especial (ex.: @#!$%).";
  return null;
}

export function daysSincePasswordChange(passwordChangedAt: string | Date | null): number {
  if (!passwordChangedAt) return 0;
  const ts =
    typeof passwordChangedAt === "string" ? new Date(passwordChangedAt) : passwordChangedAt;
  return Math.max(0, Math.floor((Date.now() - ts.getTime()) / 86_400_000));
}

export function daysUntilPasswordExpiry(passwordChangedAt: string | Date | null): number {
  return Math.max(0, PASSWORD_MAX_AGE_DAYS - daysSincePasswordChange(passwordChangedAt));
}

/** A senha precisa ser trocada quando passou do prazo de 90 dias. */
export function passwordRequiresUpdate(passwordChangedAt: string | Date | null): boolean {
  return daysSincePasswordChange(passwordChangedAt) >= PASSWORD_MAX_AGE_DAYS;
}
