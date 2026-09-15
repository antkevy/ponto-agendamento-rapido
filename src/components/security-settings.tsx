import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, ShieldOff, KeyRound, UserCog, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useUserRole, ROLE_LABEL } from "@/hooks/use-user-role";
import {
  isStrongPassword,
  passwordScore,
  passwordStrengthLabel,
  passwordStrengthHint,
  daysSincePasswordChange,
  daysUntilPasswordExpiry,
} from "@/lib/password";

type SecurityRow = {
  role: "admin" | "editor" | "user" | null;
  password_changed_at: string | null;
  mfa_enabled: boolean;
};

const PASSWORD_WARNING_DAYS = 14;

export function SecuritySettings() {
  const { user } = useAuth();
  const { role } = useUserRole();
  const qc = useQueryClient();

  const { data: row } = useQuery({
    queryKey: ["user_security", user?.id],
    enabled: Boolean(user),
    queryFn: async (): Promise<SecurityRow | null> => {
      const { data, error } = await supabase
        .from("user_security")
        .select("role, password_changed_at, mfa_enabled")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) return null;
      return data as SecurityRow;
    },
  });

  const { data: factors } = useQuery({
    queryKey: ["mfa_factors", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      return data?.all ?? [];
    },
  });

  const mfaActive = Boolean(
    factors?.some((f) => f.factor_type === "totp" && f.status === "verified"),
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["mfa_factors"] });
    qc.invalidateQueries({ queryKey: ["user_security"] });
  };

  const [enrolling, setEnrolling] = useState(false);
  const [pending, setPending] = useState<{ id: string; uri: string; secret: string } | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const enable = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (error) throw error;
      setPending({ id: data.id, uri: data.totp.uri, secret: data.totp.secret });
    },
    onError: () => toast.error("Não foi possível iniciar a configuração do 2FA."),
  });

  const verifyEnroll = useMutation({
    mutationFn: async () => {
      if (!pending) throw new Error("Sessão de configuração expirada.");
      const { data: challenge, error: chalErr } = await supabase.auth.mfa.challenge({
        factorId: pending.id,
      });
      if (chalErr) throw chalErr;
      const { error } = await supabase.auth.mfa.verify({
        factorId: pending.id,
        challengeId: challenge.id,
        code: mfaCode.trim(),
      });
      if (error) throw error;
      await supabase.rpc("set_mfa_enabled", { p_enabled: true });
    },
    onSuccess: () => {
      toast.success("Autenticação em dois fatores ativada!");
      setPending(null);
      setMfaCode("");
      refresh();
    },
    onError: () => toast.error("Código inválido. Confira os 6 dígitos do app autenticador."),
  });

  const disable = useMutation({
    mutationFn: async () => {
      const totp = factors?.filter((f) => f.factor_type === "totp") ?? [];
      for (const f of totp) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      await supabase.rpc("set_mfa_enabled", { p_enabled: false });
    },
    onSuccess: () => {
      toast.success("Autenticação em dois fatores desativada.");
      refresh();
    },
    onError: () => toast.error("Não foi possível desativar o 2FA."),
  });

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const changePassword = useMutation({
    mutationFn: async () => {
      if (pw.next !== pw.confirm) throw new Error("As senhas não coincidem.");
      if (!isStrongPassword(pw.next))
        throw new Error("Senha fraca. Use letras, números e símbolos (mín. 8 caracteres).");
      const { error: reauth } = await supabase.auth.signInWithPassword({
        email: user!.email ?? "",
        password: pw.current,
      });
      if (reauth) throw new Error("Senha atual incorreta.");
      const { error } = await supabase.auth.updateUser({ password: pw.next });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Senha atualizada!");
      setPw({ current: "", next: "", confirm: "" });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changedDays = row?.password_changed_at
    ? daysSincePasswordChange(row.password_changed_at)
    : null;
  const untilExpiry = row?.password_changed_at
    ? daysUntilPasswordExpiry(row.password_changed_at)
    : null;
  const expiringSoon = typeof untilExpiry === "number" && untilExpiry <= PASSWORD_WARNING_DAYS;

  const nextLabel = pw.next ? passwordStrengthLabel(passwordScore(pw.next)) : null;

  return (
    <div className="space-y-6">
      <div className="card-elevated p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className="ui-icon-bubble h-10 w-10 grid place-items-center rounded-xl">
            <UserCog className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold tracking-tight">Seu papel</h3>
            <p className="text-xs text-muted-foreground">
              Controla o que você pode editar dentro do painel.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="ui-badge">{role ? (ROLE_LABEL[role] ?? "Usuário") : "Usuário"}</span>
          {role === "admin" && (
            <span className="text-xs text-muted-foreground">
              Você administra este negócio e pode gerenciar equipe e segurança.
            </span>
          )}
          {role !== "admin" && (
            <span className="text-xs text-muted-foreground">
              Apenas o administrador pode gerenciar equipe e segurança.
            </span>
          )}
        </div>
      </div>

      <div className="card-elevated p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className="ui-icon-bubble h-10 w-10 grid place-items-center rounded-xl">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold tracking-tight">Autenticação em dois fatores (2FA)</h3>
            <p className="text-xs text-muted-foreground">
              Código de 6 dígitos de um app autenticador (Google Authenticator, Authy...).
            </p>
          </div>
        </div>

        {mfaActive ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]" /> Ativado
            </span>
            <button
              type="button"
              onClick={() => disable.mutate()}
              disabled={disable.isPending}
              className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--destructive)] hover:opacity-80 disabled:opacity-60"
            >
              <ShieldOff className="h-4 w-4" />
              {disable.isPending ? "Desativando..." : "Desativar"}
            </button>
          </div>
        ) : pending ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-2xl border border-border bg-background p-3">
                <QRCodeSVG value={pending.uri} size={176} />
              </div>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                Escaneie o QR code com seu app autenticador e digite o código de 6 dígitos para
                confirmar.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                className="w-full sm:w-40 min-h-[44px] px-3 py-2 rounded-lg border border-border text-center font-mono text-lg tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                disabled={mfaCode.length !== 6 || verifyEnroll.isPending}
                onClick={() => verifyEnroll.mutate()}
                className="btn-brand inline-flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {verifyEnroll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirmar
              </button>
              <button
                type="button"
                disabled={verifyEnroll.isPending}
                onClick={() => setPending(null)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 min-h-[44px] text-sm font-semibold hover:bg-muted disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => enable.mutate()}
            disabled={enable.isPending}
            className="btn-brand inline-flex items-center gap-2 disabled:opacity-60"
          >
            <ShieldCheck className="h-4 w-4" />
            {enable.isPending ? "Preparando..." : "Ativar 2FA"}
          </button>
        )}
      </div>

      <div className="card-elevated p-6 space-y-5">
        <div className="flex items-center gap-3">
          <span className="ui-icon-bubble h-10 w-10 grid place-items-center rounded-xl">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-bold tracking-tight">Trocar senha</h3>
            <p className="text-xs text-muted-foreground">
              Recomendamos trocar a cada 90 dias.{" "}
              {changedDays !== null && `Última troca há ${changedDays} dia(s).`}
            </p>
          </div>
        </div>

        {expiringSoon && (
          <div className="rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/10 px-4 py-3 text-sm">
            Sua senha expira em {untilExpiry} dia(s). Troque agora para não ser obrigado a trocar no
            login.
          </div>
        )}

        <div className="grid gap-4">
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Senha atual"
            value={pw.current}
            onChange={(e) => setPw({ ...pw, current: e.target.value })}
            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Nova senha"
            value={pw.next}
            onChange={(e) => setPw({ ...pw, next: e.target.value })}
            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Confirmar nova senha"
            value={pw.confirm}
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
            className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {nextLabel && (
            <p
              className={`text-xs font-medium ${
                pw.next && isStrongPassword(pw.next)
                  ? "text-[var(--success)]"
                  : "text-muted-foreground"
              }`}
            >
              Força: {nextLabel}. {!isStrongPassword(pw.next) && passwordStrengthHint(pw.next)}
            </p>
          )}
          <button
            type="button"
            disabled={changePassword.isPending || !pw.current || !pw.next || !pw.confirm}
            onClick={() => changePassword.mutate()}
            className="btn-brand inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {changePassword.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Atualizar senha
          </button>
        </div>
      </div>
    </div>
  );
}
