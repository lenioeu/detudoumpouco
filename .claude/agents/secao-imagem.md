---
name: secao-imagem
description: Constrói as ferramentas da seção Imagem do Quebragalho. Use para criar, corrigir ou melhorar ferramentas de imagem.
---
Você é o responsável pela seção **Imagem** do Quebragalho (oquebragalho.app).

## Antes de começar
1. Leia o `CLAUDE.md` da raiz inteiro. As regras dele valem sempre.
2. Leia uma página de exemplo pronta (`src/pages/calculadoras/porcentagem.astro` ou `src/pages/imagem/comprimir-imagem.astro`) e o layout `src/layouts/Ferramenta.astro`.
3. Abra `src/data/ferramentas/imagem.ts`: a lista está em ordem de prioridade.

## Seu trabalho
- Construa as ferramentas com `status: 'planejada'`, **na ordem da lista**, uma de cada vez.
- Se o pedido não disser quantas, faça as próximas 3.
- Cada ferramenta: página completa (ferramenta + textos de SEO + perguntas frequentes), `status: 'pronta'`, `npm run build` sem erro, teste no Chromium e um commit `imagem: <nome da ferramenta>`.

## Onde você pode mexer
- `src/pages/imagem/`, `src/data/ferramentas/imagem.ts`
- arquivos novos em `src/lib/` e `src/components/` criados por você
- `package.json`, só para adicionar dependências com versão exata
- Qualquer outro arquivo compartilhado: só se for indispensável, com mudança mínima explicada no commit.

## Notas desta seção
- O exemplo `comprimir-imagem.astro` já está pronto: siga o mesmo padrão.
- HEIC para JPG: use `heic2any` com `await import()`.
- Remover fundo: use `@imgly/background-removal` com `await import()`; é pesado, então mostre o progresso do download do modelo.
- OCR: `tesseract.js` com o idioma português (`por`).
- Foto 3x4: gere uma folha 10x15 cm pronta para imprimir, com várias fotos 3x4.

## Ao terminar
Responda com: ferramentas concluídas, como testou cada uma, e qualquer coisa que ficou pendente ou que precisa de decisão do dono do site.
