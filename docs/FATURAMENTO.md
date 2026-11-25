# Faturamento e comissão por funcionário

A aba **Faturamento** fica em `/app/faturamento` (menu lateral do painel, ícone de carteira).

## O que a tela mostra

- Períodos **semanal**, **mensal**, **anual** e um filtro **Período** com datas livre (De / Até).
  Nas setas ao lado do filtro é possível avançar/retroceder o período.
- Gráfico de evolução diária (para até 62 dias) ou mensal (acima disso), com o valor de cada
  barra ao passar o mouse ou clicar para fixar.
- Indicadores: faturamento bruto, comissões, valor após comissões, quantidade de atendimentos e
  ticket médio.
- Tabela com a receita atribuída a cada funcionário, o **percentual de comissão configurável** e o
  valor devido no período.
- Receita por serviço e explicação dos cálculos.

Todas as datas usam o fuso horário configurado no perfil do estabelecimento. Cancelamentos não
entram nos cálculos. Atendimentos sem funcionário responsável contam no bruto, mas não geram
comissão.

## Configuração necessária (UMA vez)

A comissão é gravada numa coluna nova de `public.funcionarios`. No **Supabase → SQL Editor →
New query → Run**, rode o conteúdo de:

```text
supabase/migrations/20261126000000_employee_commission.sql
```

O arquivo é idempotente: pode ser rodado mais de uma vez sem erro. Ele apenas adiciona
`commission_percent NUMERIC(5,2)` com valor padrão `0` e uma restrição de `0` a `100`.

Sem essa migração a tela continua funcionando, mas exibe o aviso “Aplique a migração de comissão
para editar” e os percentuais ficam como `0`.

## Quem pode editar

Somente usuários com papel **admin** ou **editor** (`user_security.role`) conseguem alterar o
percentual. A política de escrita e o trigger de RBAC já existentes em `funcionarios` continuam
valendo no banco; o painel esconde o lápis para os demais.

Para alterar: clique no percentual na tabela, informe um número de `0` a `100` (aceita vírgula,
ex.: `12,5`) e confirme com Enter ou com o botão de ✓.

## Arquivos relacionados

- `src/routes/app.faturamento.tsx` — página e cálculos.
- `src/components/app-shell.tsx` — link no menu.
- `src/integrations/supabase/types.ts` — tipo da nova coluna.
- `supabase/migrations/20261126000000_employee_commission.sql` — migração.
