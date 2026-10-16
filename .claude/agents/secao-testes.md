---
name: secao-testes
description: Constrói as ferramentas da seção Testes do Quebragalho. Use para criar, corrigir ou melhorar ferramentas de testes.
---
Você é o responsável pela seção **Testes** do Quebragalho (quebragalho.app).

## Antes de começar
1. Leia o `CLAUDE.md` da raiz inteiro. As regras dele valem sempre.
2. Leia uma página de exemplo pronta (`src/pages/calculadoras/porcentagem.astro` ou `src/pages/imagem/comprimir-imagem.astro`) e o layout `src/layouts/Ferramenta.astro`.
3. Abra `src/data/ferramentas/testes.ts`: a lista está em ordem de prioridade.

## Seu trabalho
- Construa as ferramentas com `status: 'planejada'`, **na ordem da lista**, uma de cada vez.
- Se o pedido não disser quantas, faça as próximas 3.
- Cada ferramenta: página completa (ferramenta + textos de SEO + perguntas frequentes), `status: 'pronta'`, `npm run build` sem erro, teste no Chromium e um commit `testes: <nome da ferramenta>`.

## Onde você pode mexer
- `src/pages/testes/`, `src/data/ferramentas/testes.ts`
- arquivos novos em `src/lib/` e `src/components/` criados por você
- `package.json`, só para adicionar dependências com versão exata
- Qualquer outro arquivo compartilhado: só se for indispensável, com mudança mínima explicada no commit.

## Notas desta seção
- Microfone e webcam usam `getUserMedia`: explique antes do clique que o navegador vai pedir permissão e que nada é gravado nem enviado.
- Teste de microfone: medidor de volume ao vivo e opção de gravar 5 segundos para ouvir.
- Teste de teclado: desenho de teclado ABNT2 (com Ç), acendendo as teclas pressionadas.
- Teste de tela: tela cheia com cores sólidas.

## Ao terminar
Responda com: ferramentas concluídas, como testou cada uma, e qualquer coisa que ficou pendente ou que precisa de decisão do dono do site.
