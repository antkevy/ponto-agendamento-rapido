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

Você **não precisa editar `.env`**. O app aceita a site key e as configurações do Supabase vindas de secrets do servidor (injetadas no HTML pelo SSR). Isso evita o erro `Esta página não carregou` quando o build não recebe variáveis `VITE_*`.

Se o deploy estiver com erro 500 em **todas** as páginas, abra `/api/diagnostics`: ele mostra apenas `true/false` (nunca valores). `worker.SUPABASE_URL` e `worker.SUPABASE_PUBLISHABLE_KEY` precisam estar `true`. Se estiverem `false`, adicione esses dois secrets abaixo e faça novo deploy.

### 3.1 Todas as variáveis em **Secrets**

No projeto: **Settings → Secrets** (ou **Project Settings → Secrets**) e adicione:

```text
SUPABASE_URL=https://SEU-PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=SUA_ANON_KEY
TURNSTILE_SITE_KEY=0x_SITE_KEY
TURNSTILE_SECRET_KEY=0x_SECRET_KEY
APP_SITE_URL=https://abc123.lovable.app
```

No Lovable Cloud, `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` normalmente já são injetados automaticamente; só adicione manualmente se `/api/diagnostics` mostrar `false`. A chave publicável do Supabase é pública por design (proteção via RLS). Nunca use `SUPABASE_SERVICE_ROLE_KEY` aqui.

- `TURNSTILE_SITE_KEY`: pública, servida pelo endpoint `/api/site-config` e pelo HTML (não é sensível).
- `TURNSTILE_SECRET_KEY`: privada, usada apenas no servidor para validar o token.
- `APP_SITE_URL`: hostname canônico usado na validação.

> Não use chaves de teste com `APP_SITE_URL` preenchido: o secret de teste devolve hostname `example.com` e a validação falharia. Nesse caso, deixe `APP_SITE_URL` vazio temporariamente.

> Não coloque o domínio futuro em `APP_SITE_URL` agora: o servidor compara esse hostname com o do token. Se estiver vazio, ele usa a origem do próprio request.

Salve e faça um **novo deploy** — secrets do Worker são lidos no runtime.

### 3.2 Alternativa (se você conseguir editar `.env`)

Se o arquivo `.env` estiver disponível no editor de código do Lovable, você pode usar a forma clássica de build:

```text
VITE_TURNSTILE_SITE_KEY=0x_SITE_KEY
```

Nesse caso, `TURNSTILE_SECRET_KEY` continua em **Secrets**. O código usa os valores do Worker primeiro e cai para `VITE_` se eles não existirem.

Se você tiver acesso direto ao Worker na Cloudflare, os secrets também podem ser adicionados em **Workers & Pages → seu worker → Settings → Variables & Secrets**. O código aceita secrets do Worker ou variáveis de ambiente do processo.

## 4. Testar

Abra `/p/<slug>` em produção e conclua um agendamento.

| Mensagem no app                          | Causa                                                        |
| ---------------------------------------- | ------------------------------------------------------------ |
| `Verificação de segurança indisponível`  | site key ausente (nem `VITE_`, nem `TURNSTILE_SITE_KEY`)     |
| `Não foi possível validar a verificação` | secret ausente/errado ou hostname do widget diferente da URL |
| `Verificação de segurança expirada`      | token venceu; recarregue e refaça                            |

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
