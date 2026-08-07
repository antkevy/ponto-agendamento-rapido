<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

> [!TIP]
> Design: quando o usuário pedir para "usar a 21st.dev" ou redesenhar algo, carregue o skill
> global `21st-dev` (busca `--free`, cota, mapa de tradução para o design system nativo e
> log vivo de componentes reutilizáveis em qualquer projeto).

# Segurança (implementado — código)

Stack real: **auth = Supabase Auth**, **banco = Supabase Postgres + RLS**, **deploy = Cloudflare Workers** (preset `cloudflare-module`, sem `wrangler.toml` — o nitro gera `.output/server/wrangler.json`).

## Código entregue

- **MFA TOTP** — `supabase.auth.mfa` (enroll/verify/unenroll) em `src/components/security-settings.tsx`; fluxo de login em 2 passos em `src/routes/entrar.tsx`; QR local com `qrcode.react`.
- **Política de senha** — `src/lib/password.ts`: mín. 8 chars + 4 classes; rotação a cada **90 dias** via `user_security.password_changed_at`; bloqueio no login quando expirada; validada no cadastro/recuperação/aba Segurança.
- **RBAC** — migração `supabase/migrations/20260806000000_security_core.sql`: tabela `user_security` (role `admin|editor|user`), RPCs (`current_user_role`, `has_role`, `set_mfa_enabled`, `touch_password_change`, `set_user_role`), triggers role-gate (write = admin|editor, delete = admin) nas tabelas de catálogo/horários; UI gated por `src/hooks/use-user-role.ts` em `app.servicos.tsx` (modo somente leitura) e aba Segurança em `app.configuracoes.tsx`.
- **Rate limiting** — `src/lib/rate-limit.ts` (janela deslizante em memória) + 429 global em `src/server.ts`.
- **Auditoria** — `src/lib/audit.ts` → **Logtail** (Better Stack) com `LOGTAIL_SOURCE_TOKEN`; PII cifrada com AES-256-GCM (`src/lib/crypto.ts`) quando `APP_DATA_ENCRYPTION_KEY` está setada, senão mascarada; eventos `auth.*`, `http.access`.
- **Headers/HSTS** — `src/server.ts`: `strict-transport-security` (1 ano, preload), `nosniff`, `x-frame-options DENY`, `referrer-policy`, `permissions-policy`, CSP estrita via `APP_ENABLE_CSP=1` (off por padrão).

## Secrets (Cloudflare Workers)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"  # gerar chave
npx wrangler secret put APP_DATA_ENCRYPTION_KEY
npx wrangler secret put LOGTAIL_SOURCE_TOKEN
```

## Validação

```bash
npm run format && npm run lint && npm run build
```

## Pendente — só via painel (infra), sem código

- Cloudflare: ativar WAF, Bot Fight Mode, "Rate limiting" distribuído (o limiter do Worker é por isolate), SSL Full, backups automáticos; rodar migração SQL `security_core.sql` no Supabase (Dashboard → SQL Editor).
- Supabase: confirmar RLS e policy da `public.profissionais` para o insert do onboarding.
