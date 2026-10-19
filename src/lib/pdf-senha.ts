// Colocar e tirar senha de PDF, tudo no navegador.
// O pdf-lib oficial (1.17.1) não criptografa. Aqui usamos o @cantoo/pdf-lib, um fork mantido que
// lê PDFs protegidos (RC4 de 40/128 bits, AES-128 e AES-256) e grava com AES-256 (revisão 6 do PDF 2.0).
// Ele é carregado com import() só quando a pessoa usa a ferramenta.
import { ErroPdf } from './pdf-navegador';

type Cantoo = typeof import('@cantoo/pdf-lib');
let lib: Promise<Cantoo> | null = null;

export function carregarCantoo(): Promise<Cantoo> {
  if (!lib) {
    lib = import('@cantoo/pdf-lib');
    lib.catch(() => { lib = null; });
  }
  return lib;
}

export type Algoritmo = 'AES-256' | 'AES-128';

export interface Permissoes {
  imprimir: boolean;
  copiar: boolean;
  editar: boolean;
}

export const TODAS_PERMISSOES: Permissoes = { imprimir: true, copiar: true, editar: true };

/** Situação do arquivo antes de qualquer senha. */
export type Situacao =
  | { tipo: 'livre'; paginas: number }           // não tem proteção nenhuma
  | { tipo: 'restricoes' }                       // abre sem senha, mas bloqueia impressão, cópia ou edição
  | { tipo: 'senha' };                           // pede senha para abrir

const MSG_INVALIDO = 'Não foi possível abrir este arquivo. Ele pode estar corrompido ou não ser um PDF.';
const MSG_TIPO = 'Este PDF usa um tipo de proteção que o navegador não consegue abrir (por exemplo, proteção por certificado digital).';

function erroDeLeitura(e: unknown): ErroPdf {
  const msg = (e as Error)?.message ?? '';
  if (/password incorrect|needs password/i.test(msg)) return new ErroPdf('Senha incorreta.', true);
  if (/encrypt|security|crypt|filter/i.test(msg)) return new ErroPdf(MSG_TIPO);
  return new ErroPdf(MSG_INVALIDO);
}

/** Lê o PDF sem decifrar e diz se ele tem senha de abertura, só restrições ou nada. */
export async function examinar(dados: ArrayBuffer): Promise<Situacao> {
  const { PDFDocument } = await carregarCantoo();
  let doc;
  try {
    doc = await PDFDocument.load(dados, { ignoreEncryption: true, updateMetadata: false });
  } catch (e) {
    throw erroDeLeitura(e);
  }
  if (!doc.isEncrypted) return { tipo: 'livre', paginas: doc.getPageCount() };
  try {
    // Senha de abertura vazia: o arquivo abre direto, só tem as restrições do "dono".
    await PDFDocument.load(dados, { password: '', updateMetadata: false });
    return { tipo: 'restricoes' };
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (/password incorrect|needs password/i.test(msg)) return { tipo: 'senha' };
    throw erroDeLeitura(e);
  }
}

export interface OpcoesProteger {
  senha: string;
  permissoes?: Permissoes;
  algoritmo?: Algoritmo;
}

