// Contas da "Marca d'água em PDF": onde a marca fica em cada página e em que tamanho.
// Funções puras, em pontos, no espaço visual da página (origem embaixo à esquerda; veja pdf-visual.ts).
import { envoltoriaGirada } from './pdf-visual';

export type PosicaoMarca =
  | 'topo-esquerda' | 'topo-centro' | 'topo-direita'
  | 'meio-esquerda' | 'centro' | 'meio-direita'
  | 'base-esquerda' | 'base-centro' | 'base-direita';

export const POSICOES_MARCA: { valor: PosicaoMarca; nome: string }[] = [
  { valor: 'topo-esquerda', nome: 'No topo, à esquerda' },
  { valor: 'topo-centro', nome: 'No topo, no centro' },
  { valor: 'topo-direita', nome: 'No topo, à direita' },
  { valor: 'meio-esquerda', nome: 'No meio, à esquerda' },
  { valor: 'centro', nome: 'No centro' },
  { valor: 'meio-direita', nome: 'No meio, à direita' },
  { valor: 'base-esquerda', nome: 'Embaixo, à esquerda' },
  { valor: 'base-centro', nome: 'Embaixo, no centro' },
  { valor: 'base-direita', nome: 'Embaixo, à direita' },
];

/** Limite de repetições por página no mosaico, para o arquivo não crescer demais. */
export const MAXIMO_MOSAICO = 300;

/**
 * Centros da marca na página. `w` x `h` é o tamanho da marca antes de girar.
 * Nos cantos e bordas, a marca girada fica inteira dentro da página, a `margem` pontos da borda.
 * No mosaico, a marca se repete em linhas desencontradas (como tijolos), cobrindo a página toda.
 */
export function centrosDaMarca(
  posicao: PosicaoMarca, mosaico: boolean,
  larguraPagina: number, alturaPagina: number,
  w: number, h: number, angulo: number, margem: number,
): { x: number; y: number }[] {
  const env = envoltoriaGirada(w, h, angulo);
  if (mosaico) {
    const passoX = Math.max(env.largura, 1) * 1.35 + 24;
    const passoY = Math.max(env.altura, 1) * 1.35 + 24;
    const centros: { x: number; y: number }[] = [];
    const cx = larguraPagina / 2, cy = alturaPagina / 2;
    const linhas = Math.ceil((alturaPagina / 2 + env.altura) / passoY);
    const colunas = Math.ceil((larguraPagina / 2 + env.largura) / passoX) + 1;
    for (let j = -linhas; j <= linhas; j++) {
      const desloca = Math.abs(j) % 2 === 1 ? passoX / 2 : 0;
      for (let i = -colunas; i <= colunas; i++) {
        const x = cx + i * passoX + desloca, y = cy + j * passoY;
        // Só as que aparecem pelo menos um pouco na página.
        if (x + env.largura / 2 < 0 || x - env.largura / 2 > larguraPagina) continue;
        if (y + env.altura / 2 < 0 || y - env.altura / 2 > alturaPagina) continue;
        centros.push({ x, y });
        if (centros.length >= MAXIMO_MOSAICO) return centros;
      }
    }
    return centros;
  }
  const [v, hz] = posicao === 'centro' ? ['meio', 'centro'] : posicao.split('-');
  const x = hz === 'esquerda' ? margem + env.largura / 2
    : hz === 'direita' ? larguraPagina - margem - env.largura / 2
    : larguraPagina / 2;
  const y = v === 'topo' ? alturaPagina - margem - env.altura / 2
    : v === 'base' ? margem + env.altura / 2
    : alturaPagina / 2;
  return [{ x, y }];
}

/**
 * Tamanho da marca: `porcento` da largura da página.
 * Para texto, devolve o tamanho da letra; `larguraEm1pt` é a largura do texto com letra de 1 ponto.
 */
export function tamanhoDaLetra(porcento: number, larguraPagina: number, larguraEm1pt: number): number {
  if (!(larguraEm1pt > 0)) return 12;
  return Math.max(4, Math.min(500, (larguraPagina * porcento) / 100 / larguraEm1pt));
}

/**
 * Para imagem: largura e altura na página, mantendo a proporção.
 * Uma imagem comprida (mais alta que larga) nunca passa da altura da página.
 */
export function tamanhoDaImagem(
  porcento: number, larguraPagina: number, alturaPagina: number, larguraPx: number, alturaPx: number,
): { largura: number; altura: number } {
  let largura = (larguraPagina * porcento) / 100;
  let altura = (largura * alturaPx) / Math.max(1, larguraPx);
  if (altura > alturaPagina) { largura *= alturaPagina / altura; altura = alturaPagina; }
  return { largura, altura };
}
