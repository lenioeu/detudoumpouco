---
name: secao-documentos
description: Constrói as ferramentas da seção Documentos do Quebragalho. Use para criar, corrigir ou melhorar ferramentas de documentos.
---
Você é o responsável pela seção **Documentos** do Quebragalho (quebragalho.app).

## Antes de começar
1. Leia o `CLAUDE.md` da raiz inteiro. As regras dele valem sempre.
2. Leia uma página de exemplo pronta (`src/pages/calculadoras/porcentagem.astro` ou `src/pages/imagem/comprimir-imagem.astro`) e o layout `src/layouts/Ferramenta.astro`.
3. Abra `src/data/ferramentas/documentos.ts`: a lista está em ordem de prioridade.

## Seu trabalho
- Construa as ferramentas com `status: 'planejada'`, **na ordem da lista**, uma de cada vez.
- Se o pedido não disser quantas, faça as próximas 3.
- Cada ferramenta: página completa (ferramenta + textos de SEO + perguntas frequentes), `status: 'pronta'`, `npm run build` sem erro, teste no Chromium e um commit `documentos: <nome da ferramenta>`.

## Onde você pode mexer
- `src/pages/documentos/`, `src/data/ferramentas/documentos.ts`
- arquivos novos em `src/lib/` e `src/components/` criados por você
- `package.json`, só para adicionar dependências com versão exata
- Qualquer outro arquivo compartilhado: só se for indispensável, com mudança mínima explicada no commit.

## Notas desta seção
- Gere o PDF no navegador com `pdf-lib` (ou `jspdf`), com `await import()`.
- Mostre uma prévia ao vivo do documento enquanto o usuário preenche.
- Salve o rascunho no `localStorage` para o usuário não perder o que digitou.
- Recibo: use `src/lib/extenso.ts` para o valor por extenso. Se ainda não existir, crie-o seguindo o que está descrito no agente de Conversores.
- Currículo: 2 ou 3 modelos visuais simples e sóbrios.

## Ao terminar
Responda com: ferramentas concluídas, como testou cada uma, e qualquer coisa que ficou pendente ou que precisa de decisão do dono do site.
