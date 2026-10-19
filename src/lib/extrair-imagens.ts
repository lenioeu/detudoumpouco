// Funções puras do "Extrair imagens do PDF": converter os pixels que o pdf.js entrega
// para RGBA, saber se a imagem tem transparência e reconhecer a mesma imagem repetida
// em várias páginas. Nada aqui depende do navegador.

/** Formatos de pixel do pdf.js (ImageKind): 1 = 1 bit cinza, 2 = RGB, 3 = RGBA. */
export const TIPO_1BIT = 1, TIPO_RGB = 2, TIPO_RGBA = 3;

/**
 * Converte os pixels de uma imagem do pdf.js para RGBA (4 bytes por pixel).
 * No formato de 1 bit, cada linha começa num byte novo e o bit 1 é branco.
 */
export function paraRgbaPdfjs(tipo: number, dados: Uint8Array | Uint8ClampedArray, largura: number, altura: number): Uint8ClampedArray<ArrayBuffer> {
  const n = largura * altura;
  const out = new Uint8ClampedArray(n * 4);
  if (tipo === TIPO_RGBA) {
    out.set(dados.subarray(0, n * 4));
  } else if (tipo === TIPO_RGB) {
    for (let i = 0, j = 0; i < n; i++, j += 3) {
      out[i * 4] = dados[j]; out[i * 4 + 1] = dados[j + 1]; out[i * 4 + 2] = dados[j + 2]; out[i * 4 + 3] = 255;
    }
  } else if (tipo === TIPO_1BIT) {
    const porLinha = Math.ceil(largura / 8);
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        const v = dados[y * porLinha + (x >> 3)] & (0x80 >> (x & 7)) ? 255 : 0;
        const k = (y * largura + x) * 4;
        out[k] = out[k + 1] = out[k + 2] = v; out[k + 3] = 255;
      }
    }
  } else {
    throw new Error(`Formato de imagem desconhecido: ${tipo}`);
  }
  return out;
}

/** A imagem tem algum pixel transparente ou semitransparente? */
export function temTransparencia(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return true;
  return false;
}

/**
 * "Impressão digital" da imagem: tamanho mais um resumo (FNV-1a) de até ~64 mil bytes espalhados
 * pela imagem inteira. Serve para mostrar só uma vez o logotipo que se repete em todas as páginas.
 */
export function impressaoDigital(rgba: Uint8ClampedArray, largura: number, altura: number): string {
  let h = 0x811c9dc5;
  const passo = Math.max(1, Math.floor(rgba.length / 65536));
  for (let i = 0; i < rgba.length; i += passo) {
    h ^= rgba[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${largura}x${altura}:${h.toString(16)}`;
}

/** Imagens menores que isso, nos dois lados, costumam ser marcadores, fios e ícones. */
export const LADO_PEQUENO = 32;

export function ehPequena(largura: number, altura: number): boolean {
  return largura < LADO_PEQUENO || altura < LADO_PEQUENO;
}

/** "páginas 1, 2 e 5" */
export function listarPaginas(paginas: number[]): string {
  const p = [...new Set(paginas)].sort((a, b) => a - b);
  if (p.length === 1) return `página ${p[0]}`;
  if (p.length <= 4) return `páginas ${p.slice(0, -1).join(', ')} e ${p[p.length - 1]}`;
  return `${p.length} páginas (${p[0]} a ${p[p.length - 1]})`;
}
