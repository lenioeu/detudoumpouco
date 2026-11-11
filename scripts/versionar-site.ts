/**
 * Põe um ?v= com o hash do conteúdo em cada arquivo do site citado pelas páginas e pelo CSS
 * (ex.: /estilo.css?v=7ce671b5, /exemplo/certificado-150dpi.webp?v=1a2b3c4d). Quando um arquivo
 * muda, o endereço muda e o navegador baixa o novo, em vez de mostrar a cópia antiga guardada
 * em cache. Rode antes de publicar qualquer mudança no site.
 *
 *   npx tsx scripts/versionar-site.ts
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const pasta = new URL("../site/", import.meta.url);
const hash = (arquivo: string) => createHash("sha256").update(readFileSync(new URL(arquivo, pasta))).digest("hex").slice(0, 8);

// Endereços que começam com "/" e apontam para um arquivo do site (não para páginas .html)
const REFERENCIA = /(["'(\s,])\/([A-Za-z0-9_./-]+\.(?:css|js|svg|webp|png|jpg|woff2|ttf))(?:\?v=[0-9a-f]+)?(?=["')\s,])/g;
const versionar = (texto: string) =>
  texto.replace(REFERENCIA, (inteiro, antes: string, caminho: string) =>
    existsSync(new URL(caminho, pasta)) ? `${antes}/${caminho}?v=${hash(caminho)}` : inteiro,
  );

const atualizar = (arquivo: string) => {
  const original = readFileSync(new URL(arquivo, pasta), "utf8");
  const novo = versionar(original);
  if (novo !== original) writeFileSync(new URL(arquivo, pasta), novo);
  console.log(`${arquivo}: ${novo === original ? "já estava em dia" : "atualizado"}`);
};

// Primeiro o CSS (as imagens que ele cita entram no hash dele), depois as páginas
atualizar("estilo.css");
for (const pagina of readdirSync(pasta).filter((n) => n.endsWith(".html"))) atualizar(pagina);
console.log({ "estilo.css": hash("estilo.css"), "tema.js": hash("tema.js") });
