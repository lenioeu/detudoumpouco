// Contas de página para colocar imagens num PDF. Funções puras, em pontos (1 pt = 1/72 de polegada).

export type TamanhoPagina = 'a4' | 'carta' | 'imagem';
export type Orientacao = 'auto' | 'retrato' | 'paisagem';

/** Tamanhos em pontos, na vertical. A4 = 210 x 297 mm; Carta = 8,5 x 11 polegadas. */
export const PAGINAS: Record<Exclude<TamanhoPagina, 'imagem'>, [number, number]> = {
  a4: [595.28, 841.89],
  carta: [612, 792],
};

/** Margens em pontos: pequena = 1 cm, grande = 2,5 cm. */
export const MARGENS = { nenhuma: 0, pequena: 28.35, grande: 70.87 } as const;
export type Margem = keyof typeof MARGENS;

/** Pixels para pontos, considerando a imagem em 96 pixels por polegada (padrão das telas). */
export const PONTOS_POR_PIXEL = 72 / 96;

export interface Posicao {
  /** Tamanho da página. */
  largura: number;
  altura: number;
  /** Onde a imagem fica (origem no canto inferior esquerdo, como no PDF). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Calcula a página e a posição da imagem: a imagem cabe inteira, sem distorcer, centralizada.
 * Com tamanho "imagem", a página tem o tamanho da própria imagem (mais a margem).
 */
export function posicionarImagem(
  larguraPx: number,
  alturaPx: number,
  tamanho: TamanhoPagina,
  orientacao: Orientacao,
  margem: number,
): Posicao {
  if (tamanho === 'imagem') {
    const w = larguraPx * PONTOS_POR_PIXEL, h = alturaPx * PONTOS_POR_PIXEL;
    return { largura: w + 2 * margem, altura: h + 2 * margem, x: margem, y: margem, w, h };
  }
  const [curto, longo] = PAGINAS[tamanho];
  const deitada = orientacao === 'paisagem' || (orientacao === 'auto' && larguraPx > alturaPx);
  const largura = deitada ? longo : curto;
  const altura = deitada ? curto : longo;
  const escala = Math.min((largura - 2 * margem) / larguraPx, (altura - 2 * margem) / alturaPx);
  const w = larguraPx * escala, h = alturaPx * escala;
  return { largura, altura, x: (largura - w) / 2, y: (altura - h) / 2, w, h };
}

/**
 * Lê a orientação gravada pela câmera (EXIF) num JPEG. 1 = normal; 3, 6 e 8 = girada;
 * 2, 4, 5 e 7 = espelhada. Devolve 1 se não houver a informação.
 */
export function orientacaoJpeg(bytes: Uint8Array): number {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 2;
  while (pos + 4 <= bytes.length) {
    if (bytes[pos] !== 0xff) return 1;
    const marcador = bytes[pos + 1];
    if (marcador === 0xda || marcador === 0xd9) return 1; // começou a imagem: não tem EXIF
    const tam = v.getUint16(pos + 2);
    if (marcador === 0xe1 && pos + 10 <= bytes.length && v.getUint32(pos + 4) === 0x45786966) {
      const tiff = pos + 10;
      if (tiff + 8 > bytes.length) return 1;
      const le = v.getUint16(tiff) === 0x4949;
      const ifd = tiff + v.getUint32(tiff + 4, le);
      if (ifd + 2 > bytes.length) return 1;
      const n = v.getUint16(ifd, le);
      for (let i = 0; i < n; i++) {
        const e = ifd + 2 + i * 12;
        if (e + 10 > bytes.length) return 1;
        if (v.getUint16(e, le) === 0x0112) {
          const o = v.getUint16(e + 8, le);
          return o >= 1 && o <= 8 ? o : 1;
        }
      }
      return 1;
    }
    pos += 2 + tam;
  }
  return 1;
}
