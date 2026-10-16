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

O site é publicado no Cloudflare, conectado a este repositório. Configuração do projeto no painel do Cloudflare:

- **Framework:** Astro
- **Comando de build:** `npm run build`
- **Pasta de saída:** `dist`
- **Versão do Node:** 22 (variável `NODE_VERSION=22`, se o painel pedir)
- **Domínio:** `quebragalho.app` em *Custom domains*

Cabeçalhos HTTP (cache e segurança) ficam em `public/_headers`.

Depois da aprovação no AdSense, coloque o ID `ca-pub-...` em `src/config.ts` (`adsenseClient`) e crie `public/ads.txt`.
