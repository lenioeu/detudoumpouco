// Escrever textos e imagens numa página de PDF (pdf-lib) e desenhar a mesma coisa num canvas,
// para a prévia mostrar exatamente o que vai sair. Tudo no espaço visual da página (veja pdf-visual.ts).
// Só roda no navegador; os tipos do pdf-lib entram só como tipo (a biblioteca é carregada sob demanda).
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import { carregarPdfLib } from './pdf-navegador';
import { normalizarRotacao, tamanhoVisual, visualParaPdf, type Caixa } from './pdf-visual';

/** Fontes que todo leitor de PDF tem. O CSS usa fontes com as mesmas medidas (Arial = Helvetica). */
export const FONTES = {
  helvetica: { nome: 'Sem serifa', pdf: 'Helvetica', css: 'Helvetica, Arial, "Liberation Sans", sans-serif', negrito: false },
  'helvetica-negrito': { nome: 'Sem serifa, negrito', pdf: 'Helvetica-Bold', css: 'Helvetica, Arial, "Liberation Sans", sans-serif', negrito: true },
  times: { nome: 'Com serifa', pdf: 'Times-Roman', css: '"Times New Roman", Times, "Liberation Serif", serif', negrito: false },
  'times-negrito': { nome: 'Com serifa, negrito', pdf: 'Times-Bold', css: '"Times New Roman", Times, "Liberation Serif", serif', negrito: true },
  courier: { nome: 'Máquina de escrever', pdf: 'Courier', css: '"Courier New", Courier, "Liberation Mono", monospace', negrito: false },
} as const;
export type Fonte = keyof typeof FONTES;

/** Cores prontas (valores de impressão, não do tema do site). */
export const CORES = {
  preto: { nome: 'Preto', rgb: [0, 0, 0] },
  cinza: { nome: 'Cinza', rgb: [0.45, 0.45, 0.45] },
  vermelho: { nome: 'Vermelho', rgb: [0.8, 0.1, 0.1] },
  azul: { nome: 'Azul', rgb: [0.1, 0.3, 0.75] },
  verde: { nome: 'Verde', rgb: [0.1, 0.5, 0.25] },
} as const;
export type Cor = keyof typeof CORES;

export const corCss = (c: Cor) => `rgb(${CORES[c].rgb.map((v) => Math.round(v * 255)).join(' ')})`;

export interface InfoPagina {
  /** Área visível da página no espaço do PDF (CropBox dentro da MediaBox). */
  caixa: Caixa;
  rotacao: 0 | 90 | 180 | 270;
  /** Tamanho como aparece na tela. */
  largura: number;
  altura: number;
}

export function infoDaPagina(pagina: PDFPage): InfoPagina {
  const m = pagina.getMediaBox();
  const c = pagina.getCropBox();
  // Igual ao pdf.js: a parte visível é a interseção das duas caixas.
  const x = Math.max(m.x, c.x), y = Math.max(m.y, c.y);
  const x1 = Math.min(m.x + m.width, c.x + c.width), y1 = Math.min(m.y + m.height, c.y + c.height);
  const caixa = x1 > x && y1 > y ? { x, y, largura: x1 - x, altura: y1 - y } : { x: m.x, y: m.y, largura: m.width, altura: m.height };
  const rotacao = normalizarRotacao(pagina.getRotation().angle);
  return { caixa, rotacao, ...tamanhoVisual(caixa, rotacao) };
}

/** Separa os caracteres que a fonte padrão não consegue escrever (ex.: emoji, letras de outros alfabetos). */
export function filtrarTexto(texto: string, fonte: PDFFont): { texto: string; fora: string[] } {
  const conjunto = new Set(fonte.getCharacterSet());
  const fora = new Set<string>();
  let limpo = '';
  for (const ch of texto.replace(/[\r\n\t]+/g, ' ')) {
    if (conjunto.has(ch.codePointAt(0)!)) limpo += ch; else fora.add(ch);
  }
  return { texto: limpo, fora: [...fora] };
}

export interface TextoVisual {
  texto: string;
  /** Início da linha de base, no espaço visual. */
  x: number;
  y: number;
  angulo: number;
  tamanho: number;
  fonte: Fonte;
  cor: Cor;
  opacidade: number;
}

export async function escreverTexto(pagina: PDFPage, info: InfoPagina, fonte: PDFFont, t: TextoVisual): Promise<void> {
  const { rgb, degrees } = await carregarPdfLib();
  const p = visualParaPdf(info.caixa, info.rotacao, t.x, t.y, t.angulo);
  const [r, g, b] = CORES[t.cor].rgb;
  pagina.drawText(t.texto, {
    x: p.x, y: p.y, size: t.tamanho, font: fonte, color: rgb(r, g, b),
    opacity: t.opacidade, rotate: degrees(p.angulo),
  });
}

export interface ImagemVisual {
  /** Canto inferior esquerdo (antes de girar), no espaço visual. */
  x: number;
  y: number;
  largura: number;
  altura: number;
  angulo: number;
  opacidade: number;
}

export async function colocarImagem(pagina: PDFPage, info: InfoPagina, imagem: PDFImage, i: ImagemVisual): Promise<void> {
  const { degrees } = await carregarPdfLib();
  const p = visualParaPdf(info.caixa, info.rotacao, i.x, i.y, i.angulo);
  pagina.drawImage(imagem, { x: p.x, y: p.y, width: i.largura, height: i.altura, opacity: i.opacidade, rotate: degrees(p.angulo) });
}

/** Mesma conta no canvas da prévia. `k` = pixels do canvas por ponto; `altura` = altura visual da página. */
export function textoNoCanvas(ctx: CanvasRenderingContext2D, k: number, altura: number, t: TextoVisual): void {
  const f = FONTES[t.fonte];
  ctx.save();
  ctx.translate(t.x * k, (altura - t.y) * k);
  ctx.rotate((-t.angulo * Math.PI) / 180);
  ctx.globalAlpha = t.opacidade;
  ctx.fillStyle = corCss(t.cor);
  ctx.font = `${f.negrito ? '700 ' : ''}${t.tamanho * k}px ${f.css}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(t.texto, 0, 0);
  ctx.restore();
}

export function imagemNoCanvas(ctx: CanvasRenderingContext2D, k: number, altura: number, img: CanvasImageSource, i: ImagemVisual): void {
  ctx.save();
  ctx.translate(i.x * k, (altura - i.y) * k);
  ctx.rotate((-i.angulo * Math.PI) / 180);
  ctx.globalAlpha = i.opacidade;
  ctx.drawImage(img, 0, -i.altura * k, i.largura * k, i.altura * k);
  ctx.restore();
}
