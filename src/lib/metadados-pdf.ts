// Ler e mudar as "Propriedades do documento" de um PDF: título, autor, assunto, palavras-chave,
// programa que criou, produtor e datas. Recebe o módulo pdf-lib já carregado (baixado só quando
// a pessoa usa a ferramenta). Funciona no navegador e no Node.
import type { PDFDocument } from 'pdf-lib';

type PdfLib = typeof import('pdf-lib');

export interface Metadados {
  titulo: string;
  autor: string;
  assunto: string;
  palavrasChave: string;
  criador: string;
  produtor: string;
  criacao: Date | null;
  modificacao: Date | null;
}

export interface Leitura extends Metadados {
  /** Outras informações gravadas no PDF (ex.: "Company"), com o valor em texto. */
  extras: { chave: string; valor: string }[];
  /** O PDF tem a cópia XMP das informações (lida primeiro por alguns programas, como o Acrobat). */
  temXmp: boolean;
}

/** Chave do PDF para cada campo de texto. */
export const CHAVES_TEXTO = {
  titulo: 'Title', autor: 'Author', assunto: 'Subject', palavrasChave: 'Keywords', criador: 'Creator', produtor: 'Producer',
} as const;
const CHAVES_DATA = { criacao: 'CreationDate', modificacao: 'ModDate' } as const;
const CONHECIDAS = new Set<string>([...Object.values(CHAVES_TEXTO), ...Object.values(CHAVES_DATA)]);

/** O dicionário de informações (/Info), sem criar um novo se não existir. */
function dicionario(lib: PdfLib, doc: PDFDocument) {
  const info = doc.context.lookup(doc.context.trailerInfo.Info);
  return info instanceof lib.PDFDict ? info : null;
}

function texto(lib: PdfLib, valor: unknown): string {
  if (valor instanceof lib.PDFString || valor instanceof lib.PDFHexString) {
    // Alguns programas gravam um caractere nulo no fim; ele some aqui.
    return valor.decodeText().replace(/\u0000+$/, '');
  }
  if (valor instanceof lib.PDFName) return valor.decodeText();
  if (valor instanceof lib.PDFNumber) return String(valor.asNumber());
  if (valor instanceof lib.PDFBool) return valor.asBoolean() ? 'sim' : 'não';
  return '';
}

function data(lib: PdfLib, valor: unknown): Date | null {
  if (!(valor instanceof lib.PDFString || valor instanceof lib.PDFHexString)) return null;
  try {
    const d = valor.decodeDate();
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function lerMetadados(lib: PdfLib, doc: PDFDocument): Leitura {
  const info = dicionario(lib, doc);
  const pegar = (k: string) => info?.lookup(lib.PDFName.of(k));
  const r: Leitura = {
    titulo: '', autor: '', assunto: '', palavrasChave: '', criador: '', produtor: '',
    criacao: data(lib, pegar(CHAVES_DATA.criacao)),
    modificacao: data(lib, pegar(CHAVES_DATA.modificacao)),
    extras: [],
    temXmp: doc.catalog.has(lib.PDFName.of('Metadata')),
  };
  for (const [campo, chave] of Object.entries(CHAVES_TEXTO)) r[campo as keyof typeof CHAVES_TEXTO] = texto(lib, pegar(chave)).trim();
  if (info) {
    for (const [nome, valor] of info.entries()) {
      const chave = nome.decodeText();
      if (CONHECIDAS.has(chave)) continue;
      r.extras.push({ chave, valor: texto(lib, doc.context.lookup(valor)) });
    }
  }
  return r;
}

/** Tira a cópia XMP das informações (no catálogo e nas páginas). */
function removerXmp(lib: PdfLib, doc: PDFDocument) {
  const M = lib.PDFName.of('Metadata');
  doc.catalog.delete(M);
  for (const p of doc.getPages()) p.node.delete(M);
}

/**
 * Grava as informações. Campo vazio apaga a informação. `apagarExtras` tira também as outras
 * informações (como "Company"). A cópia XMP é sempre removida, para valer o que foi escrito aqui.
 */
export function gravarMetadados(lib: PdfLib, doc: PDFDocument, m: Metadados, apagarExtras = false): void {
  let info = dicionario(lib, doc);
  if (!info) {
    info = doc.context.obj({});
    doc.context.trailerInfo.Info = doc.context.register(info);
  }
  for (const [campo, chave] of Object.entries(CHAVES_TEXTO)) {
    const v = m[campo as keyof typeof CHAVES_TEXTO].trim();
    if (v) info.set(lib.PDFName.of(chave), lib.PDFHexString.fromText(v));
    else info.delete(lib.PDFName.of(chave));
  }
  for (const [campo, chave] of Object.entries(CHAVES_DATA)) {
    const d = m[campo as keyof typeof CHAVES_DATA];
    if (d && !Number.isNaN(d.getTime())) info.set(lib.PDFName.of(chave), lib.PDFString.fromDate(d));
    else info.delete(lib.PDFName.of(chave));
  }
  if (apagarExtras) {
    for (const [nome] of info.entries()) if (!CONHECIDAS.has(nome.decodeText())) info.delete(nome);
  }
  removerXmp(lib, doc);
  if (!info.keys().length) delete doc.context.trailerInfo.Info;
}

/** Valor para um <input type="datetime-local"> (hora local, sem segundos). */
export function paraCampoData(d: Date | null): string {
  if (!d) return '';
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

/** Lê o valor de um <input type="datetime-local">. Vazio ou inválido dá null. */
export function lerCampoData(valor: string): Date | null {
  const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  return Number.isNaN(d.getTime()) ? null : d;
}
