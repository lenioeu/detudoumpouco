// Ajudantes de navegador (canvas e fontes) da ferramenta "Assinar PDF".
// Tudo vira um PNG transparente e recortado, que vai para a tela e para dentro do PDF.
import { limitesVisiveis, removerFundo, limiarSugerido, type Ponto } from './assinatura';

/**
 * Cores da tinta. Não são cores da interface: representam a caneta no papel, por isso são
 * as mesmas no modo claro e no escuro (a página do PDF é sempre branca).
 */
export const TINTAS = {
  azul: [24, 52, 160],
  preta: [20, 20, 24],
} as const satisfies Record<string, readonly [number, number, number]>;
export type Tinta = keyof typeof TINTAS;
export const corCss = (t: Tinta) => `rgb(${TINTAS[t].join(' ')})`;

/**
 * Fontes manuscritas para a aba "Digitar". Todas sob a SIL Open Font License 1.1 (Google Fonts),
 * baixadas do Fontsource (@fontsource/<nome>@5.3.0, subconjunto latin 400) e servidas de /fonts/.
 * Licença completa e créditos em public/fonts/assinaturas-OFL.txt.
 * Só são baixadas quando a pessoa abre a aba "Digitar".
 */
export const ESTILOS = [
  { id: 'dancing', nome: 'Dancing Script', familia: 'QG Assinatura Dancing', arquivo: '/fonts/assinatura-dancing-script.woff2', escala: 1 },
  { id: 'vibes', nome: 'Great Vibes', familia: 'QG Assinatura Vibes', arquivo: '/fonts/assinatura-great-vibes.woff2', escala: 1.1 },
  { id: 'sacramento', nome: 'Sacramento', familia: 'QG Assinatura Sacramento', arquivo: '/fonts/assinatura-sacramento.woff2', escala: 1.15 },
  { id: 'caveat', nome: 'Caveat', familia: 'QG Assinatura Caveat', arquivo: '/fonts/assinatura-caveat.woff2', escala: 0.95 },
] as const;
export type Estilo = (typeof ESTILOS)[number]['id'];

let fontes: Promise<void> | null = null;
/** Baixa as 4 fontes manuscritas (uma vez só). Se alguma falhar, as outras continuam valendo. */
export function carregarFontesManuscritas(): Promise<void> {
  if (!fontes) {
    fontes = Promise.allSettled(ESTILOS.map(async (e) => {
      const f = new FontFace(e.familia, `url(${e.arquivo}) format('woff2')`, { display: 'block' });
      await f.load();
      document.fonts.add(f);
    })).then(() => undefined);
  }
  return fontes;
}

/** Imagem pronta para colocar no PDF. */
export interface Imagem { blob: Blob; url: string; largura: number; altura: number; }

export function novoCanvas(largura: number, altura: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(largura)); c.height = Math.max(1, Math.round(altura));
  return c;
}

/** Recorta o canvas no que tem desenho, com uma pequena folga. Devolve null se estiver vazio. */
export function recortar(canvas: HTMLCanvasElement, folga = 4): HTMLCanvasElement | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const dados = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const r = limitesVisiveis(dados.data, canvas.width, canvas.height, 8);
  if (!r) return null;
  const x = Math.max(0, r.x - folga), y = Math.max(0, r.y - folga);
  const w = Math.min(canvas.width - x, r.largura + 2 * folga), h = Math.min(canvas.height - y, r.altura + 2 * folga);
  const saida = novoCanvas(w, h);
  saida.getContext('2d')!.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return saida;
}

export function paraPng(canvas: HTMLCanvasElement): Promise<Imagem> {
  return new Promise((ok, falha) => {
    canvas.toBlob((blob) => {
      if (!blob) { falha(new Error('Não foi possível gerar a imagem da assinatura.')); return; }
      ok({ blob, url: URL.createObjectURL(blob), largura: canvas.width, altura: canvas.height });
    }, 'image/png');
  });
}

/**
 * Desenha os traços com curvas suaves: cada trecho vai do meio de um segmento ao meio do próximo,
 * usando o ponto como controle. A espessura de cada trecho segue a do ponto (velocidade ou pressão).
 * `escala` converte as coordenadas (fração da largura do quadro) para pixels do canvas.
 */
