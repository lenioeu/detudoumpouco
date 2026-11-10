import {
  concatTransformationMatrix,
  drawEllipse,
  drawObject,
  drawSvgPath,
  LineCapStyle,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type PDFDocument,
  type PDFFont,
  type PDFOperator,
  type PDFPage,
  type PDFRef,
  type RGB,
} from "pdf-lib";
import { ANEL_DO_CARIMBO, LETRAS_DA_DO_CARIMBO, MARCA_REGISTRADA, PALAVRA_DEACORDO } from "./marca-vetores.js";

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);

/** Cores do design system do DeAcordo (direção 4a), nos valores do tema claro: o PDF é papel. */
export const COR = {
  grafite: hex("#0B141A"),
  disco: hex("#005C4B"),
  tinta: hex("#075E54"),
  verdeVivo: hex("#25D366"),
  apoio: hex("#54656F"),
  borda: hex("#D1D7DB"),
  linhaDoPapel: hex("#E6E9EC"),
  papelQuente: hex("#F7F5F0"),
  papel: rgb(1, 1, 1),
};

/** Retângulo de cantos arredondados, como caminho SVG (y para baixo, como nos SVGs da marca). */
export function retanguloArredondado(x: number, y: number, l: number, a: number, r: number): string {
  return (
    `M${x + r} ${y}H${x + l - r}Q${x + l} ${y} ${x + l} ${y + r}V${y + a - r}Q${x + l} ${y + a} ${x + l - r} ${y + a}` +
    `H${x + r}Q${x} ${y + a} ${x} ${y + a - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`
  );
}

/**
 * Desenhos da marca guardados uma vez em cada PDF (Form XObjects) e reaproveitados em todas as páginas:
 * o anel com o texto em contorno é grande, e repetir o desenho a cada uso pesaria o arquivo.
 * Coordenadas nos quadros dos SVGs da marca: 64×64 (anel, miolo) e 260×64 (palavra).
 */
export type DesenhosDaMarca = { anel: PDFRef; miolo: PDFRef; palavra: PDFRef };

export function prepararDesenhosDaMarca(doc: PDFDocument): DesenhosDaMarca {
  const guardar = (operadores: PDFOperator[], largura: number) =>
    doc.context.register(doc.context.formXObject(operadores, { BBox: [0, 0, largura, 64], Matrix: [1, 0, 0, 1, 0, 0] }));
  const traco = (d: string, cor: RGB, espessura: number) =>
    drawSvgPath(d, { x: 0, y: 64, scale: 1, color: undefined, borderColor: cor, borderWidth: espessura, borderLineCap: LineCapStyle.Round });
  const preenchido = (d: string) =>
    drawSvgPath(d, { x: 0, y: 64, scale: 1, color: COR.grafite, borderColor: undefined, borderWidth: 0 });
  const circulo = (raio: number, espessura: number) =>
    drawEllipse({ x: 32, y: 32, xScale: raio, yScale: raio, color: undefined, borderColor: COR.grafite, borderWidth: espessura });
  return {
    anel: guardar([...circulo(31, 2), ...preenchido(ANEL_DO_CARIMBO), ...circulo(21.5, 1)], 64),
    miolo: guardar(
      [...preenchido(LETRAS_DA_DO_CARIMBO), ...traco("M26 35L30 39L38 31", COR.tinta, 2.6), ...traco("M22 43L42 43", COR.grafite, 1.6)],
      64,
    ),
    palavra: guardar([...preenchido(PALAVRA_DEACORDO), ...preenchido(MARCA_REGISTRADA)], 260),
  };
}

/** Desenha um dos desenhos guardados com o canto superior esquerdo em (x, topo) e altura `altura`. */
export function usarDesenho(pagina: PDFPage, desenho: PDFRef, x: number, topo: number, altura: number): void {
  const nome = pagina.node.newXObject("DeAcordo", desenho);
  const escala = altura / 64;
  pagina.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(escala, 0, 0, escala, x, topo - altura),
    drawObject(nome),
    popGraphicsState(),
  );
}

/** Carimbo da marca para fundo claro: disco de papel, anel, "dA", o visto em tinta e a linha de assinatura. */
export function desenharCarimbo(pagina: PDFPage, desenhos: DesenhosDaMarca, x: number, topo: number, diametro: number): void {
  pagina.drawCircle({ x: x + diametro / 2, y: topo - diametro / 2, size: diametro / 2, color: COR.papel });
  usarDesenho(pagina, desenhos.anel, x, topo, diametro);
  usarDesenho(pagina, desenhos.miolo, x, topo, diametro);
}

/** Marca horizontal (carimbo + "DeAcordo™"). Devolve a largura. */
export function desenharMarcaHorizontal(pagina: PDFPage, desenhos: DesenhosDaMarca, x: number, topo: number, altura: number): number {
  desenharCarimbo(pagina, desenhos, x, topo, altura);
  usarDesenho(pagina, desenhos.palavra, x, topo, altura);
  return (260 * altura) / 64;
}

export type FontesDoAdesivo = { italico: PDFFont; mono: PDFFont; desenhos: DesenhosDaMarca };

/** Medidas do adesivo de assinatura em escala 1, para posicionar antes de desenhar. */
export function medirAdesivo(data: string, fontes: Pick<FontesDoAdesivo, "italico" | "mono">): { largura: number; altura: number } {
  const texto = Math.max(fontes.italico.widthOfTextAtSize("de acordo", 15), fontes.mono.widthOfTextAtSize(data, 6.5));
  return { largura: 9 + 22 + 7 + texto + 10, altura: 34 };
}

/**
 * Adesivo de assinatura do design system: borda grafite, mini carimbo, "de acordo" em itálico e a data
 * em tinta, inclinado como um carimbo batido. (cx, cy) é o centro; `escala` 1 = 34 pt de altura.
 */
export function desenharAdesivo(
  pagina: PDFPage,
  cx: number,
  cy: number,
  escala: number,
  data: string,
  fontes: FontesDoAdesivo,
): void {
  const { largura: l, altura: a } = medirAdesivo(data, fontes);
  const angulo = (6 * Math.PI) / 180; // no PDF o ângulo positivo gira no sentido anti-horário, como o -6° do site
  const [c, s] = [Math.cos(angulo) * escala, Math.sin(angulo) * escala];
  pagina.pushOperators(pushGraphicsState(), concatTransformationMatrix(c, s, -s, c, cx, cy));
  // A partir daqui, coordenadas locais com origem no centro do adesivo
  const x0 = -l / 2;
  const topo = a / 2;
  pagina.drawSvgPath(retanguloArredondado(0, 0, l, a, 6), {
    x: x0,
    y: topo,
    color: COR.papel,
    opacity: 0.92,
    borderColor: COR.grafite,
    borderWidth: 2,
  });
  desenharCarimbo(pagina, fontes.desenhos, x0 + 9, topo - (a - 22) / 2, 22);
  const xTexto = x0 + 9 + 22 + 7;
  pagina.drawText("de acordo", { x: xTexto, y: topo - 17, size: 15, font: fontes.italico, color: COR.grafite });
  pagina.drawText(data, { x: xTexto, y: topo - 27, size: 6.5, font: fontes.mono, color: COR.tinta });
  pagina.pushOperators(popGraphicsState());
}
