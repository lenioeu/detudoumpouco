import { rgb, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { ANEL_DO_CARIMBO, LETRAS_DA } from "./marca-vetores.js";

// Cores da marca (design system DeAcordo, direção 4a)
const GRAFITE = rgb(0x0b / 255, 0x14 / 255, 0x1a / 255);
const DISCO = rgb(0x00 / 255, 0x5c / 255, 0x4b / 255);
const PAPEL = rgb(1, 1, 1);

/**
 * Texto que vai dentro do QR Code. Um link todo em maiúsculas cabe no modo alfanumérico do QR,
 * mais compacto (código menor e mais fácil de ler). Endereço e esquema não diferenciam maiúsculas;
 * o caminho só é convertido quando é o link curto (/v/CODIGO), que o servidor aceita dos dois jeitos.
 */
export function textoParaQr(url: string): string {
  return /^https?:\/\/[^/]+\/v\/[2-9A-HJ-NP-Z]{7}$/i.test(url) ? url.toUpperCase() : url;
}

/** Retângulo de cantos arredondados, como caminho SVG. */
function retanguloArredondado(x: number, y: number, l: number, a: number, r: number): string {
  return (
    `M${x + r} ${y}H${x + l - r}Q${x + l} ${y} ${x + l} ${y + r}V${y + a - r}Q${x + l} ${y + a} ${x + l - r} ${y + a}` +
    `H${x + r}Q${x} ${y + a} ${x} ${y + a - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`
  );
}

/**
 * QR Code dentro do carimbo da marca: anel com "ASSINATURA ELETRÔNICA · DE ACORDO ·", o código no miolo
 * (pontos grafite, cantos arredondados) e o "dA" no centro. Correção de erros nível H: a marca no
 * centro cobre bem menos do que o leitor consegue recuperar.
 * `x` e `topo` são o canto superior esquerdo do quadrado que contém o carimbo, em pontos do PDF.
 */
export function desenharQrCarimbo(pagina: PDFPage, url: string, x: number, topo: number, diametro: number): void {
  const escala = diametro / 64; // o carimbo da marca é desenhado num quadro de 64×64
  const px = (u: number) => x + u * escala;
  const py = (u: number) => topo - u * escala;

  pagina.drawCircle({ x: px(32), y: py(32), size: 32 * escala, color: PAPEL });
  pagina.drawCircle({ x: px(32), y: py(32), size: 31 * escala, borderColor: GRAFITE, borderWidth: 2 * escala });
  pagina.drawSvgPath(ANEL_DO_CARIMBO, { x, y: topo, scale: escala, color: GRAFITE });
  pagina.drawCircle({ x: px(32), y: py(32), size: 21.5 * escala, borderColor: GRAFITE, borderWidth: 1 * escala });

  const qr = QRCode.create(textoParaQr(url), { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  // O quadrado do código cabe no anel interno com ~1,5 módulo de folga nas pontas
  const modulo = 21 / ((n / 2) * Math.SQRT2 + 1.5 * Math.SQRT2);
  const ini = 32 - (n * modulo) / 2;
  let miolo = Math.round(n * 0.22);
  if (miolo % 2 === 0) miolo += 1;
  const inicioMiolo = (n - miolo) / 2;
  const noMiolo = (c: number, l: number) =>
    c >= inicioMiolo && c < inicioMiolo + miolo && l >= inicioMiolo && l < inicioMiolo + miolo;
  const noOlho = (c: number, l: number) => (c < 7 && l < 7) || (c >= n - 7 && l < 7) || (c < 7 && l >= n - 7);

  for (let l = 0; l < n; l++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(l, c) || noOlho(c, l) || noMiolo(c, l)) continue;
      pagina.drawCircle({
        x: px(ini + (c + 0.5) * modulo),
        y: py(ini + (l + 0.5) * modulo),
        size: 0.46 * modulo * escala,
        color: GRAFITE,
      });
    }
  }

  // Os três "olhos" de posição: anel arredondado grafite com o miolo na cor do disco
  for (const [c, l] of [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ] as const) {
    const ox = ini + c * modulo;
    const oy = ini + l * modulo;
    pagina.drawSvgPath(retanguloArredondado(ox + 0.5 * modulo, oy + 0.5 * modulo, 6 * modulo, 6 * modulo, 1.8 * modulo), {
      x,
      y: topo,
      scale: escala,
      borderColor: GRAFITE,
      borderWidth: modulo, // drawSvgPath já aplica a escala também à espessura
    });
    pagina.drawSvgPath(retanguloArredondado(ox + 2 * modulo, oy + 2 * modulo, 3 * modulo, 3 * modulo, 0.9 * modulo), {
      x,
      y: topo,
      scale: escala,
      color: DISCO,
    });
  }

  // "dA" no centro: disco da marca com as letras em branco
  const lado = (miolo - 1) * modulo;
  const canto = ini + (inicioMiolo + 0.5) * modulo;
  pagina.drawCircle({ x: px(canto + lado / 2), y: py(canto + lado / 2), size: (lado / 2) * (31 / 32) * escala, color: DISCO });
  pagina.drawSvgPath(LETRAS_DA, { x: px(canto), y: py(canto), scale: (lado / 64) * escala, color: PAPEL });
}
