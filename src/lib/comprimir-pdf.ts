// Motor do "Comprimir PDF". Roda só no navegador.
// - Leve, Recomendada e Forte: recomprimem as fotos do PDF (JPEG e imagens Flate RGB/cinza de 8 bits)
//   em JPEG, na resolução em que aparecem na página. Texto, fontes e desenhos não são tocados.
// - Máxima: cada página vira uma foto JPEG (o texto deixa de ser selecionável).
// - Tamanho alvo: procura o degrau mais leve que fica abaixo do tamanho pedido.
// A previsão de tamanho recomprime uma amostra das maiores imagens e extrapola para o resto.
import type { PDFDocument, PDFRawStream, PDFRef, PDFDict, PDFObject } from 'pdf-lib';
import { abrirParaEditar, abrirParaVer, carregarPdfLib, desenharPagina, fecharPdf, novoPdf, AREA_MAXIMA_CANVAS, type DocumentoPdfJs } from './pdf-navegador';
import { codificar, desenhar } from './canvas';
import {
  BYTES_MINIMOS, ESCADA, GANHO_MINIMO, IDENTIDADE, RASTER, buscarDegrau, desfazerPreditorPng, escolherAmostra, fatorDeReducao,
  multiplicar, paraRgba, percorrerConteudo, preverEconomia, semExif, tamanhoFinal, tamanhoNaPagina,
  type Degrau, type ImagemParaPrever, type Matriz,
} from './pdf-conteudo';

type PdfLib = typeof import('pdf-lib');

export class Cancelado extends Error { constructor() { super('Cancelado'); } }
/** A página marca `cancelado = true` para interromper o trabalho no próximo passo. */
export interface Sinal { cancelado: boolean; }
const conferir = (s?: Sinal) => { if (s?.cancelado) throw new Cancelado(); };
/** Progresso: quanto já foi feito (0 a 1) e uma frase para mostrar. */
export type Progresso = (fracao: number, texto: string) => void;

export type MotivoPulo = 'cmyk' | 'mascara' | 'jbig2' | 'jpx' | 'indexada' | 'outro';
export const NOME_DO_MOTIVO: Record<MotivoPulo, string> = {
  cmyk: 'em cores CMYK (de gráfica)',
  mascara: 'com máscara de bits',
  jbig2: 'em JBIG2 (preto e branco de scanner)',
  jpx: 'em JPEG 2000',
  indexada: 'com paleta de cores',
  outro: 'em outro formato especial',
};

interface Resultado { bytes: Uint8Array; largura: number; altura: number; }

interface Imagem {
  ref: PDFRef;
  original: PDFRawStream;
  tipo: 'jpeg' | 'flate';
  largura: number;
  altura: number;
  cores: 1 | 3;
  preditor: boolean;
  /** Imagem em tons de cinza: o JPEG do canvas sai em RGB, então o espaço de cor muda junto. */
  virarRgb: boolean;
  bytes: number;
  /** Maior tamanho em que aparece, em pontos por pixel (null = não achamos onde ela é desenhada). */
  ptPorPixel: number | null;
  /** Por degrau da escada: o JPEG novo (se compensa) ou null (não compensa). */
  resultados: Map<number, Resultado | null>;
  /** Bytes do JPEG gerado em cada degrau, mesmo quando não compensa (usado na previsão). */
  medidos: (number | undefined)[];
  /** A imagem não pôde ser decodificada: fica como está. */
  falhou?: boolean;
}

export interface Analise {
  nome: string;
  dados: ArrayBuffer;
  tamanhoOriginal: number;
  paginas: number;
  /** Bytes de todas as imagens do arquivo (inclusive as que não dá para mexer). */
  bytesImagens: number;
  quantidadeImagens: number;
  /** Imagens que dá para recomprimir. */
  imagens: Imagem[];
  puladas: Record<MotivoPulo, number>;
  bytesPulados: number;
  /** Tamanho do arquivo regravado sem mexer nas imagens (objetos compactados, sobras removidas). */
  base: number;
  /** Área de cada página em pontos quadrados (para prever o modo Máxima). */
  areas: number[];
  doc: PDFDocument;
  lib: PdfLib;
  visor: DocumentoPdfJs | null;
}

