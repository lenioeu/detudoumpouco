// Montar um PDF a partir das páginas de outro: mudar a ordem, girar, tirar ou escolher páginas.
// Usado por organizar PDF, remover páginas, girar PDF e extrair páginas.
// As contas são funções puras; montarPdf() carrega o pdf-lib só quando é chamado.
import type { PDFDocument } from 'pdf-lib';
import { abrirParaEditar, carregarPdfLib, novoPdf } from './pdf-navegador';

/** Uma página do PDF final: de qual página do original ela vem (começando em 0) e quanto girar a mais. */
export interface PaginaEscolhida { indice: number; giro: number; }

/** Deixa o giro em 0, 90, 180 ou 270 graus (aceita negativos e voltas a mais). */
export function normalizarGiro(graus: number): number {
  const g = Math.round(graus / 90) * 90;
  return ((g % 360) + 360) % 360;
}

/** true se a lista usa cada página de 0 a total-1 exatamente uma vez (só mudou a ordem ou o giro). */
export function ehPermutacao(indices: number[], total: number): boolean {
  if (indices.length !== total) return false;
  const vistos = new Set<number>();
  for (const i of indices) {
    if (!Number.isInteger(i) || i < 0 || i >= total || vistos.has(i)) return false;
    vistos.add(i);
  }
  return true;
}

/**
 * Quanto a miniatura precisa encolher (ou crescer) para caber na moldura depois de girada.
 * `aspecto` = largura / altura da página; `moldura` = largura / altura da moldura (3:4).
 */
export function escalaGirada(aspecto: number, giro: number, moldura = 3 / 4): number {
  if (!(aspecto > 0) || normalizarGiro(giro) % 180 === 0) return 1;
  // Tamanho da página na moldura (altura da moldura = 1).
  const [w, h] = aspecto > moldura ? [moldura, moldura / aspecto] : [aspecto, 1];
  // Girada, a largura vira altura e vice-versa.
  return Math.min(moldura / h, 1 / w);
}

/** Páginas pares ou ímpares (começando em 1) de um PDF com `total` páginas. */
export function paresOuImpares(total: number, qual: 'pares' | 'impares'): number[] {
  const r: number[] = [];
  for (let p = qual === 'pares' ? 2 : 1; p <= total; p += 2) r.push(p);
  return r;
}

/** Páginas de 1 a `total` que não estão em `tirar`. */
export function restantes(total: number, tirar: Iterable<number>): number[] {
  const fora = new Set(tirar);
  const r: number[] = [];
  for (let p = 1; p <= total; p++) if (!fora.has(p)) r.push(p);
  return r;
}

/**
 * Cria o PDF final com as páginas pedidas, na ordem pedida.
 * Se todas as páginas continuam (só mudou ordem ou giro), o próprio arquivo é editado: links,
 * formulários e marcadores continuam funcionando. Se alguma página sai, as escolhidas são copiadas
 * para um PDF novo, que fica menor porque não leva o que foi tirado.
 */
export async function montarPdf(dados: ArrayBuffer, paginas: PaginaEscolhida[]): Promise<Uint8Array> {
  if (!paginas.length) throw new Error('Nenhuma página para salvar.');
  const { degrees } = await carregarPdfLib();
  const original = await abrirParaEditar(dados);
  const total = original.getPageCount();
  if (paginas.some((p) => !Number.isInteger(p.indice) || p.indice < 0 || p.indice >= total)) {
    throw new Error('Página fora do PDF.');
  }
  const girar = (pg: ReturnType<typeof original.getPage>, extra: number) => {
    if (normalizarGiro(extra)) pg.setRotation(degrees(normalizarGiro(pg.getRotation().angle + extra)));
  };

  if (ehPermutacao(paginas.map((p) => p.indice), total)) {
    const todas = original.getPages();
    const mesmaOrdem = paginas.every((p, i) => p.indice === i);
    if (!mesmaOrdem) {
      for (let i = total - 1; i >= 0; i--) original.removePage(i);
      for (const p of paginas) original.addPage(todas[p.indice]);
    }
    paginas.forEach((p) => girar(todas[p.indice], p.giro));
    original.setModificationDate(new Date());
    return original.save();
  }

  return copiar(original, paginas);
}

/** Vários PDFs novos de uma vez (um por grupo), abrindo o original uma vez só. */
export async function montarVarios(dados: ArrayBuffer, grupos: PaginaEscolhida[][]): Promise<Uint8Array[]> {
  const original = await abrirParaEditar(dados);
  const total = original.getPageCount();
  const r: Uint8Array[] = [];
  for (const grupo of grupos) {
    if (!grupo.length || grupo.some((p) => !Number.isInteger(p.indice) || p.indice < 0 || p.indice >= total)) {
      throw new Error('Página fora do PDF.');
    }
    r.push(await copiar(original, grupo));
  }
  return r;
}

/** Copia as páginas para um PDF novo, já com o giro extra. */
async function copiar(original: PDFDocument, paginas: PaginaEscolhida[]): Promise<Uint8Array> {
  const { degrees } = await carregarPdfLib();
  const novo = await novoPdf();
  const copias = await novo.copyPages(original, paginas.map((p) => p.indice));
  copias.forEach((pg, i) => {
    const extra = normalizarGiro(paginas[i].giro);
    if (extra) pg.setRotation(degrees(normalizarGiro(pg.getRotation().angle + extra)));
    novo.addPage(pg);
  });
  return novo.save();
}
