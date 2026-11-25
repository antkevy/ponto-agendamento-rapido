# Turnstile no Agendai (sem domínio próprio)

O agendamento público exige Turnstile em produção (**fail-closed**). Dá para configurar usando apenas a URL que o Lovable já fornece — **não é preciso comprar domínio nem apontar DNS na Cloudflare**.

## 1. Descubra o hostname exato

Abra o app no navegador e copie a URL, por exemplo:

```text
https://abc123.lovable.app/p/minha-barbearia
```

O hostname é apenas:

```text
abc123.lovable.app
```

Regras da Cloudflare:

- não use `https://`, porta nem path no campo de hostname;
- **wildcard não é aceito** (`*.lovable.app` é inválido);
- cada subdomínio precisa ser adicionado (preview, produção, etc.). O Free permite até 10 hostnames por widget.

> Se o Lovable também servir `abc123.lovableproject.com` ou URLs de preview que você usa, adicione cada uma.

## 2. Criar o widget

1. Entre com uma conta Cloudflare (grátis) em <https://dash.cloudflare.com>.
2. **Turnstile → Add widget**.
3. Nome: `agendai-booking`.
4. Widget behavior: **Managed**.
5. Hostname: `abc123.lovable.app`.
6. Copie **Site Key** e **Secret Key**.

## 3. Configurar no Lovable

No projeto: **Project Settings → Environment Variables**.

Variável de build (pública, vai para o navegador):

```text
VITE_TURNSTILE_SITE_KEY=0x_SITE_KEY
```

Variável de servidor/secret (**nunca** com prefixo `VITE_`, nunca no git):

```text
TURNSTILE_SECRET_KEY=0x_SECRET_KEY
```

Recomendado enquanto ainda não houver domínio próprio:

```text
APP_SITE_URL=https://abc123.lovable.app
```

> Não coloque o domínio futuro em `APP_SITE_URL` agora: o servidor compara esse hostname com o do token. Se estiver vazio, ele usa a origem do próprio request.

Salve e faça um **novo deploy** — `VITE_*` é lido no build.

Se você tiver acesso direto ao Worker na Cloudflare, o `TURNSTILE_SECRET_KEY` também pode ser adicionado em **Workers & Pages → seu worker → Settings → Variables & Secrets**. O código aceita secret do Worker ou variável de ambiente do processo.

## 4. Testar

Abra `/p/<slug>` em produção e conclua um agendamento.

| Mensagem no app | Causa |
|---|---|
| `Verificação de segurança indisponível` | `VITE_TURNSTILE_SITE_KEY` não chegou no build |
| `Não foi possível validar a verificação` | secret ausente/errado ou hostname do widget diferente da URL |
| `Verificação de segurança expirada` | token venceu; recarregue e refaça |

Chaves de teste da Cloudflare (servem para validar o fluxo; sempre passam):

```text
Site key: 1x00000000000000000000AA
Secret:   1x0000000000000000000000000000000AA
```

Depois troque pelas chaves reais do widget.

## 5. O que ainda não se aplica sem domínio próprio

Estes itens exigem um domínio **proxied pela Cloudflare** (nuvem laranja) e podem esperar até você comprar/configurar o seu:

- WAF managed rules;
- Bot Fight Mode;
- SSL **Full (Strict)** e Always Use HTTPS;
- regra de rate limiting distribuído no painel.

Até lá, o Worker já aplica headers de segurança e o rate limiting em memória, e o Turnstile protege o formulário público.

## Segurança

Nunca cole `TURNSTILE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou `APP_DATA_ENCRYPTION_KEY` no chat, no git ou em variáveis `VITE_*`.
