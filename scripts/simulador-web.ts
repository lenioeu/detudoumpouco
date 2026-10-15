/**
 * Gera dist/simulador-web.html: o simulador inteiro (bot + página) num arquivo só,
 * para publicar como página no claude.ai.
 *
 *   npm run simulador:web
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { gerarCertificadoAutoassinado } from "../src/assinatura/certificado.js";

const raiz = new URL("..", import.meta.url).pathname;
const shims = `${raiz}src/simulador/web/shims`;

// Certificado só de demonstração, gerado a cada build e embutido na página
const certificado = gerarCertificadoAutoassinado("Escritório Exemplo Advocacia (simulador)", "simulador-123");

const resultado = await build({
  entryPoints: [`${raiz}src/simulador/web/main.ts`],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none",
  inject: [`${shims}/buffer.ts`],
  alias: {
    "node:crypto": `${shims}/crypto.ts`,
    "node:fs": `${shims}/vazio.ts`,
    "node:path": `${shims}/vazio.ts`,
    crypto: `${shims}/crypto.ts`,
  },
  define: {
    __CERTIFICADO_P12__: JSON.stringify(certificado.toString("base64")),
    "process.env.NODE_ENV": '"production"',
    "process.env": "{}",
    global: "globalThis",
  },
});

const js = resultado.outputFiles[0]!.text.replace(/<\/script/gi, "<\\/script");
const pagina = readFileSync(`${raiz}src/simulador/web/pagina.html`, "utf8").replace("/*BUNDLE*/", () => js);
mkdirSync(`${raiz}dist`, { recursive: true });
writeFileSync(`${raiz}dist/simulador-web.html`, pagina);
console.log(`dist/simulador-web.html gerado (${Math.round(pagina.length / 1024)} KB)`);
