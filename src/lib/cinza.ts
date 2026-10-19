// Funções puras de tons de cinza e preto e branco, usadas pelo "PDF em preto e branco"
// e pelo "Escanear para PDF". Trabalham com os pixels RGBA de um canvas (getImageData),
// sem tocar no DOM.

/** Brilho de uma cor como o olho percebe (pesos da TV, ITU-R BT.601). 0 = preto, 255 = branco. */
export function luminancia(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Deixa os pixels RGBA em tons de cinza (R = G = B), no próprio array.
 * O que é transparente vira branco, como o papel.
 */
export function paraCinza(px: Uint8ClampedArray): void {
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] / 255;
    const y = Math.round(luminancia(px[i], px[i + 1], px[i + 2]) * a + 255 * (1 - a));
    px[i] = px[i + 1] = px[i + 2] = y;
    px[i + 3] = 255;
  }
}

/** Só o brilho de cada pixel (1 byte por pixel), já com o transparente como branco. */
export function brilho(px: Uint8ClampedArray): Uint8Array {
  const saida = new Uint8Array(px.length / 4);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const a = px[i + 3] / 255;
    saida[j] = Math.round(luminancia(px[i], px[i + 1], px[i + 2]) * a + 255 * (1 - a));
  }
  return saida;
}

/**
 * Preto e branco puro: o que for mais escuro que `limite` (0 a 255) vira preto, o resto branco.
 * Muda os pixels RGBA no próprio array.
 */
export function limiarizar(px: Uint8ClampedArray, limite: number): void {
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3] / 255;
    const y = luminancia(px[i], px[i + 1], px[i + 2]) * a + 255 * (1 - a);
    px[i] = px[i + 1] = px[i + 2] = y < limite ? 0 : 255;
    px[i + 3] = 255;
  }
}

/**
 * Empacota uma imagem de 1 byte por pixel em 1 bit por pixel, no formato do PDF
 * (DeviceGray com BitsPerComponent 1): bit 0 = preto, 1 = branco, cada linha
 * completa até fechar um byte. É assim que um texto em preto e branco fica levíssimo.
 */
export function empacotar1Bit(cinza: Uint8Array, largura: number, altura: number, limite: number): Uint8Array {
  const porLinha = Math.ceil(largura / 8);
  const saida = new Uint8Array(porLinha * altura);
  for (let y = 0; y < altura; y++) {
    const base = y * largura, destino = y * porLinha;
    for (let x = 0; x < largura; x++) {
      if (cinza[base + x] >= limite) saida[destino + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return saida;
}

/** Converte "porcentagem de escuridão" do controle (ex.: 55) para o limite de brilho (0 a 255). */
export function limiteDoControle(porcentagem: number): number {
  return Math.round((Math.min(Math.max(porcentagem, 5), 95) / 100) * 255);
}
