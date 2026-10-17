// Contas da ferramenta "Assinar PDF". Funções puras (sem DOM), em pontos de PDF (1 pt = 1/72 de polegada).
//
// "Vista" é a página como a pessoa vê na tela, já girada pelo /Rotate do PDF:
// origem no canto superior esquerdo, u para a direita e v para baixo.
// O PDF tem origem no canto inferior esquerdo da página sem girar, x para a direita e y para cima.

export type Rotacao = 0 | 90 | 180 | 270;

/** Página do PDF: a caixa visível (CropBox) sem girar e o giro de exibição (/Rotate, no sentido horário). */
export interface PaginaPdf {
  x0: number;
  y0: number;
  largura: number;
  altura: number;
  rotacao: Rotacao;
}

/** Retângulo na vista, em pontos. */
export interface Caixa { u: number; v: number; w: number; h: number; }

/** Converte qualquer ângulo (até negativo ou torto) para 0, 90, 180 ou 270. */
export function normalizarRotacao(graus: number): Rotacao {
  if (!Number.isFinite(graus)) return 0;
  return ((((Math.round(graus / 90) * 90) % 360) + 360) % 360) as Rotacao;
}

/** Tamanho da página como ela aparece na tela (com 90 ou 270 graus, largura e altura trocam). */
export function tamanhoVisto(p: PaginaPdf): { largura: number; altura: number } {
  return p.rotacao === 90 || p.rotacao === 270
    ? { largura: p.altura, altura: p.largura }
    : { largura: p.largura, altura: p.altura };
}

/** Ponto da vista (u, v) para o ponto do PDF (x, y). */
export function vistaParaPdf(p: PaginaPdf, u: number, v: number): [number, number] {
  const { x0, y0, largura: W, altura: H } = p;
  switch (p.rotacao) {
    case 90: return [x0 + v, y0 + u];
    case 180: return [x0 + W - u, y0 + v];
    case 270: return [x0 + W - v, y0 + H - u];
    default: return [x0 + u, y0 + H - v];
  }
}

/**
 * Onde desenhar uma imagem no PDF para ela aparecer em pé na caixa da vista.
 * O pdf-lib gira a imagem em volta do canto inferior esquerdo dela (sentido anti-horário);
 * esse canto é o canto inferior esquerdo da caixa como a pessoa vê. Girar a imagem pelo mesmo
 * ângulo do /Rotate desfaz o giro que o leitor de PDF aplica na exibição.
 */
export function caixaNoPdf(p: PaginaPdf, c: Caixa): { x: number; y: number; width: number; height: number; rotate: Rotacao } {
  const [x, y] = vistaParaPdf(p, c.u, c.v + c.h);
  return { x, y, width: c.w, height: c.h, rotate: p.rotacao };
}

/** Mantém a caixa inteira dentro da página (sem mudar o tamanho, a não ser que ela seja maior que a página). */
export function limitarCaixa(c: Caixa, vista: { largura: number; altura: number }): Caixa {
  let { w, h } = c;
  const escala = Math.min(1, vista.largura / w, vista.altura / h);
  w *= escala; h *= escala;
  const u = Math.min(Math.max(c.u, 0), vista.largura - w);
  const v = Math.min(Math.max(c.v, 0), vista.altura - h);
  return { u, v, w, h };
}

/**
 * Caixa de tamanho `w` x `h` com o centro em (cu, cv), dentro da página.
 */
export function caixaCentrada(cu: number, cv: number, w: number, h: number, vista: { largura: number; altura: number }): Caixa {
  return limitarCaixa({ u: cu - w / 2, v: cv - h / 2, w, h }, vista);
}

/**
 * A mesma posição em outra página (para rubricar todas): o tamanho em pontos é mantido e a distância
 * até a borda mais próxima também. Assim uma rubrica no canto inferior direito de uma A4 continua
 * no canto inferior direito de uma página Carta ou de uma página deitada.
 */
export function mesmaPosicao(c: Caixa, de: { largura: number; altura: number }, para: { largura: number; altura: number }): Caixa {
  const eixo = (pos: number, tam: number, total: number, novoTotal: number) => {
    const antes = pos, depois = total - pos - tam;
    const centro = pos + tam / 2;
    // No terço do meio, fica no mesmo lugar proporcional; perto de uma borda, fica a mesma distância dela.
    if (centro > total / 3 && centro < (2 * total) / 3) return (centro / total) * novoTotal - tam / 2;
    return antes <= depois ? antes : novoTotal - tam - depois;
  };
  return limitarCaixa({
    u: eixo(c.u, c.w, de.largura, para.largura),
    v: eixo(c.v, c.h, de.altura, para.altura),
    w: c.w,
    h: c.h,
  }, para);
}

/**
 * Novo tamanho ao puxar um canto, mantendo a proporção.
 * `sx`/`sy` dizem para que lado o canto cresce (1 = direita/baixo, -1 = esquerda/cima);
 * `du`/`dv` é quanto o ponteiro andou desde o início. O canto oposto fica parado.
 */
