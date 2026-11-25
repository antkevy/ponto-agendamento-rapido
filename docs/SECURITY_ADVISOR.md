# Achados de segurança — como resolver

Este guia cobre os três avisos mostrados pelo Lovable/Supabase Security Advisor.

## 1. “People can choose a password that is already leaked”

**Código (já implementado):** verificação de senhas vazadas com a API Pwned Passwords (Have I Been Pwned) usando **k-anonymity**. O navegador calcula o SHA-1, envia apenas os 5 primeiros caracteres para `/api/password-check` e compara os sufixos localmente. **A senha e o hash completo nunca saem do dispositivo.**

A verificação vale para:

- cadastro de conta (`/cadastrar`);
- troca de senha em **Configurações → Segurança**;
- redefinição de senha em `/entrar`.

Se a API estiver temporariamente indisponível, o cadastro segue em frente (não trava o usuário), mas a política de complexidade continua valendo.

**Aviso do painel:** o toggle nativo do Supabase (“Prevent use of leaked passwords”) só existe no **plano Pro ou superior**. No plano gratuito ele fica desabilitado e o aviso do Advisor pode continuar aparecendo mesmo com a proteção implementada no app. Se você fizer upgrade para Pro, ative também:

> Supabase Dashboard → Authentication → Sign In / Providers → Email → **Prevent use of leaked passwords** → Save

**Status atual (25/11/2026):** toggle nativo **DESLIGADO**, aviso **aceito como risco** porque o projeto é ambiente de teste. Isso não é “resolvido”: chamadas diretas à API do Supabase Auth — ou convites criados no Dashboard — ainda podem definir senhas vazadas sem passar pelas telas do app. Em toda auditoria futura, lembrar esse ponto. Se o projeto virar produção, a recomendação é fazer upgrade para Pro e ligar o toggle; não basta dizer que o app já valida.

## 2. “Some access rules let everyone through” (4 tabelas)

Arquivo: `supabase/migrations/20261125130000_security_advisor_fixes_v2.sql` (**use esta versão**; a v1 falha se `plano_servicos`/`saas_plans` não existirem no seu projeto).

Cole no **Supabase → SQL Editor → New query → Run**. Ela procura automaticamente todas as policies de SELECT que liberam tudo para o público e as substitui por regras que exigem registro ativo e estabelecimento com slug público. Tabelas inexistentes são ignoradas. O agendamento público continua funcionando normalmente.

Para conferir depois:

```sql
SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('planos', 'produtos', 'plano_servicos', 'saas_plans')
ORDER BY tablename, policyname;
```

Se o Lovable apontar **outras** tabelas, cole aqui os nomes que eu ajusto a policy específica.

## 3. “A rule lets anyone list files in brand-assets”

A migração v2 remove a policy `brand-assets public read` e a substitui por `brand-assets owner read` (somente o dono da pasta consegue listar via API).

As **URLs públicas das imagens continuam funcionando**: o bucket `brand-assets` é público, e o Supabase permite baixar por URL sem policy de SELECT. Upload, substituição e exclusão já eram restritos ao dono da pasta.

Para testar como visitante (usando apenas a chave publicável):

```bash
curl -X POST "https://SEU-PROJECT.supabase.co/storage/v1/object/list/brand-assets" \
  -H "apikey: SUA_CHAVE_PUBLICAVEL" \
  -H "Content-Type: application/json" \
  -d '{"prefix": "", "limit": 20}'
```

O resultado deve ser uma lista vazia (ou erro de permissão), nunca os arquivos dos estabelecimentos.

## 4. Revisão dos commits do Lovable (25/11/2026)

Commits revisados: `0376265`, `3c00484`, `725cc13`.

- `src/integrations/supabase/types.ts` e `previewAuthStorage.ts`: diferença é **apenas formatação** (aspas/quebras). Depois de normalizar com Prettier, o conteúdo é idêntico ao anterior. `commission_percent` continua presente. Esses dois arquivos entraram no `.prettierignore` para evitar diffs grandes sem efeito.
- `supabase/migrations/20261125212445_*.sql`: limita as RPCs de horários ocupados a uma janela de 62 dias e mescla intervalos sobrepostos (`range_agg`), reduzindo a exposição de agendamentos individuais. Também reforça `auto_link_client()` para não sobrescrever dados de clientes existentes.
- `src/routes/app.servicos.tsx` + `src/lib/image.ts`: ao excluir serviço/plano/produto, a imagem agora é removida do Storage. O caminho é validado antes do `--<user-id>/<pasta>/<arquivo>` para bloquear `..`/URL malformada, e a linha do banco é apagada **antes** do arquivo (evita registro com imagem quebrada se o delete falhar).
- Acompanhamento: rodar `supabase/migrations/20261126010000_busy_slots_public_guard.sql`. Ela exige slug público também em `get_employee_busy_slots` e mantém `get_busy_slots` funcionando no painel do dono quando o estabelecimento ainda não tem slug.

## Ordem recomendada

1. Rodar a migração `20261125130000_security_advisor_fixes_v2.sql` no Supabase (a v1 falha se `plano_servicos`/`saas_plans` não existirem).
2. Rodar a migração do Lovable `20261125212445_6b75bb5e-a578-4bf5-85e9-5db1c5e1895b.sql`.
3. Rodar `20261126010000_busy_slots_public_guard.sql` (revisão desta rodada).
4. Publicar no Lovable o commit com `/api/password-check`.
5. Rodar novamente o Security Advisor.
6. Testar cadastro com uma senha vazada conhecida (ex.: `password123`) — deve ser recusada.
7. Testar o link público `/p/barbershopmd` — imagens e agendamento devem continuar normais.
