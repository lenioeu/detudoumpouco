// Contas do "Recortar PDF": margens em milímetros, a área que fica e a detecção das margens brancas.
// Funções puras. O retângulo de corte usa o espaço visual da página com a origem no canto
// SUPERIOR esquerdo (como na tela), em pontos; `paraCaixaPdf` faz a ponte com o PDF.
import type { Retangulo } from './imagem';
import { caixaVisualParaPdf, mmParaPt, ptParaMm, type Caixa } from './pdf-visual';

export interface Margens { topo: number; base: number; esquerda: number; direita: number; }

/** Menor pedaço de página que pode sobrar: 1 cm em cada lado. */
export const MINIMO_PT = mmParaPt(10);

/** Margens (em mm) para o retângulo que fica, numa página `largura` x `altura` (em pontos). */
export function margensParaRecorte(m: Margens, largura: number, altura: number): Retangulo | null {
  const x = mmParaPt(Math.max(0, m.esquerda));
  const y = mmParaPt(Math.max(0, m.topo));
  const w = largura - x - mmParaPt(Math.max(0, m.direita));
  const h = altura - y - mmParaPt(Math.max(0, m.base));
  if (w < MINIMO_PT || h < MINIMO_PT) return null;
  return { x, y, largura: w, altura: h };
}

/** O caminho de volta: retângulo (em pontos) para margens em mm, com uma casa decimal. */
export function recorteParaMargens(r: Retangulo, largura: number, altura: number): Margens {
  const mm = (pt: number) => Math.max(0, Math.round(ptParaMm(pt) * 10) / 10);
  return {
    topo: mm(r.y),
    base: mm(altura - r.y - r.altura),
    esquerda: mm(r.x),
    direita: mm(largura - r.x - r.largura),
  };
}

/** Retângulo visual (origem em cima) para a caixa do PDF que vai virar a nova CropBox. */
export function paraCaixaPdf(r: Retangulo, caixa: Caixa, rotacao: number, alturaVisual: number): Caixa {
  return caixaVisualParaPdf(caixa, rotacao, { x: r.x, y: alturaVisual - r.y - r.altura, largura: r.largura, altura: r.altura });
}

/**
 * Onde está o conteúdo numa imagem da página (RGBA, como vem do canvas): o menor retângulo,
 * em pixels, que contém tudo o que não é quase branco. Devolve null se a página está em branco.
 * Para ignorar sujeira de escaneamento, uma linha ou coluna só conta se tiver pelo menos
 * `minimo` pixels escuros.
 */
export function limitesDoConteudo(
  rgba: Uint8ClampedArray | Uint8Array, largura: number, altura: number, limiar = 235, minimo = 0,
): Retangulo | null {
  const porLinha = new Uint32Array(altura);
  const porColuna = new Uint32Array(largura);
  for (let y = 0; y < altura; y++) {
    let o = y * largura * 4;
    for (let x = 0; x < largura; x++, o += 4) {
      // Transparente conta como branco (o fundo do canvas).
      if (rgba[o + 3] > 16 && (rgba[o] < limiar || rgba[o + 1] < limiar || rgba[o + 2] < limiar)) {
        porLinha[y]++; porColuna[x]++;
      }
    }
  }
  const minL = Math.max(1, minimo || Math.floor(largura * 0.002));
  const minC = Math.max(1, minimo || Math.floor(altura * 0.002));
  let y0 = 0; while (y0 < altura && porLinha[y0] < minL) y0++;
  if (y0 === altura) return null;
  let y1 = altura - 1; while (y1 > y0 && porLinha[y1] < minL) y1--;
  let x0 = 0; while (x0 < largura && porColuna[x0] < minC) x0++;
  if (x0 === largura) return null;
  let x1 = largura - 1; while (x1 > x0 && porColuna[x1] < minC) x1--;
  return { x: x0, y: y0, largura: x1 - x0 + 1, altura: y1 - y0 + 1 };
}

/**
 * Converte os limites (em pixels de uma imagem com `escala` pixels por ponto) para pontos,
 * com `folga` pontos de respiro em volta, sem sair da página.
 */
export function limitesEmPontos(px: Retangulo, escala: number, folga: number, largura: number, altura: number): Retangulo {
  const x = Math.max(0, px.x / escala - folga);
  const y = Math.max(0, px.y / escala - folga);
  const x1 = Math.min(largura, (px.x + px.largura) / escala + folga);
  const y1 = Math.min(altura, (px.y + px.altura) / escala + folga);
  return { x, y, largura: x1 - x, altura: y1 - y };
}
