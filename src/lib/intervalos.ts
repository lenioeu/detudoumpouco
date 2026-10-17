// Intervalos de páginas no formato que as pessoas digitam: "1-3, 5, 8-10".
// Funções puras, usadas por dividir PDF, PDF para JPG e outras ferramentas de páginas.

export interface ResultadoIntervalos {
  /** Cada grupo é uma lista de páginas (começando em 1), na ordem digitada. */
  grupos: number[][];
  erro?: string;
}

/**
 * Lê "1-3, 5, 8-10" e devolve [[1,2,3],[5],[8,9,10]].
 * Aceita vírgula ou ponto e vírgula entre partes, "–" ou "a" no lugar do hífen
 * e intervalo aberto no fim ("8-" vai até a última página).
 */
export function lerIntervalos(texto: string, total: number): ResultadoIntervalos {
  const partes = texto.split(/[,;]+/).map((p) => p.trim()).filter(Boolean);
  if (!partes.length) return { grupos: [], erro: 'Escolha pelo menos uma página.' };
  const grupos: number[][] = [];
  for (const parte of partes) {
    const m = parte.match(/^(\d+)\s*(?:(?:-|–|—|\ba\b|até)\s*(\d+)?)?$/i);
    if (!m) return { grupos: [], erro: `Não entendi "${parte}". Use números e hífen, por exemplo: 1-3, 5, 8-10.` };
    const inicio = Number(m[1]);
    const temHifen = /(-|–|—|\ba\b|até)/i.test(parte);
    const fim = m[2] !== undefined ? Number(m[2]) : temHifen ? total : inicio;
    if (inicio < 1 || fim < 1) return { grupos: [], erro: 'As páginas começam no número 1.' };
    if (inicio > total || fim > total) {
      return { grupos: [], erro: `O PDF tem ${total} ${total === 1 ? 'página' : 'páginas'}; "${parte}" passa disso.` };
    }
    const grupo: number[] = [];
    if (inicio <= fim) for (let i = inicio; i <= fim; i++) grupo.push(i);
    else for (let i = inicio; i >= fim; i--) grupo.push(i);
    grupos.push(grupo);
  }
  return { grupos };
}

/** Escreve uma lista de páginas de forma curta: [1,2,3,5,7,8] -> "1-3, 5, 7-8". */
export function escreverIntervalos(paginas: number[]): string {
  const ordenadas = [...new Set(paginas)].sort((a, b) => a - b);
  return blocosSeguidos(ordenadas).map((b) => (b.length > 1 ? `${b[0]}-${b[b.length - 1]}` : `${b[0]}`)).join(', ');
}

/** Separa páginas em blocos de números seguidos: [1,2,3,5,7,8] -> [[1,2,3],[5],[7,8]]. */
export function blocosSeguidos(paginas: number[]): number[][] {
  const blocos: number[][] = [];
  for (const p of paginas) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && p === ultimo[ultimo.length - 1] + 1) ultimo.push(p);
    else blocos.push([p]);
  }
  return blocos;
}

/** Divide `total` páginas em grupos de `n`: aCada(7, 3) -> [[1,2,3],[4,5,6],[7]]. */
export function aCada(total: number, n: number): number[][] {
  const tamanho = Math.max(1, Math.floor(n));
  const grupos: number[][] = [];
  for (let i = 1; i <= total; i += tamanho) {
    grupos.push(Array.from({ length: Math.min(tamanho, total - i + 1) }, (_, k) => i + k));
  }
  return grupos;
}

/** Nome curto de um grupo para o arquivo: [4] -> "pagina-4", [1,2,3] -> "paginas-1-3", [1,2,5] -> "paginas-1-2_5". */
export function nomeDoGrupo(grupo: number[]): string {
  if (grupo.length === 1) return `pagina-${grupo[0]}`;
  const primeiro = grupo[0], ultimo = grupo[grupo.length - 1];
  const seguido = grupo.every((p, i) => i === 0 || Math.abs(p - grupo[i - 1]) === 1);
  return seguido ? `paginas-${primeiro}-${ultimo}` : `paginas-${escreverIntervalos(grupo).replace(/, /g, '_')}`;
}
