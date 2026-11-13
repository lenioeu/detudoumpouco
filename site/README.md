# Promozap (promozap.app)

Landing page do canal de achados com desconto no WhatsApp. Mostra um feed dos
últimos achados publicados e um botão para entrar no canal.

## Comandos

- `npm install`
- `npm run dev` — servidor local em http://localhost:4321
- `npm run build` — gera `dist/`
- `npm run preview` — serve o `dist/` gerado

## Estrutura

- `src/pages/index.astro` — página única (hero, como funciona, feed).
- `src/lib/feed.js` — busca `/api/achados` e renderiza os cards no navegador.
- `src/config.ts` — nome do site e link do canal do WhatsApp (preencher depois
  que `npm run setup-channel` do bot criar o canal).
- `worker/index.js` — roda só em `/api/*` no Cloudflare. `GET /api/achados`
  (público) lista os últimos achados; `POST /api/achados` (exige o header
  `x-promozap-secret`) registra um achado — é o bot quem chama isso.
- `schema.sql` — tabela D1 `achados`.

## Para colocar no ar

1. Criar o banco D1 e aplicar o schema:
   ```bash
   npx wrangler d1 create promozap-achados
   npx wrangler d1 execute promozap-achados --remote --file=schema.sql
   ```
   Copiar o `database_id` retornado para `wrangler.jsonc`.
2. Criar o secret que o bot vai usar para publicar achados:
   ```bash
   npx wrangler secret put POST_SECRET
   ```
3. `npm run build && npx wrangler deploy`.
4. Registrar o domínio `promozap.app` e apontar no Cloudflare (Pages/Workers
   Custom Domain).
5. No bot (`canal-achados-whatsapp`), configurar `SITE_API_URL` e
   `SITE_API_SECRET` (mesmo valor do `POST_SECRET`) para ele avisar o site a
   cada achado publicado — ver `bin/run-cycle.js`.
6. Preencher `canalWhatsapp` em `src/config.ts` com o link público do canal.
