# SELIC-15

Ferramenta interna do **Setor de Licitações e Contratos do CREFITO-15** para organizar processos, contratos, tarefas, designações de gestores e fiscais e o PCA. Os processos oficiais continuam correndo no SEI; o SELIC-15 é para a organização do setor.

Endereço: `https://selic-15.leniogoularte.workers.dev` (protegido por login).

## O que tem

| Aba | Para que serve |
|---|---|
| Painel | Índice de Saúde do setor, alertas do dia, próximos 7 dias e atividade recente |
| Indicadores | Indicadores do setor com faixas e variação e gráficos por coluna, urgência, responsável e vigência |
| Fluxo de processos | Kanban com colunas configuráveis, arrastar para mudar de coluna, urgência por cor (baixa verde, média amarela, urgente vermelha) e ficha completa |
| Tabela | Todos os processos em linhas, com filtros, ordenação e exportação dos processos filtrados |
| Contratos | Contratos ordenados pela vigência mais próxima |
| Linha do tempo | Vigência restante de cada contrato assinado e a janela de 120 dias para renovar |
| Calendário | Prazos de tarefas, fins de vigência, início das janelas de renovação e agenda do setor |
| Tarefas da equipe | Tarefas por responsável, com histórico de mudanças de prazo |
| Gestores e fiscais | Gráfico de processos ativos por pessoa, pizzas com o % dos contratos de cada gestor e fiscal, quem acompanha cada processo e o que está sem designação |
| Parcerias | Tabela de parceiros: credenciamentos, convênios e acordos, com vigência e contato |
| Painel do PCA | Previsto × realizado, por setor, dependências do COFFITO e o que foi feito fora do plano |
| Configurações | Só administradores: colunas do fluxo, usuários e níveis de acesso, equipe, setores demandantes, parâmetros e relatório diário |

## Como funciona

- **Cloudflare Worker** (`src/worker.js`) serve a página e a API. A página, as imagens e a biblioteca de Excel vão embutidas no próprio Worker.
- **Cloudflare D1** (banco `selic-15`) guarda os dados. O esquema está em `schema.sql`.
- **Cloudflare Access** faz o login: só e-mails autorizados entram, com um código enviado ao próprio e-mail. O Worker confere a assinatura do login em toda requisição. Sem o Access configurado, o sistema fica **bloqueado**.
- Uma tarefa agendada fotografa os indicadores todo dia às 23h50 (horário de Brasília), usada na variação dos indicadores.

**Os dados não ficam neste repositório**, que é público. Eles estão só no banco D1.

## Exportar para Excel

O botão **Exportar tudo (Excel)**, no topo, baixa uma planilha com todas as informações do sistema, em abas:
- Processos, Contratos, Tarefas, Designações, Parcerias e Agenda;
- Equipe e Histórico (todos os registros de processos e tarefas, com data, hora e autor);
- Indicadores e uma aba "Sobre" com a data de geração.

A aba Tabela tem a sua própria exportação, que leva só os processos filtrados na tela.

## Relatório diário por e-mail

Todo dia às 20h (Brasília), o SELIC-15 gera a planilha completa e envia por e-mail, com um resumo do dia no corpo da mensagem. Os destinatários, o remetente e o liga/desliga ficam em **Configurações → Relatório diário**, onde também há um botão para enviar um teste na hora.

O envio usa o **Brevo** (gratuito até 300 e-mails por dia). A chave fica como segredo `BREVO_API_KEY` no Worker, cadastrada pelo painel da Cloudflare e nunca neste repositório. O remetente precisa estar verificado no Brevo.

## Níveis de acesso

| Nível | O que pode fazer |
|---|---|
| Administrador | Tudo, inclusive a aba Configurações (colunas, usuários, equipe, parâmetros) |
| Editor | Cria e altera processos, contratos, tarefas, agenda e parcerias |
| Leitor | Só consulta |

As permissões são conferidas no servidor.

**Novos usuários:** o login da Cloudflare libera o domínio institucional inteiro (e-mails terminados em `@<domínio do CREFITO>`). Quem entra pela primeira vez fica **aguardando aprovação** e não vê nenhum dado. O administrador aprova como Editor ou Leitor, ou recusa, em Configurações → Usuários e acesso. O Painel avisa quando há alguém esperando. Também dá para cadastrar o e-mail antes, já com o nível, para a pessoa entrar direto.

## Painel

- **Índice de Saúde (0 a 100)**:
  - 30% contratos com vigência em dia;
  - 30% tarefas dentro do prazo;
  - 20% pendências resolvidas;
  - 20% processos ativos com gestor e fiscal.
- **Faixas do índice**: Atenção (abaixo de 50), Em evolução (50 a 74), Bom (75 a 89), Exemplar (90 ou mais).
- **Próximos 7 dias**: prazos de tarefas, eventos da agenda e fins de vigência.
- **Atividade recente**: quem fez o quê no sistema.

## Ativar o login (Cloudflare Access)

1. No painel da Cloudflare, abra **Workers e Pages → selic-15 → Settings → Domains & Routes**.
2. Na linha **workers.dev**, clique em **Enable Cloudflare Access**. Na primeira vez, a Cloudflare pede para criar a organização Zero Trust: escolha um nome de equipe (ex.: `crefito15`) e o plano **Free**.
3. Em **Zero Trust → Access → Applications**, abra a aplicação criada para o `selic-15`. Em **Policies**, deixe a regra **Allow** com **Include → Emails** e liste os e-mails do setor.
4. Na mesma aplicação, copie o **Application Audience (AUD) Tag**. Anote também o domínio da equipe (`<nome>.cloudflareaccess.com`).
5. Preencha `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` em `wrangler.jsonc` e publique de novo (`npm run deploy`).

Situação atual: equipe `selic15`, aplicação protegendo todo o tráfego do `selic-15`, login por código no e-mail (One-time PIN). Para dar acesso a alguém, inclua o e-mail na política da aplicação, em Zero Trust → Access → Applications.

## Desenvolvimento

```bash
npm install
```

```bash
npx wrangler d1 execute selic-15 --local --file=schema.sql
```

```bash
npx wrangler dev --var DEV_SEM_LOGIN:1
```

`DEV_SEM_LOGIN` libera o acesso **só no ambiente local**. Nunca coloque essa variável na configuração publicada.

```bash
npm run deploy
```

Identidade visual conforme o manual de marca do Sistema COFFITO/CREFITOs: verdes #132717, #48AE75 e #92CFA0; tipografia Acumin Pro, com Archivo como alternativa; logo no fundo branco, na versão reduzida em tamanhos pequenos.
