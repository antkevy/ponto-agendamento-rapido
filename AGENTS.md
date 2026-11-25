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

> [!IMPORTANT]
> Referências de design/animação que o usuário pediu para SEMPRE buscar primeiro
> (não pedir de novo): `https://kokonutui.com/`, `https://reactbits.dev/`,
> `https://animejs.com/`, `https://motion.dev/`, `https://magicui.design/`,
> `https://uiverse.io/`. Preferir componentes sem dependências pesadas, portados
> para o design system nativo (tokens CSS), como já feito em `src/components/effects.tsx`.

# Painel — Faturamento

- Aba `/app/faturamento` em `src/routes/app.faturamento.tsx` (link no menu de `src/components/app-shell.tsx`): filtros semanal/mensal/anual e por intervalo com mini calendário próprio (mesmo grid do agendamento público), carregado sob demanda (`src/components/faturamento/period-calendar.tsx`), gráfico de evolução, indicadores e comissão configurável por funcionário (`funcionarios.commission_percent`, migração `supabase/migrations/20261126000000_employee_commission.sql`). Layout otimizado para mobile (cartões no lugar da tabela, toques de 44px). Guia em `docs/FATURAMENTO.md`.

# Segurança (implementado — código)

Stack real: **auth = Supabase Auth**, **banco = Supabase Postgres + RLS**, **deploy = Cloudflare Workers** (preset `cloudflare-module`, sem `wrangler.toml` — o nitro gera `.output/server/wrangler.json`).

## Código entregue

- **MFA TOTP** — `supabase.auth.mfa` (enroll/verify/unenroll) em `src/components/security-settings.tsx`; fluxo de login em 2 passos em `src/routes/entrar.tsx`; QR local com `qrcode.react`.
- **Política de senha** — `src/lib/password.ts`: mín. 8 chars + 4 classes; **sem expiração por prazo** (NIST SP 800-63B-4). `user_security.password_changed_at` é apenas registro informativo/auditoria. Troca opcional no cadastro/recuperação/aba Segurança, com checagem de senhas vazadas via HIBP (`src/lib/password-breach.ts`). O toggle nativo do Supabase continua DESLIGADO e **aceito como risco em ambiente de teste** — ver "Auditorias futuras" abaixo.
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

## Auditorias futuras — lembrete obrigatório

- **HIBP nativo do Supabase ainda DESLIGADO.** A checagem do app cobre cadastro, recuperação e troca de senha, mas chamadas diretas à API Auth bypassam essa camada. Em toda auditoria, relembrar o usuário: ativar em **Supabase → Authentication → Sign In / Providers → Email → Prevent use of leaked passwords → Save**. Só existe no **plano Pro+** (Owner/Admin). No Free, manter **aceito como risco** somente enquanto for ambiente de teste; se virar produção, recomendar upgrade. Nunca marcar como "resolvido" só porque o código já valida.
- Arquivos gerados pelo Lovable/Supabase (`src/integrations/supabase/types.ts` e `previewAuthStorage.ts`) estão no `.prettierignore`: não reformatar, para evitar diffs grandes e sem efeito.
- Após commits do Lovable, sempre comparar `git log`/`git diff` e conferir se migrações SQL novas foram realmente aplicadas no Supabase antes de dar o resultado como pronto.

## Validação

```bash
npm run format && npm run lint && npm run typecheck && npm run build
```

## Pendente — só via painel (infra), sem código

- Cloudflare: ativar WAF, Bot Fight Mode, "Rate limiting" distribuído (o limiter do Worker é por isolate), SSL Full, backups automáticos; rodar migração SQL `security_core.sql` no Supabase (Dashboard → SQL Editor).
- Supabase: confirmar RLS e policy da `public.profissionais` para o insert do onboarding.