export function redimensionar(
  inicio: Caixa,
  sx: 1 | -1,
  sy: 1 | -1,
  du: number,
  dv: number,
  vista: { largura: number; altura: number },
  minimo = 12,
): Caixa {
  const proporcao = inicio.w / inicio.h;
  const porX = sx * du, porY = sy * dv * proporcao;
  let w = inicio.w + (Math.abs(porX) >= Math.abs(porY) ? porX : porY);
  // Limites: tamanho mínimo e não passar da borda do lado que cresce.
  const fixoU = sx === 1 ? inicio.u : inicio.u + inicio.w;
  const fixoV = sy === 1 ? inicio.v : inicio.v + inicio.h;
  const maxW = Math.min(
    sx === 1 ? vista.largura - fixoU : fixoU,
    (sy === 1 ? vista.altura - fixoV : fixoV) * proporcao,
  );
  w = Math.max(Math.min(w, maxW), Math.min(minimo, maxW));
  const h = w / proporcao;
  return { u: sx === 1 ? fixoU : fixoU - w, v: sy === 1 ? fixoV : fixoV - h, w, h };
}

/** "2026-10-17" (valor de <input type="date">) para "17/10/2026". Devolve "" se a data for inválida. */
export function dataBrasileira(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return '';
  const [, a, mes, d] = m;
  const data = new Date(Number(a), Number(mes) - 1, Number(d));
  if (data.getFullYear() !== Number(a) || data.getMonth() !== Number(mes) - 1 || data.getDate() !== Number(d)) return '';
  return `${d}/${mes}/${a}`;
}

/** Data de hoje no formato de <input type="date"> (no fuso do aparelho). */
export function hojeIso(agora = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/** Brilho de 0 (preto) a 255 (branco), com os pesos que o olho percebe. */
export function brilho(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Limiar de Otsu: o tom que melhor separa a tinta (escura) do papel (claro) num histograma de 256 tons.
 */
export function limiarOtsu(histograma: ArrayLike<number>): number {
  let total = 0, soma = 0;
  for (let i = 0; i < 256; i++) { total += histograma[i]; soma += i * histograma[i]; }
  if (!total) return 128;
  let pesoFundo = 0, somaFundo = 0, melhor = 0, limiar = 128;
  for (let t = 0; t < 256; t++) {
    pesoFundo += histograma[t];
    if (!pesoFundo) continue;
    const pesoFrente = total - pesoFundo;
    if (!pesoFrente) break;
    somaFundo += t * histograma[t];
    const m1 = somaFundo / pesoFundo, m2 = (soma - somaFundo) / pesoFrente;
    const entre = pesoFundo * pesoFrente * (m1 - m2) ** 2;
    if (entre > melhor) { melhor = entre; limiar = t; }
  }
  return limiar;
}

/** Histograma de brilho de uma imagem RGBA. */
export function histogramaBrilho(rgba: ArrayLike<number>): Uint32Array {
  const h = new Uint32Array(256);
  for (let i = 0; i < rgba.length; i += 4) h[Math.round(brilho(rgba[i], rgba[i + 1], rgba[i + 2]))]++;
  return h;
}

/**
 * Sugestão de limiar para tirar o fundo de uma foto de assinatura: um pouco acima do Otsu,
 * para levar junto as bordas suaves do traço, mas sem pegar a sombra do papel.
 */
export function limiarSugerido(rgba: ArrayLike<number>): number {
  const otsu = limiarOtsu(histogramaBrilho(rgba));
  return Math.round(Math.min(235, Math.max(90, otsu + 20)));
}

/**
 * Tira o fundo claro: o que for mais claro que o limiar fica transparente; o resto vira tinta da cor
 * `tinta` ([r, g, b]), com transparência proporcional (bordas suaves, sem serrilhado).
 * Escreve no próprio `rgba`.
 */
export function removerFundo(rgba: Uint8ClampedArray, limiar: number, tinta: [number, number, number]): void {
  const suave = Math.max(24, limiar * 0.3);
  for (let i = 0; i < rgba.length; i += 4) {
    const b = brilho(rgba[i], rgba[i + 1], rgba[i + 2]);
    const a = b >= limiar ? 0 : Math.min(1, (limiar - b) / suave);
    rgba[i] = tinta[0]; rgba[i + 1] = tinta[1]; rgba[i + 2] = tinta[2];
    rgba[i + 3] = Math.round(a * (rgba[i + 3] / 255) * 255);
  }
}

/** Menor retângulo com pixels visíveis (alfa acima de `minimo`), ou null se a imagem estiver vazia. */
export function limitesVisiveis(rgba: ArrayLike<number>, largura: number, altura: number, minimo = 16):
  { x: number; y: number; largura: number; altura: number } | null {
  let x1 = largura, y1 = altura, x2 = -1, y2 = -1;
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (rgba[(y * largura + x) * 4 + 3] > minimo) {
        if (x < x1) x1 = x;
        if (x > x2) x2 = x;
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  return x2 < 0 ? null : { x: x1, y: y1, largura: x2 - x1 + 1, altura: y2 - y1 + 1 };
}

/** Ponto de um traço: posição (em fração da largura do quadro) e espessura relativa. */
export interface Ponto { x: number; y: number; f: number; }

/**
 * Espessura relativa conforme a velocidade (traço rápido fica mais fino, como uma caneta de verdade)
 * ou conforme a pressão, quando a caneta informa. `anterior` suaviza a mudança.
 */
export function espessuraRelativa(velocidade: number, pressao: number | null, anterior: number | null): number {
  const alvo = pressao != null && pressao > 0
    ? 0.45 + pressao * 1.1
    : Math.min(1.3, Math.max(0.55, 1.35 - velocidade * 0.35));
  return anterior == null ? alvo : anterior * 0.7 + alvo * 0.3;
}
