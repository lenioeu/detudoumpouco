// Acha e lê QR Codes numa imagem ou num quadro da câmera, no navegador.
// Usa o BarcodeDetector do próprio navegador quando existe (Android, Chrome no Mac, Safari recente)
// e o jsQR, carregado só na hora, nos demais. Nada sai do aparelho.

type Fonte = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | ImageBitmap;
type JsQR = typeof import('jsqr').default;

let jsqr: Promise<JsQR> | null = null;
const carregarJsqr = () => (jsqr ??= import('jsqr').then((m) => ((m as any).default ?? m) as JsQR));

let detector: Promise<any | null> | null = null;
function obterDetector(): Promise<any | null> {
  return (detector ??= (async () => {
    const BD = (globalThis as any).BarcodeDetector;
    if (!BD) return null;
    try {
      const formatos: string[] = await BD.getSupportedFormats();
      return formatos.includes('qr_code') ? new BD({ formats: ['qr_code'] }) : null;
    } catch { return null; }
  })());
}

/** Já deixa o jsQR baixado (por exemplo, quando a pessoa abre a câmera). */
export function prepararLeitor(): void { void obterDetector().then((d) => { if (!d) void carregarJsqr(); }); }

const tamanho = (f: Fonte): [number, number] =>
  f instanceof HTMLVideoElement ? [f.videoWidth, f.videoHeight]
  : f instanceof HTMLImageElement ? [f.naturalWidth, f.naturalHeight]
  : [f.width, f.height];

let tela: HTMLCanvasElement | null = null;
function pixels(f: Fonte, lado: number): ImageData | null {
  const [w, h] = tamanho(f);
  if (!w || !h) return null;
  const k = Math.min(1, lado / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
  tela ??= document.createElement('canvas');
  tela.width = cw; tela.height = ch;
  const ctx = tela.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch); // fundo branco para PNG transparente
  ctx.drawImage(f, 0, 0, cw, ch);
  return ctx.getImageData(0, 0, cw, ch);
}

/**
 * Devolve o texto de cada QR Code encontrado (lista vazia se não achar nenhum).
 * `rapido` é para a câmera: uma tentativa só, num tamanho menor.
 */
export async function lerQr(fonte: Fonte, { rapido = false } = {}): Promise<string[]> {
  const det = await obterDetector();
  if (det) {
    try {
      const achados: { rawValue: string }[] = await det.detect(fonte);
      const textos = [...new Set(achados.map((a) => a.rawValue).filter(Boolean))];
      if (textos.length || rapido) return textos;
    } catch { /* tenta com o jsQR */ }
  }
  const ler = await carregarJsqr();
  const maior = Math.max(...tamanho(fonte));
  if (!maior) return [];
  // Tenta em alguns tamanhos: QR Code pequeno numa foto grande às vezes só aparece ampliado, e vice-versa.
  const lados = [...new Set((rapido ? [720] : [1200, 2000, 600, 360]).map((l) => Math.min(l, maior)))];
  for (const lado of lados) {
    const img = pixels(fonte, lado);
    if (!img) return [];
    const r = ler(img.data, img.width, img.height, { inversionAttempts: rapido ? 'dontInvert' : 'attemptBoth' });
    if (r?.data) return [r.data];
  }
  return [];
}
