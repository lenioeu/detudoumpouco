// Desenha um QR Code em SVG e PNG com a biblioteca `qrcode`, carregada só quando é usada.
// Usado pelas páginas Gerador de QR Code e QR Code Pix.

export type Correcao = 'L' | 'M' | 'Q' | 'H';
export interface OpcoesQr { cor?: string; fundo?: string; correcao?: Correcao; largura?: number; }
export interface Qr { svg: string; png: string; }

let lib: Promise<typeof import('qrcode')> | null = null;
const carregar = () => (lib ??= import('qrcode').then((m) => ((m as any).default ?? m)));

export async function desenharQr(texto: string, { cor = '#000000', fundo = '#ffffff', correcao = 'M', largura = 1024 }: OpcoesQr = {}): Promise<Qr> {
  const QR = await carregar();
  const comum = { errorCorrectionLevel: correcao, margin: 4, color: { dark: cor, light: fundo } };
  const [svg, png] = await Promise.all([
    QR.toString(texto, { ...comum, type: 'svg' }),
    QR.toDataURL(texto, { ...comum, width: largura, type: 'image/png' }),
  ]);
  return { svg, png };
}

/** Luminância relativa (0 a 1) de uma cor #rrggbb. */
export function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const canal = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}

/** Contraste entre duas cores, de 1 a 21 (WCAG). */
export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
