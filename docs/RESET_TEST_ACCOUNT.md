# Redefinir a conta de teste do `barbershopmd` sem acesso ao e-mail

Use quando o e-mail de teste não existe mais / não é acessível. Rode no **Supabase → SQL Editor → New query → Run**.

## 1. Redefinir a senha

Substitua `SUA_SENHA_NOVA_AQUI` no SQL abaixo por uma senha forte (mín. 8 caracteres com maiúscula, minúscula, número e símbolo). Não compartilhe essa senha.

```sql
DO $reset$
DECLARE
  v_user_id uuid;
  v_schema text;
BEGIN
  SELECT p.user_id
  INTO v_user_id
  FROM public.profissionais p
  WHERE p.slug = 'barbershopmd'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum profissional com slug barbershopmd';
  END IF;

  SELECT n.nspname
  INTO v_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgcrypto';

  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'Extensão pgcrypto não encontrada';
  END IF;

  EXECUTE format(
    'UPDATE auth.users SET encrypted_password = %I.crypt(%L, %I.gen_salt(''bf'', 10)), updated_at = now() WHERE id = %L',
    v_schema, 'SUA_SENHA_NOVA_AQUI', v_schema, v_user_id
  );

  -- Conta de teste pode estar com e-mail não confirmado.
  UPDATE auth.users
  SET email_confirmed_at = coalesce(email_confirmed_at, now())
  WHERE id = v_user_id;

  -- O trigger on_auth_user_password_updated já faz isso; manter é idempotente.
  UPDATE public.user_security
  SET password_changed_at = now(), updated_at = now()
  WHERE user_id = v_user_id;

  RAISE NOTICE 'Senha redefinida para o usuário %', v_user_id;
END
$reset$;
```

## 2. Se houver 2FA ativo e o app autenticador estiver perdido

Rode apenas se o login pedir o código de 6 dígitos:

```sql
DO $mfa$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT p.user_id INTO v_user_id
  FROM public.profissionais p
  WHERE p.slug = 'barbershopmd'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum profissional com slug barbershopmd';
  END IF;

  IF to_regclass('auth.mfa_challenges') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.mfa_challenges WHERE factor_id IN (SELECT id FROM auth.mfa_factors WHERE user_id = $1)' USING v_user_id;
  END IF;
  IF to_regclass('auth.mfa_recovery_codes') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.mfa_recovery_codes WHERE factor_id IN (SELECT id FROM auth.mfa_factors WHERE user_id = $1)' USING v_user_id;
  END IF;
  IF to_regclass('auth.mfa_factors') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.mfa_factors WHERE user_id = $1' USING v_user_id;
  END IF;

  UPDATE public.user_security SET mfa_enabled = false, updated_at = now() WHERE user_id = v_user_id;
END
$mfa$;
```

## 3. Testar

1. Entre em `https://agendai-br.lovable.app/entrar` com o e-mail encontrado no SQL de diagnóstico e a nova senha.
2. Confira `Configurações → Segurança`: a senha deve constar como alterada agora (não vai expirar em 90 dias).
3. Teste `/p/barbershopmd` para garantir que o agendamento público continua normal.
