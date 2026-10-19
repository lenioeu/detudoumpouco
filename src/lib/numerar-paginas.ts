// Contas do "Numerar páginas": o texto de cada número, quais páginas recebem número e onde ele fica.
// Funções puras, em pontos, no espaço visual da página (origem embaixo à esquerda; veja pdf-visual.ts).

export type FormatoNumero = 'n' | 'pagina' | 'n-de-t' | 'pagina-n-de-t' | 'barra' | 'tracos';
export type PosicaoNumero =
  | 'topo-esquerda' | 'topo-centro' | 'topo-direita'
  | 'base-esquerda' | 'base-centro' | 'base-direita';

export const FORMATOS: { valor: FormatoNumero; nome: string }[] = [
  { valor: 'n', nome: '1' },
  { valor: 'pagina', nome: 'Página 1' },
  { valor: 'n-de-t', nome: '1 de 10' },
  { valor: 'pagina-n-de-t', nome: 'Página 1 de 10' },
  { valor: 'barra', nome: '1/10' },
  { valor: 'tracos', nome: '- 1 -' },
];

/** O texto que vai na página. `total` é o último número que aparece no documento. */
export function textoDoNumero(formato: FormatoNumero, n: number, total: number): string {
  switch (formato) {
    case 'pagina': return `Página ${n}`;
    case 'n-de-t': return `${n} de ${total}`;
    case 'pagina-n-de-t': return `Página ${n} de ${total}`;
    case 'barra': return `${n}/${total}`;
    case 'tracos': return `- ${n} -`;
    default: return String(n);
  }
}

export interface Numeracao { pagina: number; numero: number; }

/**
 * Quais páginas recebem número e qual número cada uma recebe.
 * `aPartirDe`: primeira página numerada (1 = todas; 2 = pula a capa).
 * `ate`: última página numerada (padrão: a última do arquivo).
 * `primeiroNumero`: o número que a primeira página numerada recebe.
 */
export function paginasNumeradas(total: number, aPartirDe = 1, primeiroNumero = 1, ate = total): Numeracao[] {
  const ini = Math.max(1, Math.floor(aPartirDe));
  const fim = Math.min(total, Math.floor(ate));
  const lista: Numeracao[] = [];
  for (let p = ini; p <= fim; p++) lista.push({ pagina: p, numero: Math.floor(primeiroNumero) + (p - ini) });
  return lista;
}

/**
 * Posição para impressão frente e verso: nas páginas pares (o verso da folha), o que estava à direita
 * vai para a esquerda e vice-versa, para o número ficar sempre na borda de fora.
 */
export function posicaoNaPagina(posicao: PosicaoNumero, pagina: number, espelhar: boolean): PosicaoNumero {
  if (!espelhar || pagina % 2 === 1) return posicao;
  if (posicao.endsWith('direita')) return posicao.replace('direita', 'esquerda') as PosicaoNumero;
  if (posicao.endsWith('esquerda')) return posicao.replace('esquerda', 'direita') as PosicaoNumero;
  return posicao;
}

/**
 * Onde começa o texto (canto esquerdo da linha de base), para ele ficar a `margem` pontos das bordas.
 * `larguraTexto` e `alturaTexto` (altura das maiúsculas) vêm da fonte.
 */
export function posicaoDoNumero(
  posicao: PosicaoNumero, larguraPagina: number, alturaPagina: number,
  larguraTexto: number, alturaTexto: number, margem: number,
): { x: number; y: number } {
  const [vertical, horizontal] = posicao.split('-') as ['topo' | 'base', 'esquerda' | 'centro' | 'direita'];
  const x = horizontal === 'esquerda' ? margem
    : horizontal === 'direita' ? larguraPagina - margem - larguraTexto
    : (larguraPagina - larguraTexto) / 2;
  const y = vertical === 'base' ? margem : alturaPagina - margem - alturaTexto;
  return { x, y };
}
