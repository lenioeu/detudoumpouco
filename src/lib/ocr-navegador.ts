// OCR no navegador com tesseract.js. Roda só no navegador.
// Tudo o que o tesseract precisa (worker, núcleo em WebAssembly e os idiomas) é servido pelo
// próprio site, em /tesseract/<versão>/: nenhuma imagem sai do aparelho e não há pedido a CDN.
// A biblioteca só é baixada quando a pessoa clica em "Reconhecer texto".
import type { Worker as WorkerTesseract, RecognizeResult } from 'tesseract.js';
import type { LinhaOcr } from './ocr-camada';

export type Idioma = 'por' | 'eng' | 'por+eng';

/** Mesma versão do tesseract.js do package.json. Ao atualizar, copie os arquivos de novo para public/. */
const VERSAO = '7.0.0';
const BASE = `/tesseract/${VERSAO}/`;
/** Os idiomas ficam guardados no navegador (IndexedDB) com este prefixo: só baixam uma vez. */
const CACHE = 'quebragalho-tessdata-4.0.0_best_int';

/** Tamanho aproximado do primeiro download, já comprimido (núcleo + idioma), em MB. */
export const DOWNLOAD_MB: Record<Idioma, number> = { por: 3, eng: 4.5, 'por+eng': 6 };

/** Navegador com SIMD (quase todos os atuais) usa a versão mais rápida do núcleo. */
function temSimd(): boolean {
  try {
    return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch { return false; }
}

export interface Andamento {
  /** Etapa em português, pronta para mostrar. */
  etapa: string;
  /** 0 a 1. */
  progresso: number;
  /** true enquanto está reconhecendo (as outras etapas são de carregamento). */
  reconhecendo: boolean;
}

const ETAPAS: Record<string, string> = {
  'loading tesseract core': 'Carregando o programa de OCR',
  'initializing tesseract': 'Preparando o OCR',
  'loading language traineddata': 'Carregando o idioma',
  'initializing api': 'Preparando o OCR',
  'recognizing text': 'Reconhecendo o texto',
};

let atual: { idioma: Idioma; worker: Promise<WorkerTesseract> } | null = null;
let aoAndar: (a: Andamento) => void = () => {};

/** Cria (ou reaproveita) o worker do tesseract para o idioma pedido. */
export function prepararOcr(idioma: Idioma, andamento: (a: Andamento) => void): Promise<WorkerTesseract> {
  aoAndar = andamento;
  if (atual?.idioma === idioma) return atual.worker;
  const anterior = atual;
  anterior?.worker.then((w) => w.terminate()).catch(() => undefined);
  const worker = (async () => {
    if (typeof WebAssembly !== 'object') throw new Error('Este navegador não consegue rodar o OCR. Atualize o navegador ou use outro.');
    const { createWorker, PSM } = await import('tesseract.js');
    const w = await createWorker(idioma, 1 /* só LSTM: o modelo atual, mais preciso */, {
      workerPath: BASE + 'worker.min.js',
      corePath: BASE + (temSimd() ? 'tesseract-core-simd-lstm.wasm.js' : 'tesseract-core-lstm.wasm.js'),
      langPath: BASE + 'lang',
      cachePath: CACHE,
      workerBlobURL: false,
      logger: (m) => aoAndar({ etapa: ETAPAS[m.status] ?? 'Preparando o OCR', progresso: m.progress || 0, reconhecendo: m.status === 'recognizing text' }),
      errorHandler: () => undefined,
    });
    await w.setParameters({ tessedit_pageseg_mode: PSM.AUTO, user_defined_dpi: '300' });
    return w;
  })();
  atual = { idioma, worker };
  worker.catch(() => { if (atual?.worker === worker) atual = null; });
  return worker;
}

export interface PaginaReconhecida {
  texto: string;
  /** Confiança média do tesseract, de 0 a 100. */
  confianca: number;
  linhas: LinhaOcr[];
}

/** Reconhece o texto de uma imagem (canvas) e devolve o texto e as linhas com a posição das palavras. */
export async function reconhecer(worker: WorkerTesseract, imagem: HTMLCanvasElement): Promise<PaginaReconhecida> {
  const r: RecognizeResult = await worker.recognize(imagem, {}, { text: true, blocks: true });
  const linhas: LinhaOcr[] = [];
  for (const bloco of r.data.blocks ?? []) {
    for (const par of bloco.paragraphs ?? []) {
      for (const l of par.lines ?? []) {
        linhas.push({
          base: l.baseline ? { x0: l.baseline.x0, y0: l.baseline.y0, x1: l.baseline.x1, y1: l.baseline.y1 } : null,
          palavras: (l.words ?? []).map((w) => ({ texto: w.text, caixa: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 } })),
        });
      }
    }
  }
  return { texto: r.data.text ?? '', confianca: r.data.confidence ?? 0, linhas };
}

/** Desliga o worker (libera a memória). */
export function encerrarOcr(): void {
  atual?.worker.then((w) => w.terminate()).catch(() => undefined);
  atual = null;
}
