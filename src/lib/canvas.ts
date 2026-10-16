// Ajudantes de canvas usados pelas ferramentas de imagem (rodam só no navegador).
import type { FormatoSaida } from './imagem';

/** Cria um canvas do tamanho pedido. */
export function novoCanvas(largura: number, altura: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = largura; c.height = altura;
  return c;
}

/**
 * Transforma o canvas em arquivo. Falha com mensagem clara se o navegador
 * não souber gerar o formato (o Safari antigo devolve PNG quando se pede WebP).
 */
export function codificar(canvas: HTMLCanvasElement, tipo: FormatoSaida, qualidade = 0.92): Promise<Blob> {
  return new Promise((ok, falha) => {
    canvas.toBlob((b) => {
      if (!b) falha(new Error('Não foi possível gerar a imagem. Ela pode ser grande demais para este aparelho.'));
      else if (b.type !== tipo) falha(new Error(`Este navegador não consegue gerar ${tipo.split('/')[1].toUpperCase()}. Tente outro formato ou outro navegador.`));
      else ok(b);
    }, tipo, qualidade);
  });
}

/**
 * Desenha `fonte` (ou só o pedaço `recorte` dela) num canvas de largura x altura.
 * Para reduzir muito, diminui pela metade em etapas: fica bem mais nítido do que de uma vez só.
 * Com `fundo`, pinta essa cor antes (para JPG, que não tem transparência).
 */
export function desenhar(
  fonte: ImageBitmap,
  largura: number,
  altura: number,
  opcoes: { recorte?: { x: number; y: number; largura: number; altura: number }; fundo?: string } = {},
): HTMLCanvasElement {
  const r = opcoes.recorte ?? { x: 0, y: 0, largura: fonte.width, altura: fonte.height };
  let atual: CanvasImageSource = fonte;
  let sx = r.x, sy = r.y, sw = r.largura, sh = r.altura;

  while (sw / 2 >= largura * 1.0 && sh / 2 >= altura * 1.0 && sw > 2 && sh > 2) {
    const meio = novoCanvas(Math.round(sw / 2), Math.round(sh / 2));
    const m = meio.getContext('2d')!;
    m.imageSmoothingQuality = 'high';
    m.drawImage(atual, sx, sy, sw, sh, 0, 0, meio.width, meio.height);
    atual = meio; sx = 0; sy = 0; sw = meio.width; sh = meio.height;
  }

  const canvas = novoCanvas(largura, altura);
  const ctx = canvas.getContext('2d')!;
  if (opcoes.fundo) { ctx.fillStyle = opcoes.fundo; ctx.fillRect(0, 0, largura, altura); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(atual, sx, sy, sw, sh, 0, 0, largura, altura);
  return canvas;
}