const OPCOES_SALVAR = { useObjectStreams: true, addDefaultPage: false, updateFieldAppearances: false, objectsPerTick: 200 };

// ---------------------------------------------------------------------------------------------
// Análise

function numero(lib: PdfLib, d: PDFDict, chave: string): number | undefined {
  const v = d.lookup(lib.PDFName.of(chave));
  return v instanceof lib.PDFNumber ? v.asNumber() : undefined;
}

function nomesDoFiltro(lib: PdfLib, d: PDFDict): string[] {
  const f = d.lookup(lib.PDFName.of('Filter'));
  if (f instanceof lib.PDFName) return [f.decodeText()];
  if (f instanceof lib.PDFArray) return f.asArray().map((x) => (x instanceof lib.PDFName ? x.decodeText() : '?'));
  return [];
}

/** Quantos componentes de cor tem o espaço de cor, ou o motivo para pular. */
function componentes(lib: PdfLib, doc: PDFDocument, cs: PDFObject | undefined): { cores: 1 | 3; cinza: boolean } | MotivoPulo {
  const { PDFName, PDFArray, PDFRawStream } = lib;
  if (cs instanceof PDFName) {
    const n = cs.decodeText();
    if (n === 'DeviceRGB' || n === 'RGB') return { cores: 3, cinza: false };
    if (n === 'DeviceGray' || n === 'G') return { cores: 1, cinza: true };
    if (n === 'DeviceCMYK' || n === 'CMYK') return 'cmyk';
    return 'outro';
  }
  if (cs instanceof PDFArray && cs.size() > 0) {
    const tipo = cs.lookup(0);
    const nome = tipo instanceof PDFName ? tipo.decodeText() : '';
    if (nome === 'Indexed' || nome === 'I') return 'indexada';
    if (nome === 'CalRGB') return { cores: 3, cinza: false };
    if (nome === 'CalGray') return { cores: 1, cinza: true };
    if (nome === 'ICCBased' && cs.size() > 1) {
      const perfil = doc.context.lookup(cs.get(1));
      const n = perfil instanceof PDFRawStream ? numero(lib, perfil.dict, 'N') : undefined;
      if (n === 3) return { cores: 3, cinza: false };
      if (n === 1) return { cores: 1, cinza: true };
      if (n === 4) return 'cmyk';
    }
    return 'outro';
  }
  return 'outro';
}

/** Remove os objetos que nenhuma página ou dado do documento usa (sobras de edições antigas). */
function removerNaoUsados(lib: PdfLib, doc: PDFDocument): void {
  const { PDFRef, PDFDict, PDFArray, PDFStream } = lib;
  const ctx = doc.context;
  const vistos = new Set<string>();
  const fila: PDFObject[] = [];
  const t = ctx.trailerInfo;
  for (const o of [t.Root, t.Info]) if (o) fila.push(o);
  while (fila.length) {
    const o = fila.pop()!;
    if (o instanceof PDFRef) {
      const k = o.toString();
      if (vistos.has(k)) continue;
      vistos.add(k);
      const alvo = ctx.lookup(o);
      if (alvo) fila.push(alvo);
    } else if (o instanceof PDFDict) {
      for (const [, v] of o.entries()) fila.push(v);
    } else if (o instanceof PDFArray) {
      for (const v of o.asArray()) fila.push(v);
    } else if (o instanceof PDFStream) {
      fila.push(o.dict);
    }
  }
  // Se a raiz não foi achada, algo está estranho: melhor não apagar nada.
  if (!vistos.size) return;
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!vistos.has(ref.toString())) ctx.delete(ref);
}

