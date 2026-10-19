// Funções puras do "Escanear para PDF": filtros que fazem uma foto parecer escaneada,
// recorte guardado em frações (não depende da resolução) e o tamanho da página.
// Nada aqui toca no DOM: recebe e devolve números e arrays de pixels.
import { luminancia } from './cinza';
import { PAGINAS, posicionarImagem, type Posicao } from './pdf-pagina';
import type { Retangulo } from './imagem';

export type Filtro = 'documento' | 'pb' | 'cor' | 'original';

export const NOMES_FILTRO: Record<Filtro, string> = {
  documento: 'Documento (cinza com contraste)',
  pb: 'Preto e branco',
  cor: 'Cor realçada',
  original: 'Original (sem filtro)',
};

// ---------- Fundo do papel ----------

/**
 * Estima o brilho do papel em cada ponto da foto. A sombra da mão ou do celular e a luz
 * desigual deixam o papel mais escuro de um lado: dividindo cada pixel por esse fundo,
 * o papel volta a ficar branco por igual e o texto continua escuro.
 *
 * Como funciona: divide a foto em blocos e pega, em cada um, um tom bem claro (percentil 90,
 * que é o papel entre as letras). Depois espalha o maior valor para os vizinhos (para um
 * bloco cheio de tinta não virar "papel escuro"), suaviza e interpola para cada pixel.
 */
export function estimarFundo(lum: Uint8Array, largura: number, altura: number): Float32Array {
  const bloco = Math.max(4, Math.round(Math.max(largura, altura) / 24));
  const gw = Math.ceil(largura / bloco), gh = Math.ceil(altura / bloco);
  let grade = new Float32Array(gw * gh);
  const hist = new Uint32Array(256);
  for (let by = 0; by < gh; by++) {
    for (let bx = 0; bx < gw; bx++) {
      hist.fill(0);
      const x0 = bx * bloco, y0 = by * bloco;
      const x1 = Math.min(largura, x0 + bloco), y1 = Math.min(altura, y0 + bloco);
      // Amostra no máximo ~1 em cada 4 pixels por eixo: rápido e suficiente para um percentil.
      const passo = Math.max(1, Math.floor(bloco / 16));
      let n = 0;
      for (let y = y0; y < y1; y += passo) for (let x = x0; x < x1; x += passo) { hist[lum[y * largura + x]]++; n++; }
      const alvo = n * 0.9;
      let soma = 0, v = 255;
      for (let k = 0; k < 256; k++) { soma += hist[k]; if (soma >= alvo) { v = k; break; } }
      grade[by * gw + bx] = v;
    }
  }
  // Máximo entre vizinhos (3 x 3) e duas passadas de média (3 x 3).
  const vizinhos = (fonte: Float32Array, juntar: (a: number[]) => number) => {
    const out = new Float32Array(fonte.length);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const vals: number[] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) vals.push(fonte[yy * gw + xx]);
      }
      out[y * gw + x] = juntar(vals);
    }
    return out;
  };
  const media = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  grade = vizinhos(grade, (a) => Math.max(...a));
  grade = vizinhos(grade, media);
  grade = vizinhos(grade, media);

  // Interpolação bilinear entre os centros dos blocos.
  const fundo = new Float32Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    const gy = Math.min(Math.max((y + 0.5) / bloco - 0.5, 0), gh - 1);
    const y0 = Math.floor(gy), y1 = Math.min(y0 + 1, gh - 1), fy = gy - y0;
    for (let x = 0; x < largura; x++) {
      const gx = Math.min(Math.max((x + 0.5) / bloco - 0.5, 0), gw - 1);
      const x0 = Math.floor(gx), x1 = Math.min(x0 + 1, gw - 1), fx = gx - x0;
      const a = grade[y0 * gw + x0] * (1 - fx) + grade[y0 * gw + x1] * fx;
      const b = grade[y1 * gw + x0] * (1 - fx) + grade[y1 * gw + x1] * fx;
      // Nunca abaixo de 60: numa área muito escura (a mesa em volta), não estoura para branco.
      fundo[y * largura + x] = Math.max(60, a * (1 - fy) + b * fy);
    }
  }
  return fundo;
}

/** Ajuste de níveis: o que estiver abaixo de `preto` vira 0, acima de `branco` vira 1. */
function niveis(v: number, preto: number, branco: number): number {
  return Math.min(1, Math.max(0, (v - preto) / (branco - preto)));
}

/**
 * Aplica o filtro nos pixels RGBA (no próprio array).
 * - documento: tira a sombra, deixa o papel branco e o texto bem escuro, em cinza;
 * - pb: igual, mas só preto e branco (com uma pequena borda suave para o texto não serrilhar);
 * - cor: tira a sombra e aumenta o contraste mantendo as cores (carimbos, canetas, fotos);
 * - original: não muda nada.
 */
