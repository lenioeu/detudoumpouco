/**
 * QR Code com a marca do DeAcordo: módulos em pontos grafite, cantos arredondados e o "dA" no centro.
 * Usa correção de erros nível H (até ~30% do código pode faltar), então o miolo coberto pela marca
 * continua lendo em qualquer leitor comum.
 *
 * Também gera a versão carimbo: o código no miolo do carimbo, com o anel "ASSINATURA ELETRÔNICA · DE ACORDO ·" em volta.
 *
 *   npx tsx scripts/qrcode-marca.ts https://deacordo.app site/marca/qrcode-deacordo.svg
 *   npx tsx scripts/qrcode-marca.ts https://deacordo.app site/marca/qrcode-carimbo.svg --carimbo
 */
import { readFileSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";

const GRAFITE = "#0B141A";
const DISCO = "#005C4B";
const PAPEL = "#FFFFFF";

/** Pontos, olhos e miolo do QR, num quadrado de `n` unidades (um módulo = 1), sem zona livre. */
function desenharModulos(texto: string, favicon: string): { n: number; conteudo: string } {
  const qr = QRCode.create(texto, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  // Miolo livre para o "dA": ímpar, cerca de 22% da largura (bem abaixo dos 30% que o nível H recupera)
  let miolo = Math.round(n * 0.22);
  if (miolo % 2 === 0) miolo += 1;
  const ini = (n - miolo) / 2;
  const noMiolo = (x: number, y: number) => x >= ini && x < ini + miolo && y >= ini && y < ini + miolo;
  // Os três "olhos" de posição são desenhados à parte, com cantos arredondados
  const noOlho = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  const pontos: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!qr.modules.get(y, x) || noOlho(x, y) || noMiolo(x, y)) continue;
      pontos.push(`<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.46"/>`);
    }
  }
  const olho = (x: number, y: number) =>
    `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="1.8" fill="none" stroke="${GRAFITE}" stroke-width="1"/>` +
    `<rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="0.9" fill="${DISCO}"/>`;
  const interno = favicon.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<title>[\s\S]*?<\/title>/, "");
  return {
    n,
    conteudo:
      `<g fill="${GRAFITE}">${pontos.join("")}</g>${olho(0, 0)}${olho(n - 7, 0)}${olho(0, n - 7)}` +
      `<svg x="${ini + 0.5}" y="${ini + 0.5}" width="${miolo - 1}" height="${miolo - 1}" viewBox="0 0 64 64">${interno}</svg>`,
  };
}

/**
 * QR Code dentro do carimbo da marca. Reaproveita do carimbo (versão fundo claro) o anel externo,
 * o texto do anel em contorno e o anel interno; o miolo vira papel com o código.
 */
export function qrcodeCarimbo(texto: string, favicon: string, carimboClaro: string): string {
  const pegar = (re: RegExp) => {
    const m = carimboClaro.match(re);
    if (!m) throw new Error("carimbo-fundo-claro.svg mudou de estrutura");
    return m[0];
  };
  const anelExterno = pegar(/<circle[^>]*r="31"[^>]*>(<\/circle>)?/);
  const textoDoAnel = pegar(/<path[^>]*>(<\/path>)?/);
  const anelInterno = pegar(/<circle[^>]*r="21\.5"[^>]*>(<\/circle>)?/);
  const { n, conteudo } = desenharModulos(texto, favicon);
  // O quadrado do código cabe no círculo interno com folga de ~1,5 módulo nas pontas (zona livre mínima)
  const raio = 21;
  const modulo = raio / ((n / 2) * Math.SQRT2 + 1.5 * Math.SQRT2);
  const lado = n * modulo;
  const ini = 32 - lado / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="QR Code DeAcordo em forma de carimbo">
<title>QR Code DeAcordo</title>
<circle cx="32" cy="32" r="32" fill="${PAPEL}"/>
${anelExterno}${textoDoAnel}${anelInterno}
<g transform="translate(${ini.toFixed(3)} ${ini.toFixed(3)}) scale(${modulo.toFixed(4)})">${conteudo}</g>
</svg>
`;
}

export function qrcodeDaMarca(texto: string, favicon: string): string {
  const { n, conteudo } = desenharModulos(texto, favicon);
  const margem = 4; // zona livre exigida pelo padrão
  const total = n + margem * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="QR Code DeAcordo">
<title>QR Code DeAcordo</title>
<rect width="${total}" height="${total}" rx="2" fill="${PAPEL}"/>
<g transform="translate(${margem} ${margem})">${conteudo}</g>
</svg>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const carimbo = args.includes("--carimbo");
  const [texto = "https://deacordo.app", saida = "site/marca/qrcode-deacordo.svg"] = args.filter((a) => a !== "--carimbo");
  const favicon = readFileSync(new URL("../site/marca/favicon.svg", import.meta.url), "utf8");
  const carimboClaro = readFileSync(new URL("../site/marca/carimbo-fundo-claro.svg", import.meta.url), "utf8");
  writeFileSync(saida, carimbo ? qrcodeCarimbo(texto, favicon, carimboClaro) : qrcodeDaMarca(texto, favicon));
  console.log(`QR Code de ${texto} salvo em ${saida}`);
}
