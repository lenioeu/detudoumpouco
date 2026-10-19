// Contas do "Editar PDF", do "Preencher formulário" e do "Ocultar informações": funções puras,
// sem nada do navegador. As coordenadas "de tela" são as da página como aparece para a pessoa
// (origem no canto superior esquerdo, já girada), em pontos (1/72 de polegada). As coordenadas
// "do PDF" são as do arquivo (origem embaixo à esquerda, antes do giro da página).

/** Caixa da página no PDF: [x1, y1, x2, y2] (a área visível, como o pdf.js chama de "view"). */
export type CaixaPdf = [number, number, number, number];
export type Matriz = [number, number, number, number, number, number];

export interface GeometriaPagina {
  caixa: CaixaPdf;
  /** Giro da página (0, 90, 180 ou 270), como no /Rotate do PDF. */
  giro: number;
}

/** Normaliza o giro para 0, 90, 180 ou 270. */
export function normalizarGiro(giro: number): number {
  const g = ((Math.round(giro / 90) * 90) % 360 + 360) % 360;
  return g;
}

/**
 * Matriz que leva um ponto do PDF para a tela (escala 1). É a mesma conta do PageViewport do pdf.js.
 */
export function matrizTela(g: GeometriaPagina): Matriz {
  const [x1, y1, x2, y2] = g.caixa;
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  let a: number, b: number, c: number, d: number;
  switch (normalizarGiro(g.giro)) {
    case 90: a = 0; b = 1; c = 1; d = 0; break;
    case 180: a = -1; b = 0; c = 0; d = 1; break;
    case 270: a = 0; b = -1; c = -1; d = 0; break;
    default: a = 1; b = 0; c = 0; d = -1;
  }
  let ox: number, oy: number;
  if (a === 0) { ox = Math.abs(cy - y1); oy = Math.abs(cx - x1); }
  else { ox = Math.abs(cx - x1); oy = Math.abs(cy - y1); }
  return [a, b, c, d, ox - a * cx - c * cy, oy - b * cx - d * cy];
}

/** Largura e altura da página como aparece na tela, em pontos. */
export function tamanhoNaTela(g: GeometriaPagina): { largura: number; altura: number } {
  const w = Math.abs(g.caixa[2] - g.caixa[0]), h = Math.abs(g.caixa[3] - g.caixa[1]);
  const deitada = normalizarGiro(g.giro) % 180 !== 0;
  return deitada ? { largura: h, altura: w } : { largura: w, altura: h };
}

export function aplicar(m: Matriz, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Ponto do PDF para a tela. */
export function pdfParaTela(g: GeometriaPagina, x: number, y: number): [number, number] {
  return aplicar(matrizTela(g), x, y);
}

/** Ponto da tela para o PDF (a conta inversa). */
export function telaParaPdf(g: GeometriaPagina, u: number, v: number): [number, number] {
  const [a, b, c, d, e, f] = matrizTela(g);
  const det = a * d - b * c;
  const du = u - e, dv = v - f;
  return [(d * du - c * dv) / det, (a * dv - b * du) / det];
}

/** Retângulo da tela (x, y, largura, altura) para o PDF: devolve x, y do canto inferior esquerdo, largura e altura. */
export function retanguloParaPdf(g: GeometriaPagina, x: number, y: number, w: number, h: number) {
  const [ax, ay] = telaParaPdf(g, x, y);
  const [bx, by] = telaParaPdf(g, x + w, y + h);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), largura: Math.abs(bx - ax), altura: Math.abs(by - ay) };
}

/** Retângulo do PDF (x, y do canto inferior esquerdo, largura, altura) para a tela. */
export function retanguloParaTela(g: GeometriaPagina, x: number, y: number, w: number, h: number) {
  const [ax, ay] = pdfParaTela(g, x, y);
  const [bx, by] = pdfParaTela(g, x + w, y + h);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), largura: Math.abs(bx - ax), altura: Math.abs(by - ay) };
}

/** "#ff8800" -> [1, 0.53, 0] (de 0 a 1, como o pdf-lib usa). Cor inválida vira preto. */
export function corRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  let s = m[1];
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/**
 * Troca os caracteres que a fonte não tem. Primeiro tenta sem o acento (ő vira o);
 * se mesmo assim não der, vira "?". Quebras de linha são mantidas.
 * Devolve o texto e quantos caracteres precisaram de troca.
 */