async function comprimirZlib(dados: Uint8Array): Promise<Uint8Array> {
  const fluxo = new Blob([dados as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

/** Descompacta Flate (zlib). Aceita fluxos que terminam sem o fecho, comuns em PDFs gerados às pressas. */
async function descomprimirZlib(dados: Uint8Array, esperado: number): Promise<Uint8Array> {
  const leitor = new Blob([dados as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      partes.push(value); total += value.length;
    }
  } catch (e) {
    if (total < esperado) throw e;
  }
  const saida = new Uint8Array(total);
  let o = 0;
  for (const p of partes) { saida.set(p, o); o += p.length; }
  return saida;
}

/** Compacta (sem perda) os fluxos que estão guardados sem nenhuma compressão. */
async function compactarFluxosCrus(lib: PdfLib, doc: PDFDocument, sinal?: Sinal): Promise<void> {
  const { PDFName, PDFRawStream } = lib;
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.contents.length < 512) continue;
    if (obj.dict.has(PDFName.of('Filter'))) continue;
    if (obj.dict.lookup(PDFName.of('Type')) === PDFName.of('Metadata')) continue;
    conferir(sinal);
    const z = await comprimirZlib(obj.contents);
    if (z.length >= obj.contents.length * 0.95) continue;
    const dict = obj.dict.clone(doc.context);
    dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
    dict.delete(PDFName.of('DecodeParms'));
    doc.context.assign(ref, PDFRawStream.of(dict, z));
  }
}

function lerMatriz(lib: PdfLib, d: PDFDict): Matriz | null {
  const m = d.lookup(lib.PDFName.of('Matrix'));
  if (!(m instanceof lib.PDFArray) || m.size() !== 6) return null;
  const v = m.asArray().map((x) => (x instanceof lib.PDFNumber ? x.asNumber() : NaN));
  return v.every(Number.isFinite) ? (v as Matriz) : null;
}

/** Procura em todas as páginas onde cada imagem é desenhada e guarda o maior tamanho (pontos por pixel). */
async function medirUsos(lib: PdfLib, doc: PDFDocument, sinal?: Sinal): Promise<Map<string, number>> {
  const { PDFName, PDFDict, PDFRawStream, PDFRef, PDFArray, PDFStream, decodePDFRawStream } = lib;
  const usos = new Map<string, number>();
  const conteudoDeForm = new Map<string, Uint8Array | null>();
  let orcamento = 20000; // limite de formulários lidos, para PDFs patológicos
  const NOME_XOBJECT = PDFName.of('XObject');
  const IMAGEM = PDFName.of('Image');
  const FORM = PDFName.of('Form');

  const decodificar = (s: PDFRawStream): Uint8Array | null => {
    try { return decodePDFRawStream(s).decode(); } catch { return null; }
  };

  const visitar = (bytes: Uint8Array, recursos: PDFDict | undefined, ctm: Matriz, profundidade: number) => {
    const xo = recursos?.lookup(NOME_XOBJECT);
    if (!(xo instanceof PDFDict)) return;
    percorrerConteudo(bytes, ctm, (nome, m) => {
      const ref = xo.get(PDFName.of(nome));
      if (!(ref instanceof PDFRef)) return;
      const obj = doc.context.lookup(ref);
      if (!(obj instanceof PDFRawStream)) return;
      const sub = obj.dict.lookup(PDFName.of('Subtype'));
      if (sub === IMAGEM) {
        const w = numero(lib, obj.dict, 'Width') ?? 0, h = numero(lib, obj.dict, 'Height') ?? 0;
        if (!(w > 0 && h > 0)) return;
        const t = tamanhoNaPagina(m);
        const r = Math.max(t.largura / w, t.altura / h);
        const k = ref.toString();
        if (Number.isFinite(r)) usos.set(k, Math.max(usos.get(k) ?? 0, r));
      } else if (sub === FORM && profundidade < 8 && orcamento-- > 0) {
        const k = ref.toString();
        if (!conteudoDeForm.has(k)) conteudoDeForm.set(k, decodificar(obj));
        const c = conteudoDeForm.get(k);
        if (!c) return;
        const res = obj.dict.lookup(PDFName.of('Resources'));
        const matriz = lerMatriz(lib, obj.dict) ?? IDENTIDADE;
        visitar(c, res instanceof PDFDict ? res : recursos, multiplicar(matriz, m), profundidade + 1);
      }
    });
  };

  const paginas = doc.getPages();
  for (const [i, pagina] of paginas.entries()) {
    if (i % 10 === 0) { conferir(sinal); await new Promise((r) => setTimeout(r, 0)); }
    const conteudo = pagina.node.Contents();
    const fluxos = conteudo instanceof PDFArray
      ? conteudo.asArray().map((x) => doc.context.lookup(x))
      : [conteudo];
    const partes: Uint8Array[] = [];
    for (const f of fluxos) {
      if (f instanceof PDFRawStream) { const d = decodificar(f); if (d) partes.push(d); }
      else if (f instanceof PDFStream) partes.push(f.getContents());
    }
    const total = partes.reduce((s, p) => s + p.length + 1, 0);
    const junto = new Uint8Array(total);
    let o = 0;
    for (const p of partes) { junto.set(p, o); o += p.length; junto[o++] = 10; }
    visitar(junto, pagina.node.Resources(), IDENTIDADE, 0);
  }
  return usos;
}

/** Abre o PDF, limpa sobras e descobre o que dá para comprimir. */
export async function analisar(dados: ArrayBuffer, nome: string, sinal?: Sinal): Promise<Analise> {
  const lib = await carregarPdfLib();
  const { PDFName, PDFRawStream, PDFRef, PDFBool, PDFDict, PDFArray } = lib;
  const doc = await abrirParaEditar(dados);
  conferir(sinal);
  removerNaoUsados(lib, doc);
  await compactarFluxosCrus(lib, doc, sinal);

  const IMAGEM = PDFName.of('Image');
  const SMASK = PDFName.of('SMask');
  const streams: [PDFRef, PDFRawStream][] = [];
  const mascarasSuaves = new Set<string>();
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || obj.dict.lookup(PDFName.of('Subtype')) !== IMAGEM) continue;
    streams.push([ref, obj]);
    const sm = obj.dict.get(SMASK);
    if (sm instanceof PDFRef) mascarasSuaves.add(sm.toString());
  }

  const usos = await medirUsos(lib, doc, sinal);
  const puladas: Record<MotivoPulo, number> = { cmyk: 0, mascara: 0, jbig2: 0, jpx: 0, indexada: 0, outro: 0 };
  let bytesImagens = 0, bytesPulados = 0;
  const imagens: Imagem[] = [];

  for (const [ref, s] of streams) {
    const d = s.dict;
    const tam = s.contents.length;
    bytesImagens += tam;
    if (mascarasSuaves.has(ref.toString()) || tam < BYTES_MINIMOS) continue;
    const pular = (m: MotivoPulo) => { puladas[m]++; bytesPulados += tam; };

    const filtros = nomesDoFiltro(lib, d);
    if (filtros.includes('JBIG2Decode')) { pular('jbig2'); continue; }
    if (filtros.includes('JPXDecode')) { pular('jpx'); continue; }
    if (d.lookup(PDFName.of('ImageMask')) === PDFBool.True || d.has(PDFName.of('Mask'))) { pular('mascara'); continue; }
    const tipo = filtros.length === 1 && (filtros[0] === 'DCTDecode' || filtros[0] === 'DCT') ? 'jpeg'
      : filtros.length === 1 && (filtros[0] === 'FlateDecode' || filtros[0] === 'Fl') ? 'flate' : null;
    if (!tipo) { pular('outro'); continue; }
    const cs = componentes(lib, doc, d.lookup(PDFName.of('ColorSpace')));
    if (typeof cs === 'string') { pular(cs); continue; }
    const largura = numero(lib, d, 'Width') ?? 0, altura = numero(lib, d, 'Height') ?? 0;
    const bpc = numero(lib, d, 'BitsPerComponent');
    if (!(largura > 0 && altura > 0) || (bpc !== undefined && bpc !== 8) || (tipo === 'flate' && bpc !== 8)) { pular('outro'); continue; }
    if (d.has(PDFName.of('Decode'))) { pular('outro'); continue; }
    // A máscara de transparência é mantida como está; só pulamos a rara com cor de fundo "Matte".
    const sm = d.lookup(SMASK);
    if (sm instanceof PDFRawStream && sm.dict.has(PDFName.of('Matte'))) { pular('outro'); continue; }

    let preditor = false;
    const parms = d.lookup(PDFName.of('DecodeParms'));
    const parmsDict = parms instanceof PDFDict ? parms : parms instanceof PDFArray ? parms.lookup(0) : undefined;
    if (parmsDict instanceof PDFDict) {
      if (tipo === 'jpeg') {
        if (parmsDict.has(PDFName.of('ColorTransform'))) { pular('outro'); continue; }
      } else {
        const p = numero(lib, parmsDict, 'Predictor') ?? 1;
        if (p >= 10) {
          const cores = numero(lib, parmsDict, 'Colors') ?? 1;
          const b = numero(lib, parmsDict, 'BitsPerComponent') ?? 8;
          const col = numero(lib, parmsDict, 'Columns') ?? 1;
          if (cores !== cs.cores || b !== 8 || col !== largura) { pular('outro'); continue; }
          preditor = true;
        } else if (p !== 1) { pular('outro'); continue; }
      }
    }

    imagens.push({
      ref, original: s, tipo, largura, altura, cores: cs.cores, preditor, virarRgb: cs.cinza,
      bytes: tam, ptPorPixel: usos.get(ref.toString()) ?? null, resultados: new Map(), medidos: [],
    });
  }

  conferir(sinal);
  const base = (await doc.save(OPCOES_SALVAR)).length;
  const areas = doc.getPages().map((p) => { const c = p.getCropBox(); return Math.abs(c.width * c.height); });

  return {
    nome, dados, tamanhoOriginal: dados.byteLength, paginas: doc.getPageCount(),
    bytesImagens, quantidadeImagens: streams.length - mascarasSuaves.size, imagens, puladas, bytesPulados,
    base, areas, doc, lib, visor: null,
  };
}

