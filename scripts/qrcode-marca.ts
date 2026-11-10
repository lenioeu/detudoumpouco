/**
 * QR Code com a marca do DeAcordo: módulos em pontos grafite, cantos arredondados e o "dA" no centro.
 * Usa correção de erros nível H (até ~30% do código pode faltar), então o miolo coberto pela marca
 * continua lendo em qualquer leitor comum.
 *
 *   npx tsx scripts/qrcode-marca.ts https://deacordo.app site/marca/qrcode-deacordo.svg
 */
import { readFileSync, writeFileSync } from "node:fs";
import QRCode from "qrcode";

const GRAFITE = "#0B141A";
const DISCO = "#005C4B";
const PAPEL = "#FFFFFF";

export function qrcodeDaMarca(texto: string, favicon: string): string {
  const qr = QRCode.create(texto, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const margem = 4; // zona livre exigida pelo padrão
  const total = n + margem * 2;

  // Miolo livre para a marca: ímpar, cerca de 22% da largura (bem abaixo dos 30% que o nível H recupera em área)
  let miolo = Math.round(n * 0.22);
  if (miolo % 2 === 0) miolo += 1;
  const ini = (n - miolo) / 2;
  const noMiolo = (x: number, y: number) => x >= ini && x < ini + miolo && y >= ini && y < ini + miolo;
  // Os três "olhos" de posição são desenhados à parte
  const noOlho = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

  const pontos: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!qr.modules.get(x, y) || noOlho(x, y) || noMiolo(x, y)) continue;
      pontos.push(`<circle cx="${x + margem + 0.5}" cy="${y + margem + 0.5}" r="0.46"/>`);
    }
  }

  const olho = (x: number, y: number) => {
    const ox = x + margem;
    const oy = y + margem;
    return (
      `<rect x="${ox + 0.5}" y="${oy + 0.5}" width="6" height="6" rx="1.8" fill="none" stroke="${GRAFITE}" stroke-width="1"/>` +
      `<rect x="${ox + 2}" y="${oy + 2}" width="3" height="3" rx="0.9" fill="${DISCO}"/>`
    );
  };

  // O favicon (disco com "dA") entra inteiro no centro, com uma folga branca em volta
  const interno = favicon.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<title>[\s\S]*?<\/title>/, "");
  const lado = miolo - 1;
  const pos = ini + margem + 0.5;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" role="img" aria-label="QR Code DeAcordo">
<title>QR Code DeAcordo</title>
<rect width="${total}" height="${total}" rx="2" fill="${PAPEL}"/>
<g fill="${GRAFITE}">${pontos.join("")}</g>
${olho(0, 0)}${olho(n - 7, 0)}${olho(0, n - 7)}
<svg x="${pos}" y="${pos}" width="${lado}" height="${lado}" viewBox="0 0 64 64">${interno}</svg>
</svg>
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [texto = "https://deacordo.app", saida = "site/marca/qrcode-deacordo.svg"] = process.argv.slice(2);
  const favicon = readFileSync(new URL("../site/marca/favicon.svg", import.meta.url), "utf8");
  writeFileSync(saida, qrcodeDaMarca(texto, favicon));
  console.log(`QR Code de ${texto} salvo em ${saida}`);
}