export function textoSuportado(texto: string, temCaractere: (codigo: number) => boolean): { texto: string; trocados: number } {
  let trocados = 0;
  let saida = '';
  for (const ch of texto.replace(/\r\n?/g, '\n')) {
    if (ch === '\n') { saida += ch; continue; }
    if (ch === '\t') { saida += '    '; continue; }
    const cp = ch.codePointAt(0)!;
    if (temCaractere(cp)) { saida += ch; continue; }
    trocados++;
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (base && [...base].every((c) => temCaractere(c.codePointAt(0)!))) saida += base;
    else if (/\s/.test(ch)) saida += ' ';
    else saida += '?';
  }
  return { texto: saida, trocados };
}

/** Fontes padrão do PDF oferecidas no editor (não precisam ser embutidas no arquivo). */
export const FONTES = {
  helvetica: { nome: 'Sem serifa', css: "Helvetica, Arial, 'Liberation Sans', 'Nimbus Sans', sans-serif", base: 0.95 },
  times: { nome: 'Com serifa', css: "'Times New Roman', Times, 'Liberation Serif', 'Nimbus Roman', serif", base: 0.94 },
  courier: { nome: 'Máquina de escrever', css: "'Courier New', Courier, 'Liberation Mono', 'Nimbus Mono PS', monospace", base: 0.87 },
} as const;
export type Fonte = keyof typeof FONTES;
/** Altura de cada linha de texto, em relação ao tamanho da fonte (igual na tela e no PDF). */
export const ENTRELINHA = 1.2;

/** Caixa (x, y, largura, altura) que envolve uma lista de pontos [x0, y0, x1, y1, ...]. */
export function caixaDosPontos(p: number[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < p.length; i += 2) {
    x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]);
    y0 = Math.min(y0, p[i + 1]); y1 = Math.max(y1, p[i + 1]);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Simplifica um traço feito à mão: tira pontos que quase não acrescentam nada
 * (mais perto que `tolerancia` da linha entre os vizinhos). Algoritmo de Ramer-Douglas-Peucker.
 */
export function simplificarTraco(p: number[], tolerancia: number): number[] {
  const n = p.length / 2;
  if (n <= 2) return p.slice();
  const manter = new Uint8Array(n);
  manter[0] = 1; manter[n - 1] = 1;
  const pilha: [number, number][] = [[0, n - 1]];
  while (pilha.length) {
    const [i, j] = pilha.pop()!;
    const ax = p[2 * i], ay = p[2 * i + 1], bx = p[2 * j], by = p[2 * j + 1];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    let maior = -1, idx = -1;
    for (let k = i + 1; k < j; k++) {
      const px = p[2 * k], py = p[2 * k + 1];
      const dist = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (dist > maior) { maior = dist; idx = k; }
    }
    if (maior > tolerancia && idx > 0) { manter[idx] = 1; pilha.push([i, idx], [idx, j]); }
  }
  const saida: number[] = [];
  for (let k = 0; k < n; k++) if (manter[k]) saida.push(p[2 * k], p[2 * k + 1]);
  return saida;
}

// ---------------------------------------------------------------------------------------------
// Busca de dados pessoais (Ocultar informações)

export type TipoDado = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'rg' | 'cep' | 'busca';

export const NOMES_DADOS: Record<TipoDado, string> = {
  cpf: 'CPF', cnpj: 'CNPJ', email: 'E-mail', telefone: 'Telefone', rg: 'RG', cep: 'CEP', busca: 'Texto buscado',
};