export function fecharAnalise(a: Analise | null | undefined): void {
  if (!a) return;
  fecharPdf(a.visor);
  a.visor = null;
}

async function visorDe(a: Analise): Promise<DocumentoPdfJs> {
  if (!a.visor) a.visor = await abrirParaVer(a.dados);
  return a.visor;
}

// ---------------------------------------------------------------------------------------------
// Recompressão das imagens

async function decodificar(img: Imagem): Promise<ImageBitmap> {
  const opcoes = { colorSpaceConversion: 'none', premultiplyAlpha: 'none' } as ImageBitmapOptions;
  if (img.tipo === 'jpeg') {
    return createImageBitmap(new Blob([semExif(img.original.contents) as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }), opcoes);
  }
  const esperado = img.largura * img.altura * img.cores + (img.preditor ? img.altura : 0);
  let px = await descomprimirZlib(img.original.contents, esperado);
  if (img.preditor) px = desfazerPreditorPng(px, img.largura, img.cores);
  if (px.length < img.largura * img.altura * img.cores) throw new Error('imagem incompleta');
  return createImageBitmap(new ImageData(paraRgba(px, img.largura, img.altura, img.cores), img.largura, img.altura), opcoes);
}

/** Gera o JPEG novo da imagem nos degraus pedidos (os que ainda não foram feitos). */
async function recomprimir(img: Imagem, degraus: number[], sinal?: Sinal): Promise<void> {
  const faltam = degraus.filter((d) => !img.resultados.has(d));
  if (!faltam.length) return;
  if (img.falhou) { for (const d of faltam) img.resultados.set(d, null); return; }
  let bitmap: ImageBitmap;
  try { bitmap = await decodificar(img); } catch {
    img.falhou = true;
    for (const d of faltam) img.resultados.set(d, null);
    return;
  }
  try {
    for (const d of faltam) {
      conferir(sinal);
      const { dpi, qualidade } = ESCADA[d];
      const { largura, altura } = tamanhoFinal(img.largura, img.altura, fatorDeReducao(img.ptPorPixel, dpi), AREA_MAXIMA_CANVAS);
      const canvas = desenhar(bitmap, largura, altura);
      let blob: Blob;
      try { blob = await codificar(canvas, 'image/jpeg', qualidade); } finally { canvas.width = canvas.height = 0; }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      img.medidos[d] = bytes.length;
      img.resultados.set(d, bytes.length < img.bytes * GANHO_MINIMO ? { bytes, largura, altura } : null);
    }
  } finally {
    bitmap.close();
  }
}

