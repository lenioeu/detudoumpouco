# Quebragalho (oquebragalho.app)

Site de ferramentas grátis em português do Brasil, que vive de anúncios (Google AdSense).
Todas as ferramentas rodam **no navegador do usuário**: não existe servidor nosso.

## Comandos

- `npm install`: instala as dependências
- `npm run dev`: servidor local em http://localhost:4321 (mostra os espaços de anúncio tracejados)
- `npm run build`: gera o site em `dist/`. **Precisa passar sem erro antes de qualquer commit.**
- `npm run preview`: serve o `dist/` para testar a versão final

Não use `astro check`: o pacote não está instalado e o comando trava pedindo confirmação.

## Estrutura

```
src/config.ts                  nome, URL, e-mail, ID do AdSense
src/data/secoes.ts             as seções do menu (ordem = ordem do menu)
src/data/ferramentas/<secao>.ts lista de ferramentas da seção, em ordem de prioridade
src/data/index.ts              junta tudo; não precisa editar
src/layouts/Ferramenta.astro   molde de TODA página de ferramenta
src/components/                Header, Footer, AdSlot, AvisoCookies, SoltarArquivos, CartaoFerramenta
src/lib/                       funções puras (cálculos, formatação) usadas pelas páginas
src/pages/<secao>/<slug>.astro uma página por ferramenta
src/pages/[secao]/index.astro  página de cada seção, gerada sozinha
```

Uma ferramenta só aparece no site (menu, home, seção, sitemap) quando está com
`status: 'pronta'` no arquivo da sua seção. Seções sem ferramenta pronta ficam escondidas.

Exemplos completos para copiar o padrão:
- calculadora: `src/pages/calculadoras/porcentagem.astro` + `src/lib/porcentagem.ts`
- ferramenta de arquivo: `src/pages/imagem/comprimir-imagem.astro` + `SoltarArquivos`

## Como criar uma ferramenta (checklist)

1. Escolha a próxima `planejada` do arquivo `src/data/ferramentas/<secao>.ts` (a ordem é a prioridade).
2. Crie `src/pages/<secao>/<slug>.astro` usando o layout `Ferramenta`, com:
   - `titulo` (H1) com a busca principal, ex.: "Juntar PDF"
   - `tituloSeo` de até 60 caracteres, ex.: "Juntar PDF online grátis e sem enviar arquivos"
   - `descricao` de 120 a 160 caracteres
   - `passos`: 3 a 5 passos de "Como usar"
   - `perguntas`: 4 a 6 perguntas frequentes, com o jeito que as pessoas buscam no Google
   - slot `texto`: pelo menos 250 palavras **originais** (o que é, exemplos, dicas). Nada de texto genérico.
3. A lógica de cálculo vai em `src/lib/<nome>.ts` como funções puras.
4. A ferramenta abre já funcionando com um exemplo preenchido (calculadoras) ou com a área de arquivo pronta.
5. Mude o `status` para `'pronta'`.
6. `npm run build` e teste no navegador (veja "Testes").

## Regras

- **Nada sai do aparelho do usuário.** Proibido enviar arquivos ou dados digitados para servidores.
  Exceção: a seção Consultas chama APIs públicas gratuitas (ViaCEP, AwesomeAPI, BrasilAPI), e a página diz qual.
- **Bibliotecas pesadas** (pdf-lib, pdfjs-dist, ffmpeg.wasm, tesseract.js, modelos de IA) são carregadas
  com `await import(...)` só quando o usuário usa a ferramenta, para a página abrir rápido.
  Instale com versão exata: `npm install pacote@1.2.3 --save-exact`.
- **Hospedagem: Cloudflare.** Cabeçalhos HTTP ficam em `public/_headers`. Comece pelas versões
  single-thread de ffmpeg.wasm e afins. A versão multi-thread exige COOP/COEP (`SharedArrayBuffer`), e o COEP
  pode impedir os anúncios de aparecer na página. Só ative, e só no caminho da ferramenta (ex.: `/video/*`),
  com aprovação do dono do site.
- **Visual:** use só os tokens de `src/styles/global.css` (`--bg`, `--surface`, `--fg`, `--brand`...) e as classes
  prontas (`.btn`, `.btn-sec`, `.campo`, `.resultado`, `.erro`, `.stack`). Nada de cor solta: o site tem modo escuro.
  Tem que funcionar em celular de 360px sem rolagem lateral.
- **Movimento** (inspirado no Squoosh): use só `transform` e `opacity`, com as curvas `--mola` (elástica, para
  botões e cartões) e `--suave` (para entradas e trocas). Durações de 0,15 s a 0,35 s. A troca entre páginas é a
  View Transition nativa do navegador (já configurada no CSS, sem JavaScript); não instale biblioteca de animação
  nem o `ClientRouter` do Astro. Todo movimento novo precisa respeitar `prefers-reduced-motion` (o CSS global já
  desliga tudo nesse caso).
- **Desempenho (o Google mede):** nada de imagem grande, fonte nova ou script de terceiros no carregamento.
  A fonte Archivo é servida de `public/fonts/`. Reserve espaço para o que aparece depois (evita "pulos" de layout).
- **Componentes de arquivo:** `SoltarArquivos` (arrastar, escolher ou colar) e `Comparar` (antes e depois com
  divisor arrastável) para toda ferramenta que transforma imagem.
- **Ícones:** `Icone.astro` tem um ícone por seção; não use emoji como ícone.
- **Texto:** português do Brasil, frases curtas, tom de quem ajuda. Números no padrão brasileiro
  (`formatar()` e `lerNumero()` de `src/lib/numeros.ts`). Para baixar, use links `<a download>`.
- **AdSense:** não coloque anúncio dentro da área da ferramenta nem perto de botões. O layout já posiciona
  os dois espaços de anúncio. Nada de conteúdo enganoso, adulto, de pirataria ou que gere documentos falsos
  (por isso não há gerador de CPF nem baixador de vídeo do YouTube/Instagram).
- **Saúde:** citar a fonte (Ministério da Saúde, OMS, sociedades médicas) e avisar que não substitui consulta.

## Trabalho em equipe (vários agentes)

Cada seção tem um agente em `.claude/agents/secao-<nome>.md`. Para não haver conflito:

- Um agente mexe **só** em: `src/pages/<sua seção>/`, `src/data/ferramentas/<sua seção>.ts` e arquivos novos em
  `src/lib/` ou `src/components/` criados por ele.
- **Arquivos compartilhados** (`src/layouts/`, componentes existentes, `global.css`, `config.ts`, `secoes.ts`,
  `package.json`) só mudam se for indispensável, com mudança mínima, e o motivo vai na mensagem do commit.
  Adicionar uma dependência ao `package.json` é permitido.
- Commits pequenos, um por ferramenta: `calculadoras: juros compostos`.

## Testes

Depois do `npm run build`, rode `npm run preview` e teste com Playwright (o Chromium já está instalado em
`/opt/pw-browsers`; não rode `playwright install`). Confira: a conta dá o resultado certo com 2 ou 3 exemplos,
nenhum erro no console, sem rolagem lateral em 390px de largura. Para ferramentas de arquivo,
gere um arquivo de teste no próprio script.
