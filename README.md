# Canal de achados no WhatsApp

Bot que publica automaticamente produtos com desconto (achados) em um Canal do
WhatsApp, usando [Baileys](https://github.com/WhiskeySockets/Baileys) para
publicar e APIs oficiais de afiliados para encontrar as ofertas.

## Como funciona

A Baileys reimplementa o protocolo do WhatsApp Web (projeto open-source, não é API
oficial da Meta). Isso significa:

- A conta usada precisa ser uma conta de WhatsApp real (recomenda-se um número
  dedicado só para o bot, não o seu número pessoal).
- Usar automação por fora do app oficial viola os Termos de Serviço do WhatsApp;
  o número pode ser banido. Use com moderação (nada de envio em massa) e por
  sua conta e risco.

Os achados vêm de fontes oficiais (nenhum scraping de site de loja):

- **Lomadee** — catálogo próprio via `/affiliate/products` (compara `listPrice`
  com `price`), e gera o link de afiliado sob demanda com
  `/affiliate/shortener/url`, só para os achados que vão ser publicados.
- **Mercado Livre** — busca via API oficial (`/sites/MLB/search`), comparando
  `price` com `original_price` de cada item.
- **Awin** — rede de afiliados que cobre Americanas, Kabum e outras grandes
  lojas; os achados vêm do feed de produtos (`price` vs `sale_price`) de cada
  anunciante aprovado.

Lojas com proteção anti-bot forte (Magazine Luiza, Netshoes, Shopee, Amazon)
não têm fonte confiável sem violar as defesas delas — ficam de fora até terem
um caminho oficial equivalente.

## Passo 1 — Vincular a conta do WhatsApp

```bash
npm run connect -- 5511999999999
```

(troque pelo número com DDI, sem `+` e sem espaços). Vai aparecer um **código de
pareamento** no terminal — digite-o no celular em
*WhatsApp > Configurações > Dispositivos conectados > Conectar dispositivo >
Vincular com número de telefone*.

As credenciais da sessão ficam salvas em `auth/` (não commitado — é informação
sensível, equivale a estar logado na conta).

## Passo 2 — Criar o canal

```bash
npm run setup-channel -- "Achados com desconto" "Descrição opcional"
```

Cria o canal e salva o JID em `channel.json`.

## Passo 3 — Configurar as fontes de achados

Copie `.env.example` para `.env` e preencha as credenciais:

### Lomadee

1. No painel da sua conta Lomadee, vá em **Credenciais de API** e crie uma
   chave nova com os escopos `products:read` e `shortener:write`.
2. A chave completa só aparece uma vez — copie na hora.
3. Preencha `LOMADEE_API_KEY` no `.env` (e `LOMADEE_SEARCH` se quiser filtrar
   o catálogo por um termo).

Essa fonte já cobre catálogo **e** link de afiliado sozinha — não depende do
Mercado Livre nem da Awin pra funcionar.

### Mercado Livre

1. Crie uma conta e uma aplicação em
   [developers.mercadolivre.com.br](https://developers.mercadolivre.com.br/pt-br/crie-uma-aplicacao-no-mercado-livre) —
   você recebe `Client_Id` e `Client_Secret`.
2. Faça o fluxo de autorização uma vez (abra no navegador, logado na conta ML,
   trocando `CLIENT_ID` e `REDIRECT_URI` pelos seus):
   `https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=CLIENT_ID&redirect_uri=REDIRECT_URI`
3. Troque o `code` retornado por um `refresh_token` (uma chamada manual a
   `POST https://api.mercadolibre.com/oauth/token` com `grant_type=authorization_code`).
4. Preencha `MERCADOLIVRE_CLIENT_ID`, `MERCADOLIVRE_CLIENT_SECRET`,
   `MERCADOLIVRE_REFRESH_TOKEN` e `MERCADOLIVRE_QUERIES` (termos de busca,
   separados por vírgula) no `.env`.

### Awin

1. Cadastre-se como publisher em [awin.com](https://www.awin.com).
2. Peça aprovação nos programas das lojas que quiser (ex: Americanas, Kabum) —
   tem espera de aprovação, cada loja decide.
3. Gere um token OAuth2 em **Toolbox > API Credentials** no painel da Awin.
4. Preencha `AWIN_PUBLISHER_ID`, `AWIN_ACCESS_TOKEN` e `AWIN_ADVERTISERS`
   (`id:Nome` separados por vírgula, ex: `1234:Americanas,5678:Kabum`) no `.env`.

## Passo 4 — Rodar

```bash
npm run cycle    # roda um ciclo (coleta + publica) e encerra
npm run daemon   # fica rodando, publicando a cada CRON_SCHEDULE (padrão: 2h em 2h)
```

`MIN_DISCOUNT_PCT` (padrão 30) e `MAX_POSTS_PER_CYCLE` (padrão 3) controlam o
critério de publicação. Achados já publicados ficam registrados em
`data/posted.json` por 30 dias, para não repetir.

## Publicar um achado manualmente

```bash
npm run post -- "Texto do achado a publicar"
```

## Rodando em produção

O `npm run daemon` precisa ficar de pé continuamente (mantém a sessão do
WhatsApp aberta e publica nos horários do cron). Isso não funciona dentro de
uma sessão temporária do Claude Code — precisa de um servidor próprio (VPS)
com um processo gerenciado (ex: `systemd` ou `pm2`) rodando `npm run daemon`.
