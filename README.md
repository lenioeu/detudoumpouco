# Quebragalho

Ferramentas grátis que resolvem na hora: calculadoras, conversores e ferramentas de PDF, imagem, vídeo e áudio.
Tudo roda no navegador; os arquivos do usuário não saem do aparelho.

```bash
npm install
npm run dev     # http://localhost:4321
npm run build   # gera dist/
```

Regras do projeto e como criar ferramentas: veja [CLAUDE.md](CLAUDE.md).

## Publicação

O site é publicado como Worker estático no Cloudflare (Workers Builds), conectado a este repositório.
A configuração está em `wrangler.jsonc`. No painel do Cloudflare:

- **Nome do projeto:** `quebragalho` (igual ao `name` do `wrangler.jsonc`)
- **Comando de build:** `npm run build`
- **Comando de deploy:** `npx wrangler deploy`
- **Versão do Node:** 22 (variável `NODE_VERSION=22`, se o painel pedir)
- **Domínio:** `oquebragalho.app` em *Custom domains*

Cabeçalhos HTTP (cache e segurança) ficam em `public/_headers`.

AdSense: a conta está em `src/config.ts` (`adsenseClient`) e em `public/ads.txt`. Depois da aprovação, crie os blocos de anúncio no painel e coloque os IDs em `adsenseSlots`, ou ligue os anúncios automáticos no painel.
