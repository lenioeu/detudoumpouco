/**
 * Põe nos links do site um ?v= com o hash de cada CSS/JS (ex.: /estilo.css?v=7ce671b5).
 * Quando o arquivo muda, o endereço muda e o navegador baixa o novo, em vez de juntar
 * a página nova com o estilo antigo guardado em cache. Rode antes de publicar mudanças no site.
 *
 *   npx tsx scripts/versionar-site.ts
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const pasta = new URL("../site/", import.meta.url);
const hash = (arquivo: string) => createHash("sha256").update(readFileSync(new URL(arquivo, pasta))).digest("hex").slice(0, 8);
const versoes = Object.fromEntries(["estilo.css", "tokens.css", "tema.js"].map((a) => [a, hash(a)]));

for (const pagina of readdirSync(pasta).filter((n) => n.endsWith(".html"))) {
  const original = readFileSync(new URL(pagina, pasta), "utf8");
  let html = original;
  for (const [arquivo, versao] of Object.entries(versoes)) {
    const nome = arquivo.replace(".", "\\.");
    html = html.replace(new RegExp(`(["'])/${nome}(\\?v=[0-9a-f]+)?\\1`, "g"), `$1/${arquivo}?v=${versao}$1`);
  }
  if (html !== original) writeFileSync(new URL(pagina, pasta), html);
  console.log(`${pagina}: ${html === original ? "já estava em dia" : "atualizado"}`);
}
console.log(versoes);
