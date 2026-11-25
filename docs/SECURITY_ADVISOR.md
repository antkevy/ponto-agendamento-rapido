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

## 2. “Some access rules let everyone through” (4 tabelas)

Arquivo: `supabase/migrations/20261125120000_security_advisor_fixes.sql`

Cole no **Supabase → SQL Editor → New query → Run**. Ele substitui as policies `USING (true)` das tabelas `planos`, `produtos`, `plano_servicos` e `saas_plans` por regras que exigem registro ativo e estabelecimento com slug público. O agendamento público continua funcionando normalmente.

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

A mesma migração acima remove a policy `brand-assets public read` e a substitui por `brand-assets owner read` (somente o dono da pasta consegue listar via API).

As **URLs públicas das imagens continuam funcionando**: o bucket `brand-assets` é público, e o Supabase permite baixar por URL sem policy de SELECT. Upload, substituição e exclusão já eram restritos ao dono da pasta.

Para testar como visitante (usando apenas a chave publicável):

```bash
curl -X POST "https://SEU-PROJECT.supabase.co/storage/v1/object/list/brand-assets" \
  -H "apikey: SUA_CHAVE_PUBLICAVEL" \
  -H "Content-Type: application/json" \
  -d '{"prefix": "", "limit": 20}'
```

O resultado deve ser uma lista vazia (ou erro de permissão), nunca os arquivos dos estabelecimentos.

## Ordem recomendada

1. Rodar a migração `20261125120000_security_advisor_fixes.sql` no Supabase.
2. Publicar no Lovable o commit com `/api/password-check`.
3. Rodar novamente o Security Advisor.
4. Testar cadastro com uma senha vazada conhecida (ex.: `password123`) — deve ser recusada.
5. Testar o link público `/p/barbershopmd` — imagens e agendamento devem continuar normais.
