# Faturamento e comissão por funcionário

A aba **Faturamento** fica em `/app/faturamento` (menu lateral do painel, ícone de carteira).

## O que a tela mostra

- Períodos **semanal**, **mensal**, **anual** e **Período** (personalizado). Nas setas ao lado do
  filtro é possível avançar/retroceder o período.
- No filtro personalizado, um **mini calendário** de intervalo: toque numa data de início e em
  outra de fim. Atalhos: **Hoje**, **7 dias**, **30 dias**, **Este mês**, **Mês passado** e **Limpar**.
  Datas futuras ficam desabilitadas.
- Gráfico de evolução diária (até 62 dias) ou mensal (acima disso), com média, melhor e pior dia,
  valor ao passar o mouse e ao clicar para fixar.
- Indicadores: entradas, comissões, resultado, quantidade de atendimentos e ticket médio.
- Demonstrativo por profissional com receita, **percentual de comissão configurável** e valor devido.
- Receita por serviço e explicação dos cálculos.

Todas as datas usam o fuso horário configurado no perfil do estabelecimento. Cancelamentos não
entram nos cálculos. Atendimentos sem funcionário responsável contam no bruto, mas não geram
comissão.

## Mobile

- Filtros em faixa rolável, com toque mínimo de 44px.
- Mini calendário em uma coluna, sem popup: ocupa a largura da tela e usa dias de 44px.
- O mini calendário é carregado **sob demanda** (`React.lazy`), então a rota abre leve no celular.
- No lugar da tabela, cada profissional vira um cartão com comissão editável e valor a pagar.
- Gráfico com rolagem horizontal suave (`touch-pan-x`).

## Configuração necessária (UMA vez)

A comissão é gravada numa coluna nova de `public.funcionarios`. No **Supabase → SQL Editor →
New query → Run**, rode o conteúdo de:

```text
supabase/migrations/20261126000000_employee_commission.sql
```

O arquivo é idempotente: pode ser rodado mais de uma vez sem erro. Ele apenas adiciona
`commission_percent NUMERIC(5,2)` com valor padrão `0` e uma restrição de `0` a `100`.

Sem essa migração a tela continua funcionando, mas exibe o aviso “Migração de comissão pendente” e
os percentuais ficam como `0`.

## Quem pode editar

Somente usuários com papel **admin** ou **editor** (`user_security.role`) conseguem alterar o
percentual. A política de escrita e o trigger de RBAC já existentes em `funcionarios` continuam
valendo no banco; o painel esconde o lápis para os demais.

Para alterar: toque no percentual (na tabela no desktop ou no cartão no celular), informe um número
de `0` a `100` (aceita vírgula, ex.: `12,5`) e confirme com Enter ou com o botão de ✓.

## Arquivos relacionados

- `src/routes/app.faturamento.tsx` — página e cálculos.
- `src/components/faturamento/period-calendar.tsx` — mini calendário (carregado sob demanda).
- `src/lib/faturamento-dates.ts` — helpers de data compartilhados.
- `src/components/app-shell.tsx` — link no menu.
- `src/integrations/supabase/types.ts` — tipo da nova coluna.
- `supabase/migrations/20261126000000_employee_commission.sql` — migração.