const PADROES: [TipoDado, RegExp][] = [
  ['cnpj', /(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g],
  ['cpf', /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g],
  ['email', /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g],
  ['telefone', /(?<![\d-])(?:\+?55\s?)?(?:\(\d{2}\)\s?|\d{2}[\s.-])?9?\d{4}[\s.-]?\d{4}(?![\d-])/g],
  ['cep', /(?<!\d)\d{5}-\d{3}(?!\d)/g],
  ['rg', /(?<![\d.])\d{1,2}\.\d{3}\.\d{3}-?[\dxX](?![\d])/g],
];

export interface Achado { tipo: TipoDado; inicio: number; fim: number; texto: string; }

/** Remove acentos e passa para minúsculas, mantendo o mesmo número de caracteres. */
function dobrar(s: string): string {
  return Array.from(s, (c) => c.normalize('NFD').charAt(0).toLowerCase()).join('');
}

/**
 * Procura dados pessoais num texto. `tipos` diz quais procurar; `busca` é um texto livre
 * (sem diferenciar maiúsculas nem acentos). Os achados não se sobrepõem: vale o primeiro tipo da lista.
 */
export function acharDados(texto: string, tipos: TipoDado[], busca = ''): Achado[] {
  const achados: Achado[] = [];
  const ocupado = (i: number, f: number) => achados.some((a) => i < a.fim && f > a.inicio);
  const termo = busca.trim();
  if (termo && tipos.includes('busca')) {
    // Array.from conta caracteres como o texto original (sem quebrar acentos compostos).
    const base = dobrar(texto), t = dobrar(termo);
    const chars = Array.from(texto);
    if (base.length === chars.length) {
      let i = base.indexOf(t);
      while (i >= 0) {
        const ini = chars.slice(0, i).join('').length;
        const fim = chars.slice(0, i + t.length).join('').length;
        achados.push({ tipo: 'busca', inicio: ini, fim, texto: texto.slice(ini, fim) });
        i = base.indexOf(t, i + Math.max(t.length, 1));
      }
    }
  }
  for (const [tipo, re] of PADROES) {
    if (!tipos.includes(tipo)) continue;
    re.lastIndex = 0;
    for (const m of texto.matchAll(re)) {
      const ini = m.index!, fim = ini + m[0].length;
      // Telefone precisa de 8 dígitos ou mais; evita pegar datas e valores.
      if (tipo === 'telefone' && m[0].replace(/\D/g, '').length < 8) continue;
      if (!ocupado(ini, fim)) achados.push({ tipo, inicio: ini, fim, texto: m[0] });
    }
  }
  return achados.sort((a, b) => a.inicio - b.inicio);
}

/**
 * Caixa na tela (escala 1) de um trecho de um item de texto do pdf.js.
 * `transform` é a matriz do item (no espaço do PDF), `largura` a largura do item em pontos e
 * `de`/`ate` a fração do texto (0 a 1) onde o trecho começa e termina.
 * Calcula os quatro cantos (funciona com texto girado) e devolve a caixa que os envolve, com folga.
 */
export function caixaDoTrecho(
  g: GeometriaPagina,
  transform: number[],
  largura: number,
  de: number,
  ate: number,
  folga = 1.5,
): { x: number; y: number; w: number; h: number } {
  const [a, b, c, d, e, f] = transform;
  const tam = Math.hypot(c, d) || Math.hypot(a, b) || 10;
  const dir = Math.hypot(a, b) ? [a / Math.hypot(a, b), b / Math.hypot(a, b)] : [1, 0];
  const cima = Math.hypot(c, d) ? [c / Math.hypot(c, d), d / Math.hypot(c, d)] : [-dir[1], dir[0]];
  const pts: number[] = [];
  for (const s of [de, ate]) {
    for (const t of [-0.25, 0.95]) {
      const x = e + dir[0] * largura * s + cima[0] * tam * t;
      const y = f + dir[1] * largura * s + cima[1] * tam * t;
      pts.push(...pdfParaTela(g, x, y));
    }
  }
  const cx = caixaDosPontos(pts);
  return { x: cx.x - folga, y: cx.y - folga, w: cx.w + 2 * folga, h: cx.h + 2 * folga };
}

// ---------------------------------------------------------------------------------------------
// Formulários

/** Nome legível de um campo: "form1[0].Pagina1[0].NomeCompleto[0]" vira "NomeCompleto". */
export function nomeDoCampo(nome: string): string {
  const ultimo = nome.split('.').filter(Boolean).pop() ?? nome;
  const limpo = ultimo.replace(/\[\d+\]$/g, '').replace(/[_]+/g, ' ').trim();
  return limpo || nome;
}

/** Ordem de leitura: página, depois de cima para baixo (com tolerância de linha) e da esquerda para a direita. */
export function compararPosicao(
  a: { pagina: number; x: number; y: number },
  b: { pagina: number; x: number; y: number },
  tolerancia = 6,
): number {
  if (a.pagina !== b.pagina) return a.pagina - b.pagina;
  if (Math.abs(a.y - b.y) > tolerancia) return a.y - b.y;
  return a.x - b.x;
}