export function desenharTracos(ctx: CanvasRenderingContext2D, tracos: Ponto[][], escala: number, espessura: number, cor: string, dx = 0, dy = 0) {
  ctx.strokeStyle = cor; ctx.fillStyle = cor; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const px = (p: Ponto) => [p.x * escala + dx, p.y * escala + dy] as const;
  for (const t of tracos) {
    if (!t.length) continue;
    if (t.length === 1) {
      const [x, y] = px(t[0]);
      ctx.beginPath(); ctx.arc(x, y, (espessura * t[0].f) / 2, 0, Math.PI * 2); ctx.fill();
      continue;
    }
    let [ax, ay] = px(t[0]);
    for (let i = 1; i < t.length; i++) {
      const [cx, cy] = px(t[i - 1]);
      const [bx, by] = px(t[i]);
      const mx = i === t.length - 1 ? bx : (cx + bx) / 2;
      const my = i === t.length - 1 ? by : (cy + by) / 2;
      ctx.beginPath();
      ctx.lineWidth = espessura * (t[i - 1].f + t[i].f) / 2;
      ctx.moveTo(ax, ay);
      if (i === 1) ctx.lineTo(mx, my); else ctx.quadraticCurveTo(cx, cy, mx, my);
      ctx.stroke();
      ax = mx; ay = my;
    }
  }
}

/**
 * Gera o PNG da assinatura desenhada, em alta resolução (o quadro tem `larguraQuadro` px na tela).
 * `espessura` está em px de tela.
 */
export async function tracosParaImagem(tracos: Ponto[][], larguraQuadro: number, espessura: number, tinta: Tinta): Promise<Imagem | null> {
  const pontos = tracos.flat();
  if (!pontos.length) return null;
  const xs = pontos.map((p) => p.x), ys = pontos.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  // 3 px de imagem por px de tela, sem passar de 2400 px de largura.
  const escalaTela = Math.min(3, 2400 / Math.max(1, (maxX - minX) * larguraQuadro + espessura * 4));
  const escala = larguraQuadro * escalaTela;
  const grossura = espessura * escalaTela;
  const folga = grossura * 1.5 + 4;
  const c = novoCanvas((maxX - minX) * escala + 2 * folga, (maxY - minY) * escala + 2 * folga);
  desenharTracos(c.getContext('2d')!, tracos, escala, grossura, corCss(tinta), folga - minX * escala, folga - minY * escala);
  const r = recortar(c, 2);
  return r ? paraPng(r) : null;
}

/** Escreve um texto num canvas transparente e recorta. `fonte` é o valor CSS de font-family. */
export async function textoParaImagem(texto: string, fonte: string, tinta: Tinta, px = 120, peso = '400'): Promise<Imagem | null> {
  const limpo = texto.trim();
  if (!limpo) return null;
  const medir = novoCanvas(10, 10).getContext('2d')!;
  medir.font = `${peso} ${px}px ${fonte}`;
  const largura = medir.measureText(limpo).width;
  // Letras manuscritas passam bastante da caixa normal da fonte: folga generosa e depois recorte.
  const folga = px;
  const c = novoCanvas(Math.min(6000, largura + 2 * folga), px * 2.4);
  const ctx = c.getContext('2d')!;
  ctx.font = medir.font;
  ctx.fillStyle = corCss(tinta);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(limpo, folga, px * 1.5);
  const r = recortar(c, Math.round(px * 0.06));
  return r ? paraPng(r) : null;
}

/** Foto carregada e reduzida, guardada para refazer o recorte quando o limiar muda. */
export interface Foto { dados: ImageData; limiar: number; }

/** Abre a foto (respeitando a orientação da câmera) e reduz para no máximo 1600 px. */
export async function abrirFoto(file: File): Promise<Foto> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Não foi possível abrir esta imagem. Use uma foto em JPG ou PNG.');
  }
  const escala = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = novoCanvas(bmp.width * escala, bmp.height * escala);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  const dados = ctx.getImageData(0, 0, c.width, c.height);
  return { dados, limiar: limiarSugerido(dados.data) };
}

/** Tira o fundo claro da foto com o limiar escolhido, pinta na cor da tinta e recorta. */
export async function fotoParaImagem(foto: Foto, limiar: number, tinta: Tinta): Promise<Imagem | null> {
  const copia = new ImageData(new Uint8ClampedArray(foto.dados.data), foto.dados.width, foto.dados.height);
  removerFundo(copia.data, limiar, [...TINTAS[tinta]]);
  const c = novoCanvas(copia.width, copia.height);
  c.getContext('2d')!.putImageData(copia, 0, 0);
  const r = recortar(c, 4);
  return r ? paraPng(r) : null;
}

/** Imagem a partir de um endereço data: (usado para a assinatura lembrada no aparelho). */
export async function imagemDeDataUrl(dataUrl: string): Promise<Imagem | null> {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bin = atob(m[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch { URL.revokeObjectURL(url); return null; }
  return { blob, url, largura: img.naturalWidth, altura: img.naturalHeight };
}

export function paraDataUrl(blob: Blob): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falha(r.error);
    r.readAsDataURL(blob);
  });
}