/** Tamanho do arquivo se as imagens forem trocadas no degrau (exato a menos de alguns bytes). */
function tamanhoNoDegrau(a: Analise, degrau: number): number {
  let economia = 0;
  for (const img of a.imagens) {
    const r = img.resultados.get(degrau);
    if (r) economia += img.bytes - r.bytes.length;
  }
  return a.base - economia;
}

async function prepararDegrau(a: Analise, degrau: number, progresso: Progresso, sinal?: Sinal) {
  const n = a.imagens.length;
  for (const [i, img] of a.imagens.entries()) {
    conferir(sinal);
    progresso(i / Math.max(n, 1), `imagem ${i + 1} de ${n}`);
    await recomprimir(img, [degrau], sinal);
  }
}

/** Grava o PDF com as imagens do degrau e devolve os originais ao documento em seguida. */
async function salvarNoDegrau(a: Analise, degrau: number): Promise<Uint8Array> {
  const { PDFName, PDFNumber, PDFRawStream } = a.lib;
  const ctx = a.doc.context;
  const trocadas: Imagem[] = [];
  try {
    for (const img of a.imagens) {
      const r = img.resultados.get(degrau);
      if (!r) continue;
      const dict = img.original.dict.clone(ctx);
      dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
      dict.delete(PDFName.of('DecodeParms'));
      dict.set(PDFName.of('Width'), PDFNumber.of(r.largura));
      dict.set(PDFName.of('Height'), PDFNumber.of(r.altura));
      dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
      if (img.virarRgb) dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
      ctx.assign(img.ref, PDFRawStream.of(dict, r.bytes));
      trocadas.push(img);
    }
    return await a.doc.save(OPCOES_SALVAR);
  } finally {
    for (const img of trocadas) ctx.assign(img.ref, img.original);
  }
}

