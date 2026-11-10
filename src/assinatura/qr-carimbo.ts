import type { PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { COR, retanguloArredondado, usarDesenho, type DesenhosDaMarca } from "./marca-pdf.js";
import { LETRAS_DA } from "./marca-vetores.js";

const { grafite: GRAFITE, disco: DISCO, papel: PAPEL } = COR;

/**
 * Texto que vai dentro do QR Code. Um link todo em maiúsculas cabe no modo alfanumérico do QR,
 * mais compacto (código menor e mais fácil de ler). Endereço e esquema não diferenciam maiúsculas;
 * o caminho só é convertido quando é o link curto (/v/CODIGO), que o servidor aceita dos dois jeitos.
 */
export function textoParaQr(url: string): string {
  return /^https?:\/\/[^/]+\/v\/[2-9A-HJ-NP-Z]{7}$/i.test(url) ? url.toUpperCase() : url;
}

/**
 * QR Code dentro do carimbo da marca: anel com "ASSINATURA ELETRÔNICA · DE ACORDO ·", o código no miolo
 * (pontos grafite, cantos arredondados) e o "dA" no centro. Correção de erros nível H: a marca no
 * centro cobre bem menos do que o leitor consegue recuperar.
 * `x` e `topo` são o canto superior esquerdo do quadrado que contém o carimbo, em pontos do PDF.
 */
export function desenharQrCarimbo(
  pagina: PDFPage,
  desenhos: DesenhosDaMarca,
  url: string,
  x: number,
  topo: number,
  diametro: number,
): void {
  const escala = diametro / 64; // o carimbo da marca é desenhado num quadro de 64×64
  const px = (u: number) => x + u * escala;
  const py = (u: number) => topo - u * escala;

  pagina.drawCircle({ x: px(32), y: py(32), size: 32 * escala, color: PAPEL });
  usarDesenho(pagina, desenhos.anel, x, topo, diametro);

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
