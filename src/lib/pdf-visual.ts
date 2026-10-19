// Contas para desenhar numa página de PDF "do jeito que a pessoa vê".
// No PDF, a página tem uma caixa visível (CropBox) e pode estar girada (/Rotate). Aqui tudo é pensado
// no espaço visual: origem no canto inferior esquerdo da página como ela aparece na tela, em pontos
// (1 pt = 1/72 de polegada), ângulos em graus no sentido anti-horário. Depois, `visualParaPdf` leva
// o ponto e o ângulo para as coordenadas internas do PDF. Funções puras, sem navegador.

export interface Caixa { x: number; y: number; largura: number; altura: number; }

/** 1 milímetro em pontos. */
export const PT_POR_MM = 72 / 25.4;
export const mmParaPt = (mm: number) => mm * PT_POR_MM;
export const ptParaMm = (pt: number) => pt / PT_POR_MM;

/** Rotação da página reduzida a 0, 90, 180 ou 270. Valores fora de múltiplos de 90 viram 0. */
export function normalizarRotacao(graus: number): 0 | 90 | 180 | 270 {
  const r = ((Math.round(graus / 90) * 90) % 360 + 360) % 360;
  return (Number.isFinite(r) && graus % 90 === 0 ? r : 0) as 0 | 90 | 180 | 270;
}

/** Largura e altura da página como aparece na tela (troca os lados se estiver deitada a 90° ou 270°). */
export function tamanhoVisual(caixa: Caixa, rotacao: number): { largura: number; altura: number } {
  const r = normalizarRotacao(rotacao);
  return r === 90 || r === 270
    ? { largura: caixa.altura, altura: caixa.largura }
    : { largura: caixa.largura, altura: caixa.altura };
}

/**
 * Ponto (u, v) do espaço visual para o espaço do PDF.
 * A página girada r graus no sentido horário na tela corresponde a girar o desenho r graus no sentido
 * anti-horário dentro do PDF; por isso o ângulo volta somado a r.
 */
export function visualParaPdf(caixa: Caixa, rotacao: number, u: number, v: number, angulo = 0): { x: number; y: number; angulo: number } {
  const r = normalizarRotacao(rotacao);
  const { x: x0, y: y0, largura: w, altura: h } = caixa;
  let x: number, y: number;
  if (r === 90) { x = x0 + w - v; y = y0 + u; }
  else if (r === 180) { x = x0 + w - u; y = y0 + h - v; }
  else if (r === 270) { x = x0 + v; y = y0 + h - u; }
  else { x = x0 + u; y = y0 + v; }
  return { x, y, angulo: angulo + r };
}

/** Retângulo do espaço visual (origem embaixo à esquerda) para uma caixa no espaço do PDF. */
export function caixaVisualParaPdf(caixa: Caixa, rotacao: number, r: Caixa): Caixa {
  const a = visualParaPdf(caixa, rotacao, r.x, r.y);
  const b = visualParaPdf(caixa, rotacao, r.x + r.largura, r.y + r.altura);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), largura: Math.abs(b.x - a.x), altura: Math.abs(b.y - a.y) };
}

/** Gira o vetor (x, y) em `graus` no sentido anti-horário. */
export function girar(x: number, y: number, graus: number): { x: number; y: number } {
  const t = (graus * Math.PI) / 180;
  const c = Math.cos(t), s = Math.sin(t);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Tamanho do retângulo que envolve uma caixa w x h girada. */
export function envoltoriaGirada(w: number, h: number, graus: number): { largura: number; altura: number } {
  const t = (graus * Math.PI) / 180;
  const c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  return { largura: w * c + h * s, altura: w * s + h * c };
}

/**
 * Onde fica o canto inferior esquerdo (antes de girar) de uma caixa w x h para que,
 * girada em `graus` em torno desse canto, o centro dela caia em (cx, cy).
 * É assim que o pdf-lib gira textos e imagens: em torno do ponto de origem.
 */
export function origemParaCentro(cx: number, cy: number, w: number, h: number, graus: number): { x: number; y: number } {
  const meio = girar(w / 2, h / 2, graus);
  return { x: cx - meio.x, y: cy - meio.y };
}
