# Imagem do AssinaBot. Os dados (banco SQLite e certificado) ficam em /app/data: monte um volume ali.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY tsconfig.json ./

ENV PORT=3000 DATABASE_PATH=/app/data/assinabot.db CERTIFICATE_PATH=/app/data/certificado.p12
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "tsx", "src/index.ts"]
