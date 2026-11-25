# SELIC-15

Ferramenta interna do **Setor de Licitações e Contratos do CREFITO-15** para organizar processos, contratos, tarefas, designações de gestores e fiscais e o PCA. Os processos oficiais continuam correndo no SEI; o SELIC-15 é para a organização do setor.

Endereço: `https://selic-15.leniogoularte.workers.dev` (protegido por login).

## O que tem

| Aba | Para que serve |
|---|---|
| Painel | Índice de Saúde do setor, sequência sem atrasos, nível da equipe, metas do mês, conquistas e atividade recente |
| Quadro de processos | Kanban por fase (arrastar para mudar a fase) e ficha completa de cada processo |
| Tabela | Todos os processos em linhas, com filtros, ordenação e **exportação para Excel** |
| Contratos | Contratos ordenados pela vigência mais próxima |
| Linha do tempo | Vigência restante de cada contrato assinado e a janela de 120 dias para renovar |
| Calendário | Prazos de tarefas, fins de vigência, início das janelas de renovação e agenda do setor |
| Tarefas da equipe | Tarefas por responsável, com histórico de mudanças de prazo |
| Gestores e fiscais | Quem acompanha cada processo e o que está sem designação |
| Painel do PCA | Previsto × realizado, por setor, dependências do COFFITO e o que foi feito fora do plano |

## Como funciona

- **Cloudflare Worker** (`src/worker.js`) serve a página e a API. A página, as imagens e a biblioteca de Excel vão embutidas no próprio Worker.
- **Cloudflare D1** (banco `selic-15`) guarda os dados. O esquema está em `schema.sql`.
- **Cloudflare Access** faz o login: só e-mails autorizados entram, com um código enviado ao próprio e-mail. O Worker confere a assinatura do login em toda requisição. Sem o Access configurado, o sistema fica **bloqueado**.
- Uma tarefa agendada fotografa os indicadores todo dia às 23h50 (horário de Brasília), para a tendência e as sequências do painel.

**Os dados não ficam neste repositório**, que é público. Eles estão só no banco D1.

## Gamificação

Toda a pontuação é calculada no servidor.

| Ação | Pontos |
|---|---|
| Tarefa concluída no prazo | 10 |
| Tarefa concluída com atraso | 4 |
| Pendência resolvida | 8 |
| Contrato atualizado | 5 |
| Processo avançou de fase, ou processo cadastrado | 3 |
| Andamento registrado, ou evento na agenda | 2 |
| Ficha atualizada, ou tarefa criada | 1 |

- Andamentos e edições pontuam até 15 vezes por pessoa por dia.
- Concluir e reabrir a mesma tarefa não pontua de novo.
- **Índice de Saúde (0 a 100)**:
  - 30% contratos com vigência em dia;
  - 30% tarefas dentro do prazo;
  - 20% pendências resolvidas;
  - 20% processos ativos com gestor e fiscal.
- **Faixas**: Atenção (abaixo de 50), Em evolução (50 a 74), Bom (75 a 89), Exemplar (90 ou mais).
- **Níveis da equipe**: 100, 250, 500, 1.000, 2.000, 4.000 e 8.000 pontos.

## Ativar o login (Cloudflare Access)

1. No painel da Cloudflare, abra **Workers e Pages → selic-15 → Settings → Domains & Routes**.
2. Na linha **workers.dev**, clique em **Enable Cloudflare Access**. Na primeira vez, a Cloudflare pede para criar a organização Zero Trust: escolha um nome de equipe (ex.: `crefito15`) e o plano **Free**.
3. Em **Zero Trust → Access → Applications**, abra a aplicação criada para o `selic-15`. Em **Policies**, deixe a regra **Allow** com **Include → Emails** e liste os e-mails do setor.
4. Na mesma aplicação, copie o **Application Audience (AUD) Tag**. Anote também o domínio da equipe (`<nome>.cloudflareaccess.com`).
5. Preencha `ACCESS_TEAM_DOMAIN` e `ACCESS_AUD` em `wrangler.jsonc` e publique de novo (`npm run deploy`).

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