export function aplicarFiltro(px: Uint8ClampedArray, largura: number, altura: number, filtro: Filtro): void {
  if (filtro === 'original') return;
  const n = largura * altura;
  const lum = new Uint8Array(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) lum[j] = Math.round(luminancia(px[i], px[i + 1], px[i + 2]));
  const fundo = estimarFundo(lum, largura, altura);

  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const f = fundo[j];
    if (filtro === 'cor') {
      for (let c = 0; c < 3; c++) {
        const v = niveis(Math.min(1, px[i + c] / f), 0.2, 0.9);
        px[i + c] = Math.round(255 * v);
      }
      // Um pouco mais de saturação, para a tinta colorida não ficar desbotada.
      const y = luminancia(px[i], px[i + 1], px[i + 2]);
      for (let c = 0; c < 3; c++) px[i + c] = Math.round(y + (px[i + c] - y) * 1.25);
    } else {
      const v = Math.min(1, lum[j] / f);
      const saida = filtro === 'pb'
        ? niveis(v, 0.66, 0.76)
        : Math.pow(niveis(v, 0.3, 0.9), 1.25);
      px[i] = px[i + 1] = px[i + 2] = Math.round(255 * saida);
    }
    px[i + 3] = 255;
  }
}

// ---------- Recorte em frações ----------

/** Recorte guardado como fração da foto (0 a 1): serve igual para a miniatura e para a foto inteira. */
export interface Fracao { x: number; y: number; largura: number; altura: number; }
export const FOTO_INTEIRA: Fracao = { x: 0, y: 0, largura: 1, altura: 1 };

/** O recorte acompanha a foto girada 90 graus no sentido do relógio. */
export function girarFracao(r: Fracao): Fracao {
  return { x: 1 - (r.y + r.altura), y: r.x, largura: r.altura, altura: r.largura };
}

/** Gira o recorte `vezes` x 90 graus no sentido do relógio (pode ser negativo). */
export function girarFracaoVezes(r: Fracao, vezes: number): Fracao {
  let s = r;
  for (let k = 0; k < ((vezes % 4) + 4) % 4; k++) s = girarFracao(s);
  return s;
}

/** Recorte em pixels de uma imagem de largura x altura. Sempre dentro da imagem e com pelo menos 1 px. */
export function fracaoEmPixels(r: Fracao, largura: number, altura: number): Retangulo {
  const x = Math.min(Math.max(Math.round(r.x * largura), 0), largura - 1);
  const y = Math.min(Math.max(Math.round(r.y * altura), 0), altura - 1);
  return {
    x, y,
    largura: Math.max(1, Math.min(Math.round(r.largura * largura), largura - x)),
    altura: Math.max(1, Math.min(Math.round(r.altura * altura), altura - y)),
  };
}

/** Pixels para fração. */
export function pixelsEmFracao(r: Retangulo, largura: number, altura: number): Fracao {
  return { x: r.x / largura, y: r.y / altura, largura: r.largura / largura, altura: r.altura / altura };
}

/** Tamanho final da imagem (sem distorcer) para o lado maior caber em `ladoMaximo`. Nunca aumenta. */
export function tamanhoDeSaida(largura: number, altura: number, ladoMaximo: number): { largura: number; altura: number } {
  const f = Math.min(1, ladoMaximo / Math.max(largura, altura));
  return { largura: Math.max(1, Math.round(largura * f)), altura: Math.max(1, Math.round(altura * f)) };
}

// ---------- Página ----------

export type TamanhoScan = 'a4' | 'foto';

/**
 * Página do PDF para uma foto de largura x altura pixels.
 * - a4: folha A4 (em pé ou deitada, conforme a foto), com a foto inteira centralizada;
 * - foto: página no formato da foto, com o lado maior do tamanho do lado maior do A4 (29,7 cm),
 *   para imprimir num tamanho razoável e não ficar gigante nem minúscula.
 */
export function paginaDoScan(largura: number, altura: number, tamanho: TamanhoScan): Posicao {
  if (tamanho === 'a4') return posicionarImagem(largura, altura, 'a4', 'auto', 0);
  const longo = PAGINAS.a4[1];
  const f = longo / Math.max(largura, altura);
  const w = largura * f, h = altura * f;
  return { largura: w, altura: h, x: 0, y: 0, w, h };
}

/** Qualidade de saída: lado maior em pixels e qualidade do JPG. */
export const QUALIDADES = {
  menor: { lado: 1400, jpg: 0.7 },
  normal: { lado: 2000, jpg: 0.82 },
  alta: { lado: 3000, jpg: 0.9 },
} as const;
export type QualidadeScan = keyof typeof QUALIDADES;
