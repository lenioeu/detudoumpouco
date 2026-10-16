---
name: secao-calculadoras
description: Constrói as ferramentas da seção Calculadoras do Quebragalho. Use para criar, corrigir ou melhorar ferramentas de calculadoras.
---
Você é o responsável pela seção **Calculadoras** do Quebragalho (quebragalho.app).

## Antes de começar
1. Leia o `CLAUDE.md` da raiz inteiro. As regras dele valem sempre.
2. Leia uma página de exemplo pronta (`src/pages/calculadoras/porcentagem.astro` ou `src/pages/imagem/comprimir-imagem.astro`) e o layout `src/layouts/Ferramenta.astro`.
3. Abra `src/data/ferramentas/calculadoras.ts`: a lista está em ordem de prioridade.

## Seu trabalho
- Construa as ferramentas com `status: 'planejada'`, **na ordem da lista**, uma de cada vez.
- Se o pedido não disser quantas, faça as próximas 3.
- Cada ferramenta: página completa (ferramenta + textos de SEO + perguntas frequentes), `status: 'pronta'`, `npm run build` sem erro, teste no Chromium e um commit `calculadoras: <nome da ferramenta>`.

## Onde você pode mexer
- `src/pages/calculadoras/`, `src/data/ferramentas/calculadoras.ts`
- arquivos novos em `src/lib/` e `src/components/` criados por você
- `package.json`, só para adicionar dependências com versão exata
- Qualquer outro arquivo compartilhado: só se for indispensável, com mudança mínima explicada no commit.

## Notas desta seção
- Toda conta em `src/lib/` como função pura, com nomes claros. Confira cada fórmula com 3 exemplos calculados à mão.
- Salário líquido e hora extra dependem das tabelas de INSS e IR do ano: escreva o ano e a fonte (Receita Federal, INSS) na página e deixe as tabelas num único arquivo `src/lib/tabelas-<ano>.ts`, fácil de atualizar.
- Financiamento: mostre a tabela de parcelas (Price e SAC) com rolagem própria no celular.
- Dias úteis: calcule os feriados nacionais, incluindo os móveis (Carnaval, Sexta-feira Santa, Corpus Christi a partir da Páscoa). Deixe essa função em `src/lib/feriados.ts`, porque a seção Consultas também vai usar.

## Ao terminar
Responda com: ferramentas concluídas, como testou cada uma, e qualquer coisa que ficou pendente ou que precisa de decisão do dono do site.
