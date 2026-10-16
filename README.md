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

O site é publicado no GitHub Pages pelo workflow `.github/workflows/deploy.yml` a cada push na branch `main`.

Configuração única:
1. No GitHub: **Settings → Pages → Source: GitHub Actions**.
2. Em **Settings → Pages → Custom domain**, coloque `quebragalho.app` e marque **Enforce HTTPS**.
3. No registrador do domínio, crie os registros DNS que o GitHub indicar (4 registros `A` apontando para o GitHub Pages).

Depois da aprovação no AdSense, coloque o ID `ca-pub-...` em `src/config.ts` (`adsenseClient`) e crie `public/ads.txt`.
