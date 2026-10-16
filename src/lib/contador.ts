// Contagem de caracteres, palavras, linhas e afins. Funções puras.

export interface Contagem {
  /** Caracteres como a pessoa enxerga (um emoji conta 1). */
  caracteres: number;
  semEspacos: number;
  palavras: number;
  linhas: number;
  paragrafos: number;
  frases: number;
  /** Minutos de leitura silenciosa (200 palavras por minuto). */
  leituraMin: number;
  /** Minutos falando em voz alta (130 palavras por minuto). */
  falaMin: number;
}

const graf = typeof Intl !== 'undefined' && 'Segmenter' in Intl
  ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }) : null;

/** Número de caracteres visíveis (grafemas). "👍🏽" e "é" contam 1. */
export function contarGrafemas(texto: string): number {
  if (!texto) return 0;
  if (graf) { let n = 0; for (const _ of graf.segment(texto)) n++; return n; }
  return Array.from(texto).length;
}

// Palavra: letras ou números, aceitando hífen e apóstrofo no meio (guarda-chuva, d'água)
// e ponto, vírgula ou dois-pontos entre algarismos (1.500, 3,14, 10:30).
const PALAVRA = /[\p{L}\p{N}\p{M}]+(?:(?:[-'’]|(?<=\p{N})[.,:](?=\p{N}))[\p{L}\p{N}\p{M}]+)*/gu;

const TEM_PALAVRA = /[\p{L}\p{N}]/u;

export function contarPalavras(texto: string): number {
  return texto.match(PALAVRA)?.length ?? 0;
}

export function contar(texto: string): Contagem {
  const t = texto.replace(/\r\n?/g, '\n');
  const palavras = contarPalavras(t);
  const temTexto = t.trim().length > 0;
  return {
    caracteres: contarGrafemas(t),
    semEspacos: contarGrafemas(t.replace(/\s/g, '')),
    palavras,
    linhas: t ? t.split('\n').length : 0,
    paragrafos: temTexto ? t.split(/\n\s*\n/).filter((p) => p.trim()).length : 0,
    // Frase: trecho com pelo menos uma palavra, terminado em . ! ? … ou no fim do texto.
    frases: temTexto ? t.split(/[.!?…]+(?=\s|$)/).filter((f) => TEM_PALAVRA.test(f)).length : 0,
    leituraMin: palavras / 200,
    falaMin: palavras / 130,
  };
}

/** "< 1 min", "1 min", "3 min", "1 h 05 min". */
export function formatarMinutos(min: number): string {
  if (min === 0) return '0 min';
  if (min < 1) return '< 1 min';
  const total = Math.round(min);
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, '0')} min`;
}

export interface Limite { nome: string; max: number; }
/** Limites comuns de caracteres (conferidos em 2026). */
export const LIMITES: Limite[] = [
  { nome: 'Post no X (Twitter)', max: 280 },
  { nome: 'Bio do Instagram', max: 150 },
  { nome: 'Legenda do Instagram', max: 2200 },
  { nome: 'SMS', max: 160 },
  { nome: 'Título para o Google', max: 60 },
  { nome: 'Descrição para o Google', max: 160 },
];