/** Senha de permissões aleatória (ninguém conhece), usada quando a pessoa bloqueia impressão, cópia ou edição. */
function senhaAleatoria(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Devolve os bytes do PDF protegido com a senha. Recusa PDF que já tem proteção. */
export async function proteger(dados: ArrayBuffer, { senha, permissoes = TODAS_PERMISSOES, algoritmo = 'AES-256' }: OpcoesProteger): Promise<{ bytes: Uint8Array; paginas: number }> {
  if (!senha) throw new ErroPdf('Digite uma senha.');
  const { PDFDocument } = await carregarCantoo();
  let doc;
  try {
    doc = await PDFDocument.load(dados, { updateMetadata: false });
  } catch (e) {
    if ((e as Error)?.name === 'EncryptedPDFError' || /encrypt/i.test((e as Error)?.message ?? '')) {
      throw new ErroPdf('Este PDF já tem senha ou restrições. Tire a proteção antes no "Remover senha de PDF" e depois coloque a nova.', true);
    }
    throw erroDeLeitura(e);
  }
  const tudoLiberado = permissoes.imprimir && permissoes.copiar && permissoes.editar;
  doc.encrypt({
    userPassword: senha,
    // Sem restrições, a mesma senha serve para tudo. Com restrições, a senha de permissões é aleatória:
    // quem abre com a senha escolhida fica sujeito aos bloqueios.
    ownerPassword: tudoLiberado ? senha : senhaAleatoria(),
    algorithm: algoritmo,
    permissions: {
      printing: permissoes.imprimir ? 'highResolution' : false,
      copying: permissoes.copiar,
      contentAccessibility: true,
      modifying: permissoes.editar,
      annotating: permissoes.editar,
      fillingForms: permissoes.editar,
      documentAssembly: permissoes.editar,
    },
  });
  const bytes = await doc.save();
  return { bytes, paginas: doc.getPageCount() };
}

/**
 * Abre o PDF com a senha digitada e salva uma cópia sem proteção nenhuma.
 * Senha errada vira ErroPdf com `senha = true`.
 */
export async function removerSenha(dados: ArrayBuffer, senha: string): Promise<{ bytes: Uint8Array; paginas: number }> {
  const { PDFDocument } = await carregarCantoo();
  let doc;
  try {
    doc = await PDFDocument.load(dados, { password: senha, updateMetadata: false });
  } catch (e) {
    throw erroDeLeitura(e);
  }
  const bytes = await doc.save();
  return { bytes, paginas: doc.getPageCount() };
}

export interface Forca {
  /** 0 = fraca, 1 = razoável, 2 = boa, 3 = forte */
  nivel: 0 | 1 | 2 | 3;
  rotulo: string;
  dica: string;
}

const COMUNS = ['123456', '12345678', '123456789', 'senha', 'password', 'qwerty', 'abc123', '111111', '000000', 'brasil', 'mudar123', 'admin'];

/** Avaliação simples da senha, só para orientar. Não sai do aparelho. */
export function forcaDaSenha(senha: string): Forca {
  if (!senha) return { nivel: 0, rotulo: '', dica: '' };
  const s = senha.toLowerCase();
  if (COMUNS.some((c) => s === c || s.startsWith(c) && senha.length < c.length + 3)) {
    return { nivel: 0, rotulo: 'Fraca', dica: 'Essa senha está entre as mais usadas. Escolha outra.' };
  }
  if (/^(.)\1+$/.test(senha)) return { nivel: 0, rotulo: 'Fraca', dica: 'Evite repetir o mesmo caractere.' };
  let tipos = 0;
  if (/[a-z]/.test(senha)) tipos++;
  if (/[A-Z]/.test(senha)) tipos++;
  if (/\d/.test(senha)) tipos++;
  if (/[^a-zA-Z\d]/.test(senha)) tipos++;
  const n = senha.length;
  if (n < 6) return { nivel: 0, rotulo: 'Fraca', dica: 'Use pelo menos 8 caracteres.' };
  if (n < 8 || (tipos < 2 && n < 12)) return { nivel: 1, rotulo: 'Razoável', dica: 'Fica melhor com mais caracteres ou misturando letras, números e símbolos.' };
  if (n >= 12 && tipos >= 3) return { nivel: 3, rotulo: 'Forte', dica: 'Ótima escolha. Só não esqueça de guardar.' };
  if (n >= 14) return { nivel: 3, rotulo: 'Forte', dica: 'Frases longas são fortes e fáceis de lembrar.' };
  return { nivel: 2, rotulo: 'Boa', dica: 'Uma frase com 3 ou 4 palavras deixa a senha ainda mais forte.' };
}

/** "contrato.pdf" -> "contrato-protegido.pdf" */
export function nomeComSufixo(nome: string, sufixo: string): string {
  const base = nome.replace(/\.pdf$/i, '') || 'documento';
  return `${base}-${sufixo}.pdf`;
}