// ---------------------------------------------------------------------------------------------
// Modo Máxima: cada página vira uma imagem

async function paginaEmJpeg(visor: DocumentoPdfJs, n: number, d: Degrau): Promise<{ bytes: Uint8Array; largura: number; altura: number }> {
  const pagina = await visor.getPage(n);
  const vp = pagina.getViewport({ scale: 1 });
  const { canvas } = await desenharPagina(visor, n, d.dpi / 72);
  let blob: Blob;
  try { blob = await codificar(canvas, 'image/jpeg', d.qualidade); } finally { canvas.width = canvas.height = 0; }
  return { bytes: new Uint8Array(await blob.arrayBuffer()), largura: vp.width, altura: vp.height };
}

export async function rasterizar(a: Analise, progresso: Progresso, sinal?: Sinal, d: Degrau = RASTER): Promise<Uint8Array> {
  const visor = await visorDe(a);
  const novo = await novoPdf();
  const titulo = a.doc.getTitle();
  if (titulo) novo.setTitle(titulo);
  for (let n = 1; n <= a.paginas; n++) {
    conferir(sinal);
    progresso((n - 1) / a.paginas, `página ${n} de ${a.paginas}`);
    const p = await paginaEmJpeg(visor, n, d);
    const img = await novo.embedJpg(p.bytes);
    novo.addPage([p.largura, p.altura]).drawImage(img, { x: 0, y: 0, width: p.largura, height: p.altura });
  }
  return novo.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 50 });
}

