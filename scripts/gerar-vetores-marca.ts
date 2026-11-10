/**
 * Copia dos SVGs da marca (site/marca) os contornos usados para desenhar o carimbo dentro do PDF:
 * o texto do anel do carimbo e o "dA" do favicon. Rode de novo se os SVGs da marca mudarem.
 *
 *   npx tsx scripts/gerar-vetores-marca.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const ler = (nome: string) => readFileSync(new URL(`../site/marca/${nome}`, import.meta.url), "utf8");
const caminhos = (svg: string) => [...svg.matchAll(/<path[^>]* d="([^"]+)"/g)].map((m) => m[1]!);

const [anel] = caminhos(ler("carimbo-fundo-claro.svg"));
const [dA] = caminhos(ler("favicon.svg"));
if (!anel || !dA) throw new Error("Os SVGs da marca mudaram de estrutura");

writeFileSync(
  new URL("../src/assinatura/marca-vetores.ts", import.meta.url),
  `// Gerado por scripts/gerar-vetores-marca.ts a partir de site/marca: não edite à mão.
// Coordenadas no quadro 64×64 dos SVGs da marca.

/** "ASSINATURA ELETRÔNICA · DE ACORDO ·" do anel do carimbo, em contorno. */
export const ANEL_DO_CARIMBO = ${JSON.stringify(anel)};

/** "dA" do favicon, em contorno. */
export const LETRAS_DA = ${JSON.stringify(dA)};
`,
);
console.log("src/assinatura/marca-vetores.ts atualizado");
