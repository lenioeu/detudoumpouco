// Ajudantes de PDF que rodam só no navegador.
// pdf-lib (criar e editar) e pdf.js (desenhar páginas) são pesados: só são baixados
// quando a pessoa escolhe um arquivo, com import() dinâmico.
import type { PDFDocument } from 'pdf-lib';

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
export type DocumentoPdfJs = Awaited<ReturnType<PdfJs['getDocument']>['promise']>;

let pdfjs: Promise<PdfJs> | null = null;
let pdfLib: Promise<typeof import('pdf-lib')> | null = null;

/**
 * Carrega o pdf.js (versão "legacy", que funciona também em celulares e Safari mais antigos).
 * O worker vira um arquivo próprio no build (o "?url" faz o Vite copiar e devolver o endereço).
 */
export function carregarPdfjs(): Promise<PdfJs> {
  if (!pdfjs) {
    pdfjs = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    });
    pdfjs.catch(() => { pdfjs = null; });
  }
  return pdfjs;
}

export function carregarPdfLib(): Promise<typeof import('pdf-lib')> {
  if (!pdfLib) {
    pdfLib = import('pdf-lib');
    pdfLib.catch(() => { pdfLib = null; });
  }
  return pdfLib;
}

/** Erro com mensagem pronta para mostrar à pessoa. */
export class ErroPdf extends Error {
  constructor(mensagem: string, public senha = false) { super(mensagem); }
}

const MSG_SENHA = 'Este PDF está protegido por senha ou tem bloqueio de edição. Ele precisa ser desbloqueado antes.';
const MSG_INVALIDO = 'Não foi possível abrir este arquivo. Ele pode estar corrompido ou não ser um PDF.';

/**
 * Abre o PDF com o pdf.js para desenhar páginas. Os arquivos de apoio (fontes, mapas de caracteres
 * e decodificadores de imagem) ficam em /pdfjs/<versão>/ e só são baixados se o PDF precisar.
 */
export async function abrirParaVer(dados: ArrayBuffer): Promise<DocumentoPdfJs> {
  const lib = await carregarPdfjs();
  const base = `/pdfjs/${lib.version}/`;
  try {
    // O pdf.js transfere os bytes para o worker; mandamos uma cópia para não perder o original.
    return await lib.getDocument({
      data: new Uint8Array(dados.slice(0)),
      cMapUrl: base + 'cmaps/',
      standardFontDataUrl: base + 'standard_fonts/',
      wasmUrl: base + 'wasm/',
      iccUrl: base + 'iccs/',
      enableXfa: false,
    }).promise;
  } catch (e) {
    if ((e as Error)?.name === 'PasswordException') throw new ErroPdf('Este PDF pede senha para abrir. Ele precisa ser desbloqueado antes.', true);
    throw new ErroPdf(MSG_INVALIDO);
  }
}

/** Libera a memória e o worker de um documento aberto com abrirParaVer. */
export function fecharPdf(doc: DocumentoPdfJs | null | undefined): void {
  doc?.loadingTask.destroy().catch(() => undefined);
}

/** Abre o PDF com o pdf-lib para copiar páginas. Recusa PDFs criptografados (o resultado sairia em branco). */
export async function abrirParaEditar(dados: ArrayBuffer): Promise<PDFDocument> {
  const { PDFDocument } = await carregarPdfLib();
  try {
    return await PDFDocument.load(dados, { updateMetadata: false });
  } catch (e) {
    const err = e as Error;
    if (err?.name === 'EncryptedPDFError' || /encrypt/i.test(err?.message ?? '')) throw new ErroPdf(MSG_SENHA, true);
    throw new ErroPdf(MSG_INVALIDO);
  }
}

/** PDF novo com os dados de quem gerou. */
export async function novoPdf(): Promise<PDFDocument> {
  const { PDFDocument } = await carregarPdfLib();
  const doc = await PDFDocument.create();
  doc.setProducer('oquebragalho.app');
  doc.setCreator('oquebragalho.app');
  return doc;
}

/** Bytes do PDF prontos para virar link de download. */
export async function paraBlob(doc: PDFDocument): Promise<Blob> {
  const bytes = await doc.save();
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}

/** Área máxima de um canvas que os celulares (principalmente iPhone) aceitam. */
export const AREA_MAXIMA_CANVAS = 16_000_000;

/**
 * Desenha uma página num canvas. `escala` 1 = 72 pontos por polegada.
 * Se a página ficaria grande demais para o aparelho, a escala é reduzida (veja `reduzida`).
 */
export async function desenharPagina(
  doc: DocumentoPdfJs,
  numero: number,
  escala: number,
  fundo = '#ffffff',
): Promise<{ canvas: HTMLCanvasElement; reduzida: boolean }> {
  const pagina = await doc.getPage(numero);
  let viewport = pagina.getViewport({ scale: escala });
  let reduzida = false;
  const area = Math.floor(viewport.width) * Math.floor(viewport.height);
  if (area > AREA_MAXIMA_CANVAS) {
    viewport = pagina.getViewport({ scale: escala * Math.sqrt(AREA_MAXIMA_CANVAS / area) * 0.99 });
    reduzida = true;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await pagina.render({ canvas, viewport, background: fundo }).promise;
  pagina.cleanup();
  return { canvas, reduzida };
}

/** Miniatura de uma página com a largura pedida (em pixels de tela; considera telas de alta densidade). */
export async function miniatura(doc: DocumentoPdfJs, numero: number, largura: number): Promise<HTMLCanvasElement> {
  const pagina = await doc.getPage(numero);
  const base = pagina.getViewport({ scale: 1 });
  const densidade = Math.min(window.devicePixelRatio || 1, 2);
  const { canvas } = await desenharPagina(doc, numero, (largura * densidade) / base.width);
  return canvas;
}

/** Fila simples: desenha uma miniatura de cada vez para não travar o celular. */
export function filaDeTrabalho() {
  let fim: Promise<unknown> = Promise.resolve();
  return <T>(tarefa: () => Promise<T>): Promise<T> => {
    const p = fim.then(tarefa, tarefa);
    fim = p.catch(() => undefined);
    return p;
  };
}