// ---------------------------------------------------------------------------------------------
// Previsão

export interface Previsao {
  /** Tamanho previsto em cada degrau da escada (undefined = ainda não calculado). */
  escada: (number | undefined)[];
  maxima?: number;
}

/** Quantas imagens vão na amostra da previsão. */
const AMOSTRA = 6;

function paraPrever(a: Analise): ImagemParaPrever[] {
  return a.imagens.filter((i) => !i.falhou).map((img) => ({
    bytes: img.bytes,
    grupo: img.tipo,
    medido: img.medidos,
    pixelsOriginais: img.largura * img.altura,
    pixelsFinais: ESCADA.map((d) => {
      const t = tamanhoFinal(img.largura, img.altura, fatorDeReducao(img.ptPorPixel, d.dpi), AREA_MAXIMA_CANVAS);
      return t.largura * t.altura;
    }),
  }));
}

function preverDegrau(a: Analise, degrau: number): number {
  const e = preverEconomia(paraPrever(a), degrau);
  return a.base - (e ?? 0);
}

/**
 * Calcula a previsão por partes e avisa a página a cada parte (`aoAtualizar`):
 * primeiro os três níveis, depois o modo Máxima e por fim os outros degraus (para o "Tamanho alvo").
 */
export async function prever(
  a: Analise,
  degrausDosNiveis: number[],
  aoAtualizar: (p: Previsao) => void,
  sinal?: Sinal,
): Promise<Previsao> {
  const previsao: Previsao = { escada: ESCADA.map(() => undefined) };
  const amostra = escolherAmostra(a.imagens.map((i) => i.bytes), AMOSTRA).map((k) => a.imagens[k]);

  for (const img of amostra) await recomprimir(img, degrausDosNiveis, sinal);
  for (const d of degrausDosNiveis) previsao.escada[d] = preverDegrau(a, d);
  aoAtualizar(previsao);

  // Máxima: desenha 1 ou 2 páginas e extrapola pela área das páginas.
  try {
    const visor = await visorDe(a);
    const amostras = a.paginas >= 3 ? [1, Math.ceil(a.paginas / 2)] : a.paginas === 2 ? [1, 2] : [1];
    let bytes = 0, area = 0;
    for (const n of amostras) {
      conferir(sinal);
      const p = await paginaEmJpeg(visor, n, RASTER);
      bytes += p.bytes.length;
      area += a.areas[n - 1] || p.largura * p.altura;
    }
    const totalArea = a.areas.reduce((s, x) => s + x, 0);
    // Cada página leva uns 300 bytes de estrutura, mais o cabeçalho do arquivo.
    previsao.maxima = Math.round((bytes / Math.max(area, 1)) * totalArea + a.paginas * 300 + 1200);
  } catch (e) {
    if (e instanceof Cancelado) throw e;
  }
  aoAtualizar(previsao);

  const resto = ESCADA.map((_, i) => i).filter((i) => !degrausDosNiveis.includes(i));
  for (const img of amostra) await recomprimir(img, resto, sinal);
  for (const d of resto) previsao.escada[d] = preverDegrau(a, d);
  aoAtualizar(previsao);
  return previsao;
}

