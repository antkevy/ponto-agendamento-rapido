# Agendaí

Crie um SaaS de agendamento online chamado "Agendaí" (estilo Calendly/Simplybook) com as seguintes características:

## Visão geral
"Agendaí" é uma plataforma onde profissionais e empresas de qualquer segmento (salões, barbearias, clínicas, consultorias, personal trainers, pet shops, oficinas etc) podem gerenciar sua agenda e permitir que clientes marquem horários online, sem necessidade de contato manual. Não trave o design em um nicho específico — mantenha visual neutro, profissional e elegante, mas permita customização (nome do negócio, logo, cor de destaque) para cada profissional se sentir "dono" da própria página.

## Autenticação
- Cadastro/login de "profissionais" (donos de conta) com email e senha (usar Supabase Auth)
- Cada profissional tem seu próprio painel e uma página pública de agendamento no formato /p/slug (ex: agendai.com.br/p/joao-barbearia)
- Clientes finais NÃO precisam criar conta — apenas preenchem nome, telefone/email para agendar

## Painel do profissional (área logada)
- Dashboard com resumo: agendamentos de hoje, próximos, total do mês
- Cadastro de serviços: nome, duração (em minutos), preço, descrição
- Configuração de horários de atendimento: dias da semana, horário de início/fim, intervalos de almoço, folgas
- Bloqueio manual de datas/horários (férias, imprevistos)
- Lista de agendamentos com filtros (hoje, semana, mês, status: confirmado/cancelado/concluído)
- Cancelar ou remarcar agendamentos
- Configurações da página pública: nome do negócio, logo, cor principal, descrição, endereço

## Página pública de agendamento (para o cliente)
- Mostra os serviços disponíveis com duração e preço
- Cliente escolhe o serviço, depois vê um calendário com dias e horários disponíveis (já calculando conflitos automaticamente)
- Cliente preenche nome, telefone e email
- Confirmação do agendamento na tela

## Regras de negócio importantes
- Não pode haver dois agendamentos no mesmo horário para o mesmo profissional
- O sistema deve calcular automaticamente os horários livres com base na duração do serviço escolhido
- Horários passados não podem ser selecionados
- Cancelamento deve liberar o horário automaticamente

## Banco de dados (Supabase)
Estruture tabelas para: profissionais, serviços, horários de atendimento, agendamentos, bloqueios de agenda

## Identidade visual do "Agendaí"
- Nome tem tom brasileiro, leve e direto — o design deve refletir isso: acolhedor, confiável, mas moderno (não infantil)
- Evite o visual genérico de "app feito por IA".
- Use esta paleta de cores sólida (sem gradientes):
  - Cor principal: #0C4A6E
  - Cor de destaque/CTA (botões, links, elementos interativos): #0284C7
  - Fundo: #FFFFFF
  - Texto principal: #0F172A
  - Texto secundário: #64748B
  - Bordas e divisores: #E2E8F0
- Tipografia com personalidade: fonte de exibição com um pouco de caráter para o logo/títulos (arredondada mas confiante), combinada com uma fonte legível e neutra para o texto corrido
- Hierarquia visual clara: títulos grandes e confiantes, bastante espaço em branco
- Detalhes que dão acabamento: bordas sutis, micro-interações (hover states), transições suaves
- Evite emojis como ícones e ilustrações genéricas de banco de imagens
- Botões e CTAs com peso visual real
- O objetivo é parecer um produto de marca real e brasileira, com identidade própria — não um template

## Animações e micro-interações
Use animações com moderação para dar sensação de produto polido, sem exagerar (nada de parallax pesado ou efeitos chamativos de landing page genérica):
- Transições suaves entre etapas do agendamento (ex: ao escolher o serviço, o calendário de horários desliza/aparece com fade suave)
- Micro-interações em botões: leve escala ou mudança de cor sutil no hover/toque
- Feedback de confirmação: uma animação simples (ex: ícone de check com leve escala) ao concluir o agendamento — esse é um momento de confiança, merece um toque especial
- Loading states elegantes: usar skeleton loading (blocos que pulsam suavemente) ao carregar horários disponíveis, em vez de spinner genérico
- Fade-in sutil de elementos ao rolar a página institucional/pública
- Todas as animações devem ser rápidas (150–300ms) para não atrasar o fluxo de agendamento, especialmente no mobile

## Responsividade e mobile (prioridade alta)
- Mobile-first: a página pública de agendamento será acessada majoritariamente pelo celular — projete primeiro para telas pequenas, depois expanda para desktop
- Botões e áreas de toque com tamanho adequado para dedo (mínimo 44px de altura)
- Calendário e seleção de horários precisam funcionar bem em telas pequenas (evite tabelas apertadas — use grid de horários com scroll ou chips clicáveis)
- Formulário de agendamento deve ser rápido de preencher no celular, com teclado apropriado por campo (telefone abre teclado numérico, email abre com @)
- Painel do profissional também deve ser responsivo, mas pode ter mais densidade de informação em desktop (dashboard) com versão simplificada no mobile
- Teste visual em pelo menos 3 breakpoints: mobile (~375px), tablet (~768px), desktop (~1280px)
- Evite modais grandes no mobile — prefira telas cheias (full-screen) ou bottom sheets para seleção de horário/confirmação

## Extras desejáveis (se possível já incluir)
- Página de "meus agendamentos" para o cliente consultar/cancelar usando telefone/email


Comece pela estrutura do banco de dados no Supabase, depois a autenticação, depois o painel do profissional e por fim a página pública de agendamento.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/92420334-b82f-44bd-9ee6-ce107c888edd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