// ---------------------------------------------------------------------------------------------
// Comprimir de verdade

export interface Saida {
  bytes: Uint8Array;
  /** O resultado ficou maior que o original: devolvemos o original. */
  original: boolean;
  /** Para o tamanho alvo: se chegou abaixo do pedido. */
  atingiu?: boolean;
  /** Imagens trocadas. */
  trocadas: number;
}

function finalizar(a: Analise, bytes: Uint8Array, trocadas: number): Saida {
  if (bytes.length >= a.tamanhoOriginal) return { bytes: new Uint8Array(a.dados.slice(0)), original: true, trocadas: 0 };
  return { bytes, original: false, trocadas };
}

export async function comprimirNoDegrau(a: Analise, degrau: number, progresso: Progresso, sinal?: Sinal): Promise<Saida> {
  await prepararDegrau(a, degrau, progresso, sinal);
  conferir(sinal);
  progresso(1, 'gravando o arquivo');
  const bytes = await salvarNoDegrau(a, degrau);
  return finalizar(a, bytes, a.imagens.filter((i) => i.resultados.get(degrau)).length);
}

export async function comprimirMaxima(a: Analise, progresso: Progresso, sinal?: Sinal): Promise<Saida> {
  const bytes = await rasterizar(a, progresso, sinal);
  return finalizar(a, bytes, 0);
}

/**
 * Tamanho alvo: busca binária na escada. O primeiro palpite vem da previsão; cada tentativa
 * recomprime as imagens naquele degrau e soma os bytes (sem precisar gravar o arquivo).
 */
export async function comprimirParaAlvo(a: Analise, alvo: number, previsao: Previsao | null, progresso: Progresso, sinal?: Sinal): Promise<Saida & { degrau: number }> {
  const margem = alvo * 0.985;
  let palpite = previsao ? previsao.escada.findIndex((t) => t !== undefined && t <= margem) : -1;
  if (palpite < 0) palpite = ESCADA.length - 1;
  let tentativa = 0;
  const { indice } = await buscarDegrau(ESCADA.length, margem, async (i) => {
    tentativa++;
    await prepararDegrau(a, i, (f, t) => progresso(Math.min(0.9, (tentativa - 1) * 0.25 + f * 0.25), `tentativa ${tentativa} · ${t}`), sinal);
    return tamanhoNoDegrau(a, i);
  }, palpite);
  let degrau = indice < 0 ? ESCADA.length - 1 : indice;
  await prepararDegrau(a, degrau, () => undefined, sinal);
  progresso(0.95, 'gravando o arquivo');
  let bytes = await salvarNoDegrau(a, degrau);
  // A soma é quase exata; se passar por poucos bytes, desce mais um degrau.
  while (bytes.length > alvo && degrau < ESCADA.length - 1) {
    degrau++;
    await prepararDegrau(a, degrau, (_f, t) => progresso(0.95, `ajuste final · ${t}`), sinal);
    bytes = await salvarNoDegrau(a, degrau);
  }
  const s = finalizar(a, bytes, a.imagens.filter((i) => i.resultados.get(degrau)).length);
  return { ...s, degrau, atingiu: s.bytes.length <= alvo };
}

// ---------------------------------------------------------------------------------------------
// Pré-visualização

/** Desenha a 1ª página de um PDF (em bytes) como imagem PNG, com a largura pedida em pixels. */
export async function previaPrimeiraPagina(bytes: ArrayBuffer, largura: number): Promise<Blob> {
  const visor = await abrirParaVer(bytes);
  try {
    const pagina = await visor.getPage(1);
    const base = pagina.getViewport({ scale: 1 });
    const { canvas } = await desenharPagina(visor, 1, largura / base.width);
    try { return await codificar(canvas, 'image/png'); } finally { canvas.width = canvas.height = 0; }
  } finally {
    fecharPdf(visor);
  }
}
