// Converte o texto de um PDF em Markdown: títulos, listas, tabelas, links, negrito e itálico.
// O PDF não guarda estrutura, só pedaços de texto com posição, tamanho e fonte. Aqui a estrutura é
// adivinhada a partir disso:
// - títulos: letra bem maior que a do corpo do texto (ou linha curta e solta toda em negrito);
// - listas: linha que começa com marcador (•, -, 1., a)...), com o recuo dando o nível;
// - tabelas: várias linhas seguidas com os pedaços alinhados nas mesmas colunas;
// - links: anotações de link do PDF sobre o texto, e endereços escritos no próprio texto.
// Funções puras, sem depender do navegador (dá para testar no Node).
import { pedacoDoPdfJs, type PedacoTexto } from './pdf-texto';

export { contarPalavras, paginasSemTexto } from './pdf-texto';

export interface ItemMd extends PedacoTexto {
  negrito?: boolean;
  italico?: boolean;
}

/** Retângulo de um link na página, em pontos (y cresce para cima). */
export interface LinkMd { x1: number; y1: number; x2: number; y2: number; url: string; }

export interface PaginaMd {
  itens: ItemMd[];
  links?: LinkMd[];
  /** Altura da página, em pontos. Ajuda a achar cabeçalho e rodapé. */
  altura?: number;
  /** y da borda de baixo da página (quase sempre 0). */
  base?: number;
}

export interface OpcoesMarkdown {
  /** Põe "---" e "<!-- página N -->" no começo de cada página. */
  separarPaginas?: boolean;
  /** Tira cabeçalhos e rodapés repetidos e números de página soltos. Padrão: sim. */
  limparRepetidos?: boolean;
  /** Páginas a converter (começando em 1). Padrão: todas. */
  paginas?: number[];
}

export interface ResumoMarkdown { titulos: number; listas: number; tabelas: number; links: number; removidas: number; }

/* ------------------------------------------------------------------ fontes e itens do pdf.js */

export interface InfoFonte { name?: string; bold?: boolean; black?: boolean; italic?: boolean; }

/** Negrito e itálico pelo nome da fonte ("Helvetica-BoldOblique", "ABCDEF+Arial-BoldItalicMT"...). */
export function estiloDaFonte(f?: InfoFonte | null): { negrito: boolean; italico: boolean } {
  const nome = (f?.name ?? '').replace(/^[A-Z]{6}\+/, '');
  const negrito = !!(f?.bold || f?.black)
    || /bold|black|heavy|semibold|demi|negrito|fett/i.test(nome)
    || /[-,](Bd|Blk|Hv|Hvy)(It|Obl|MT)?$/.test(nome);
  const italico = !!f?.italic || /italic|oblique|kursiv|inclined|slanted/i.test(nome) || /(?:-|,|[a-z])(It|Obl)$/.test(nome);
  return { negrito, italico };
}

/** Converte um item do getTextContent() do pdf.js, com a fonte dele, em ItemMd. */
export function itemDoPdfJs(item: unknown, fonte?: InfoFonte | null): ItemMd | null {
  const p = pedacoDoPdfJs(item);
  return p ? { ...p, ...estiloDaFonte(fonte) } : null;
}

/** Converte uma anotação do getAnnotations() do pdf.js em link, se for link para endereço externo. */
export function linkDaAnotacao(a: unknown): LinkMd | null {
  const x = a as { subtype?: string; url?: string; rect?: number[] };
  if (x?.subtype !== 'Link' || typeof x.url !== 'string' || !x.rect || x.rect.length < 4) return null;
  if (!/^(https?:|mailto:|ftp:)/i.test(x.url)) return null;
  const [a1, b1, a2, b2] = x.rect;
  return { x1: Math.min(a1, a2), y1: Math.min(b1, b2), x2: Math.max(a1, a2), y2: Math.max(b1, b2), url: x.url };
}

/* ------------------------------------------------------------------ linhas */

interface Trecho {
  texto: string;
  x: number;
  fimX: number;
  altura: number;
  negrito: boolean;
  italico: boolean;
  url?: string;
  /** Tem espaço antes (separa do trecho anterior da mesma linha). */
  espaco: boolean;
}

interface LinhaMd {
  trechos: Trecho[];
  y: number;
  /** Tamanho da letra que mais aparece na linha, arredondado em 0,5 pt. */
  tamanho: number;
  x: number;
  texto: string;
}

type ItemComLink = ItemMd & { url?: string };

/** Separa um item nas partes que ficam embaixo de um link (pela posição estimada de cada letra). */
function dividirPorLinks(it: ItemMd, links: LinkMd[]): ItemComLink[] {
  if (!links.length || !it.str.trim()) return [it];
  const meio = it.y + it.altura * 0.3;
  const sobre = links.filter((l) => meio >= l.y1 - 1 && meio <= l.y2 + 1 && l.x2 > it.x && l.x1 < it.x + Math.max(it.largura, 1));
  if (!sobre.length) return [it];
  const letras = Array.from(it.str);
  const n = letras.length;
  if (it.largura <= 0) return [{ ...it, url: sobre[0].url }];
  const lw = it.largura / n;
  const dono: (string | undefined)[] = letras.map((_, i) => {
    const cx = it.x + (i + 0.5) * lw;
    return sobre.find((l) => cx >= l.x1 - 0.5 && cx <= l.x2 + 0.5)?.url;
  });
  // A posição das letras é estimada: uma palavra tocada por um link inteiro entra toda no link.
  for (let i = 0; i < n;) {
    if (/\s/.test(letras[i])) { i++; continue; }
    let j = i;
    while (j < n && !/\s/.test(letras[j])) j++;
    const urls = new Set(dono.slice(i, j).filter(Boolean));
    if (urls.size === 1) { const u = [...urls][0]; for (let k = i; k < j; k++) dono[k] = u; }
    i = j;
  }
  // Espaço entre duas palavras do mesmo link também é do link.
  for (let i = 1; i < n - 1; i++) {
    if (!dono[i] && /\s/.test(letras[i])) {
      let j = i; while (j < n && /\s/.test(letras[j])) j++;
      if (j < n && dono[i - 1] && dono[i - 1] === dono[j]) for (let k = i; k < j; k++) dono[k] = dono[j];
    }
  }
  const partes: ItemComLink[] = [];
  let ini = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || dono[i] !== dono[ini]) {
      partes.push({
        ...it, str: letras.slice(ini, i).join(''), x: it.x + ini * lw, largura: (i - ini) * lw,
        fimDeLinha: i === n ? it.fimDeLinha : false, url: dono[ini],
      });
      ini = i;
    }
  }
  return partes;
}

function tamanhoDominante(trechos: Trecho[]): number {
  const conta = new Map<number, number>();
  for (const t of trechos) {
    const k = Math.round(t.altura * 2) / 2;
    conta.set(k, (conta.get(k) ?? 0) + t.texto.length);
  }
  let melhor = 0, max = -1;
  for (const [k, v] of conta) if (v > max || (v === max && k > melhor)) { melhor = k; max = v; }
  return melhor;
}

function textoDaLinha(trechos: Trecho[]): string {
  return trechos.map((t, i) => (i > 0 && t.espaco ? ' ' : '') + t.texto).join('');
}

/** Agrupa os itens em linhas, na ordem do arquivo (como em pdf-texto.ts), guardando fonte e posição de cada trecho. */
function montarLinhas(itens: ItemComLink[]): LinhaMd[] {
  const linhas: LinhaMd[] = [];
  let atual: { trechos: Trecho[]; y: number; altura: number } | null = null;
  let fechada = false;
  let espacoPendente = false;
  const fechar = () => {
    if (atual && atual.trechos.length) {
      const trechos = atual.trechos;
      linhas.push({ trechos, y: atual.y, tamanho: tamanhoDominante(trechos), x: trechos[0].x, texto: textoDaLinha(trechos) });
    }
    atual = null;
  };
  for (const p of itens) {
    const bruto = p.str.replace(/\u0000/g, '');
    if (bruto.trim()) {
      const a = atual as { trechos: Trecho[]; y: number; altura: number } | null;
      const mesma = a && !fechada && Math.abs(p.y - a.y) <= Math.max(p.altura, a.altura) * 0.5;
      if (!mesma) {
        fechar();
        atual = { trechos: [], y: p.y, altura: p.altura };
        fechada = false;
        espacoPendente = false;
      }
      const l = atual!;
      const texto = bruto.replace(/\s+/g, ' ');
      const ultimo = l.trechos[l.trechos.length - 1];
      const espaco = !!ultimo && (espacoPendente || texto.startsWith(' ') || p.x - ultimo.fimX > Math.min(p.altura, l.altura) * 0.15);
      l.trechos.push({
        texto: texto.trim(), x: p.x, fimX: p.x + p.largura, altura: p.altura,
        negrito: !!p.negrito, italico: !!p.italico, url: p.url, espaco,
      });
      l.altura = Math.max(l.altura, p.altura);
      espacoPendente = texto.endsWith(' ');
    } else if (bruto && atual) {
      espacoPendente = true;
    }
    if (p.fimDeLinha && atual) fechada = true;
  }
  fechar();
  return linhas;
}

/* ------------------------------------------------------------------ cabeçalho, rodapé e números de página */

const RE_NUMERO_PAGINA = /^(?:[-–—]\s*)?(?:p[áa]g(?:ina)?\.?\s*)?\d{1,4}(?:\s*(?:de|of|\/)\s*\d{1,4})?(?:\s*[-–—])?$|^[ivxlcdm]{1,6}$/i;

function chaveRepetida(t: string): string {
  return t.trim().toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ');
}

/** Linhas de cada página que ficam na faixa de cima ou de baixo (onde moram cabeçalho e rodapé). */
function linhasDaMargem(linhas: LinhaMd[], pagina: PaginaMd): Set<LinhaMd> {
  const r = new Set<LinhaMd>();
  if (!linhas.length) return r;
  if (pagina.altura && pagina.altura > 0) {
    const base = pagina.base ?? 0;
    for (const l of linhas) {
      if (l.y >= base + pagina.altura * 0.9 || l.y <= base + pagina.altura * 0.1) r.add(l);
    }
  } else {
    const ord = [...linhas].sort((a, b) => b.y - a.y);
    for (const l of [...ord.slice(0, 2), ...ord.slice(-2)]) r.add(l);
  }
  return r;
}

/** Tira das páginas os cabeçalhos/rodapés repetidos e os números de página. Devolve quantas linhas saíram. */
function limparMargens(paginas: LinhaMd[][], fontes: PaginaMd[], corpo: number): number {
  const margens = paginas.map((ls, i) => linhasDaMargem(ls, fontes[i]));
  const conta = new Map<string, number>();
  margens.forEach((m) => {
    const vistas = new Set<string>();
    for (const l of m) vistas.add(chaveRepetida(l.texto));
    for (const k of vistas) conta.set(k, (conta.get(k) ?? 0) + 1);
  });
  const comTexto = paginas.filter((p) => p.length).length;
  const minimo = Math.max(2, Math.ceil(comTexto * 0.6));
  let removidas = 0;
  paginas.forEach((ls, i) => {
    const m = margens[i];
    const ficam = ls.filter((l) => {
      if (!m.has(l)) return true;
      const t = l.texto.trim();
      const repetida = comTexto >= 2 && (conta.get(chaveRepetida(t)) ?? 0) >= minimo && l.tamanho < corpo * 1.15;
      const sai = repetida || RE_NUMERO_PAGINA.test(t);
      if (sai) removidas++;
      return !sai;
    });
    paginas[i] = ficam;
  });
  return removidas;
}

/* ------------------------------------------------------------------ tamanhos e títulos */

function tamanhoDoCorpo(paginas: LinhaMd[][]): number {
  const conta = new Map<number, number>();
  for (const ls of paginas) for (const l of ls) for (const t of l.trechos) {
    const k = Math.round(t.altura * 2) / 2;
    conta.set(k, (conta.get(k) ?? 0) + t.texto.length);
  }
  let melhor = 0, max = -1;
  for (const [k, v] of conta) if (v > max || (v === max && k < melhor)) { melhor = k; max = v; }
  return melhor || 10;
}

/** Tamanhos de título, do maior para o menor (no máximo 3 níveis; tamanhos parecidos contam como um só). */
function tamanhosDeTitulo(paginas: LinhaMd[][], corpo: number): number[] {
  const tamanhos = new Set<number>();
  for (const ls of paginas) for (const l of ls) {
    if (l.tamanho >= corpo * 1.15 && /\p{L}/u.test(l.texto) && l.texto.length <= 200) tamanhos.add(l.tamanho);
  }
  const ord = [...tamanhos].sort((a, b) => b - a);
  const grupos: number[] = [];
  for (const t of ord) if (!grupos.length || grupos[grupos.length - 1] - t > 1) grupos.push(t);
  return grupos;
}

/* ------------------------------------------------------------------ listas */

const BALAS = '•◦▪▫‣●○■□►▸▹➢➤✓✔·';
const RE_BALA_SIMBOLO = new RegExp(`^[${BALAS}]\\s*`);
const RE_BALA_TRACO = /^[-–—*]\s+/;
const RE_NUMERO = /^(?:\(?(\d{1,3})[.)]|\(?([a-z])[.)]|\(?([A-Z])\))\s+/;
const RE_SO_MARCADOR = new RegExp(`^(?:[${BALAS}]|[-–—*]|\\(?\\d{1,3}[.)]|\\(?[a-zA-Z][.)])$`);

interface Marcador { ordenada: boolean; numero: number; tamanho: number; letra: boolean; }

function marcadorDe(texto: string): Marcador | null {
  const t = texto.trimStart();
  let m = t.match(RE_BALA_SIMBOLO) ?? t.match(RE_BALA_TRACO);
  if (m && t.length > m[0].length) return { ordenada: false, numero: 0, letra: false, tamanho: m[0].length + (texto.length - t.length) };
  m = t.match(RE_NUMERO);
  if (m && t.length > m[0].length) {
    const numero = m[1] ? Number(m[1]) : (m[2] ?? m[3]).toLowerCase().charCodeAt(0) - 96;
    return { ordenada: true, numero, letra: !m[1], tamanho: m[0].length + (texto.length - t.length) };
  }
  return null;
}

/** Tira os primeiros `n` caracteres do texto da linha (o marcador), trecho por trecho. */
function cortarInicio(trechos: Trecho[], n: number): Trecho[] {
  const r: Trecho[] = [];
  let falta = n;
  trechos.forEach((t, i) => {
    let texto = t.texto;
    let espaco = t.espaco;
    if (falta > 0) {
      if (i > 0 && espaco) { falta--; espaco = false; }
      const tira = Math.min(falta, texto.length);
      texto = texto.slice(tira);
      falta -= tira;
      if (!texto.trim()) return;
      if (texto !== texto.trimStart()) texto = texto.trimStart();
    }
    r.push({ ...t, texto, espaco: r.length ? espaco : false });
  });
  return r;
}

/* ------------------------------------------------------------------ tabelas */

function celulasDaLinha(l: LinhaMd): Trecho[][] | null {
  const cel: Trecho[][] = [[l.trechos[0]]];
  for (let i = 1; i < l.trechos.length; i++) {
    const t = l.trechos[i], ant = l.trechos[i - 1];
    const vao = t.x - ant.fimX;
    if (vao < -l.tamanho * 0.5) return null;
    if (vao > Math.max(l.tamanho * 0.9, 4)) cel.push([t]);
    else cel[cel.length - 1].push(t);
  }
  return cel;
}

const inicioCel = (c: Trecho[]) => c[0].x;
const fimCel = (c: Trecho[]) => Math.max(...c.map((t) => t.fimX));
const juntos = (v: number[], tol: number) => Math.max(...v) - Math.min(...v) <= tol;

/** Confere se as linhas formam uma grade: cada coluna alinhada (esquerda, direita ou centro) e sem invadir a vizinha. */
function formaTabela(linhas: Trecho[][][], corpo: number): boolean {
  const k = linhas[0].length;
  if (linhas.length < (k >= 3 ? 2 : 3)) return false;
  const tol = Math.max(3, corpo * 0.5);
  const dados = linhas.length >= 3 ? linhas.slice(1) : linhas;
  for (let c = 0; c < k; c++) {
    const ini = dados.map((l) => inicioCel(l[c]));
    const fim = dados.map((l) => fimCel(l[c]));
    const meio = ini.map((v, i) => (v + fim[i]) / 2);
    if (!(juntos(ini, tol) || juntos(fim, tol) || juntos(meio, tol))) return false;
    // O cabeçalho pode ter outro alinhamento, mas precisa estar sobre a coluna.
    const h = linhas[0][c];
    if (fimCel(h) < Math.min(...ini) - tol || inicioCel(h) > Math.max(...fim) + tol) return false;
    if (c < k - 1) {
      const maxFim = Math.max(...linhas.map((l) => fimCel(l[c])));
      const minIni = Math.min(...linhas.map((l) => inicioCel(l[c + 1])));
      if (maxFim > minIni + 1) return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ blocos */

interface ItemLista { nivel: number; ordenada: boolean; numero: number; letra: boolean; x: number; linhas: Trecho[][]; }

type Bloco =
  | { tipo: 'titulo'; nivel: number; linhas: Trecho[][] }
  | { tipo: 'par'; linhas: Trecho[][]; tamanho: number }
  | { tipo: 'lista'; itens: ItemLista[] }
  | { tipo: 'tabela'; linhas: Trecho[][][] }
  | { tipo: 'pagina'; numero: number };

function percentil(v: number[], p: number): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(p * (s.length - 1))];
}

const TERMINA_FRASE = /[.!?:;…]["'”’)\]]*$/;

/** Monta os blocos de uma página: títulos, parágrafos, listas e tabelas, na ordem em que aparecem. */
function blocosDaPagina(linhas: LinhaMd[], corpo: number, niveis: number[]): Bloco[] {
  const nivelTitulo = (l: LinhaMd) => {
    if (l.tamanho < corpo * 1.15 || !/\p{L}/u.test(l.texto)) return 0;
    let n = niveis.findIndex((t) => l.tamanho >= t - 1);
    if (n < 0) n = niveis.length - 1;
    return Math.min(3, n + 1);
  };

  // 1. Tabelas: sequências de linhas com as mesmas colunas.
  const celulas = linhas.map((l) => {
    const c = celulasDaLinha(l);
    if (!c || c.length < 2 || RE_SO_MARCADOR.test(textoDaLinha(c[0]))) return null;
    return c;
  });
  const tabelaEm = new Map<number, { fim: number; linhas: Trecho[][][] }>();
  for (let i = 0; i < linhas.length; i++) {
    const c0 = celulas[i];
    if (!c0) continue;
    let j = i + 1;
    while (j < linhas.length) {
      const c = celulas[j];
      const v = linhas[j - 1].y - linhas[j].y;
      if (!c || c.length !== c0.length || v <= 0 || v > Math.max(linhas[j].tamanho, linhas[j - 1].tamanho) * 3) break;
      j++;
    }
    const grade = celulas.slice(i, j) as Trecho[][][];
    if (j - i >= 2 && formaTabela(grade, corpo)) {
      tabelaEm.set(i, { fim: j, linhas: grade });
      i = j - 1;
    }
  }

  // 2. Espaço normal entre linhas, em proporção ao tamanho da letra.
  const vaos: number[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const alt = Math.max(linhas[i].tamanho, linhas[i - 1].tamanho);
    const v = (linhas[i - 1].y - linhas[i].y) / alt;
    if (v > 0.3 && v < 3) vaos.push(v);
  }
  // Um percentil baixo, e não a média: entre parágrafos o espaço é maior, e eles não podem puxar o "normal" para cima.
  const normal = percentil(vaos, 0.3);
  const negrito = (l: LinhaMd) => (l.trechos.every((t) => t.negrito) ? 2 : l.trechos.some((t) => t.negrito) ? 1 : 0);
  const quebra = (a: LinhaMd, b: LinhaMd) => {
    const alt = Math.max(a.tamanho, b.tamanho);
    const v = (a.y - b.y) / alt;
    if (v < 0.3) return true; // subiu na página (outra coluna) ou ficou na mesma altura
    // Linha toda em negrito colada em linha sem negrito nenhum: provável subtítulo, fica separado.
    if (Math.abs(negrito(a) - negrito(b)) === 2) return true;
    return normal > 0 ? v > normal * 1.45 : v > 1.9;
  };

  // 3. Títulos, listas e parágrafos.
  const blocos: Bloco[] = [];
  let ant: LinhaMd | null = null;
  let atual: Bloco | null = null;
  let nivelAtual = 0;
  const pilha: { x: number }[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const tab = tabelaEm.get(i);
    if (tab) {
      blocos.push({ tipo: 'tabela', linhas: tab.linhas });
      atual = null; ant = null; i = tab.fim - 1;
      continue;
    }
    const l = linhas[i];
    const nivel = nivelTitulo(l);
    const quebrou = !ant || quebra(ant, l);
    const marc = nivel === 0 ? marcadorDe(l.texto) : null;
    const mudouTamanho = !ant || nivelTitulo(ant) !== nivel || Math.abs(ant.tamanho - l.tamanho) > 1;
    const podeSerLista = marc && (quebrou || mudouTamanho || atual?.tipo === 'lista' || TERMINA_FRASE.test(ant!.texto) || Math.abs(l.x - ant!.x) > 2);
    if (marc && podeSerLista) {
      if (atual?.tipo !== 'lista') { atual = { tipo: 'lista', itens: [] }; blocos.push(atual); pilha.length = 0; }
      while (pilha.length && pilha[pilha.length - 1].x > l.x + 3) pilha.pop();
      if (!pilha.length || l.x > pilha[pilha.length - 1].x + 3) pilha.push({ x: l.x });
      const trechos = cortarInicio(l.trechos, marc.tamanho);
      atual.itens.push({
        nivel: pilha.length - 1, ordenada: marc.ordenada, numero: marc.numero,
        letra: marc.letra, x: l.x, linhas: [trechos],
      });
    } else if (atual?.tipo === 'lista' && !quebrou && nivel === 0 && l.x > atual.itens[atual.itens.length - 1].x + 1) {
      atual.itens[atual.itens.length - 1].linhas.push(l.trechos);
    } else if (atual && (atual.tipo === 'par' || atual.tipo === 'titulo') && !quebrou && nivel === nivelAtual
      && (nivel > 0 || Math.abs(l.tamanho - (atual as { tamanho: number }).tamanho) <= 1)) {
      atual.linhas.push(l.trechos);
    } else {
      atual = nivel > 0 ? { tipo: 'titulo', nivel, linhas: [l.trechos] } : { tipo: 'par', linhas: [l.trechos], tamanho: l.tamanho };
      blocos.push(atual);
    }
    nivelAtual = nivel;
    ant = l;
  }
  // Título comprido demais é, na verdade, texto em letra grande.
  return blocos.map((b) => {
    if (b.tipo === 'titulo' && (b.linhas.length > 3 || b.linhas.map(textoDaLinha).join(' ').length > 200)) {
      return { tipo: 'par', linhas: b.linhas, tamanho: corpo };
    }
    return b;
  });
}

/* ------------------------------------------------------------------ escrita do Markdown */

interface Run { texto: string; negrito: boolean; italico: boolean; url?: string; }

/** Junta as linhas de um bloco num texto corrido, desfazendo a hifenização ("compu-" + "tador"). */
function runsDasLinhas(linhas: Trecho[][]): Run[] {
  const runs: Run[] = [];
  for (const linha of linhas) {
    linha.forEach((t, i) => {
      let prefixo = i > 0 && t.espaco ? ' ' : '';
      if (i === 0 && runs.length) {
        const ult = runs[runs.length - 1];
        if (/\p{L}-$/u.test(ult.texto) && /^\p{Ll}/u.test(t.texto)) ult.texto = ult.texto.slice(0, -1);
        else prefixo = ' ';
      }
      runs.push({ texto: prefixo + t.texto, negrito: t.negrito, italico: t.italico, url: t.url });
    });
  }
  return runs;
}

const RE_ENDERECO = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+|\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b/g;

function escaparTexto(t: string): string {
  return t
    .replace(/[\\`*[\]<]/g, '\\$&')
    .replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, '\\_');
}

function destinoLink(url: string): string {
  return url.replace(/[ ()<>]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** Escapa o texto e transforma endereços e e-mails escritos no texto em links. */
function escaparComAutolinks(t: string, autolink: boolean): string {
  if (!autolink) return escaparTexto(t);
  let r = '', ini = 0;
  for (const m of t.matchAll(RE_ENDERECO)) {
    let end = m[0];
    // Pontuação no fim normalmente é da frase, não do endereço.
    while (/[.,;:!?)\]}'"”’]$/.test(end)) {
      if (end.endsWith(')') && (end.match(/\(/g)?.length ?? 0) >= (end.match(/\)/g)?.length ?? 0)) break;
      end = end.slice(0, -1);
    }
    if (!end || end.length < 5) continue;
    r += escaparTexto(t.slice(ini, m.index));
    if (end.includes('@') && !/^(https?:|www\.)/i.test(end)) r += `<${end}>`;
    else if (/^www\./i.test(end)) r += `[${escaparTexto(end)}](https://${destinoLink(end)})`;
    else r += `<${end}>`;
    ini = m.index! + end.length;
  }
  return r + escaparTexto(t.slice(ini));
}

/** Escreve trechos com negrito e itálico, juntando trechos vizinhos do mesmo estilo e sem marcadores vazios. */
function escreverEstilos(runs: Run[], estilo: boolean, autolink: boolean): string {
  let out = '', pend = '';
  const abertos: string[] = [];
  for (const r of runs) {
    const m = r.texto.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
    pend += m[1] ? ' ' : '';
    const nucleo = m[2];
    if (!nucleo) { pend = pend || (m[3] ? ' ' : ''); continue; }
    const quer: string[] = [];
    if (estilo && r.negrito) quer.push('**');
    if (estilo && r.italico) quer.push('*');
    const k = abertos.findIndex((a) => !quer.includes(a));
    if (k >= 0) while (abertos.length > k) out += abertos.pop();
    out += pend.slice(0, 1);
    pend = '';
    for (const q of quer) if (!abertos.includes(q)) { out += q; abertos.push(q); }
    out += escaparComAutolinks(nucleo, autolink);
    pend = m[3] ? ' ' : '';
  }
  while (abertos.length) out += abertos.pop();
  return out + pend;
}

/** Escreve um texto corrido com estilos e links. */
function escreverInline(runs: Run[], estilo: boolean, contar?: { links: number }): string {
  let out = '';
  for (let i = 0; i < runs.length;) {
    const url = runs[i].url;
    let j = i + 1;
    while (j < runs.length && runs[j].url === url) j++;
    const grupo = runs.slice(i, j);
    if (!url) {
      out += escreverEstilos(grupo, estilo, true);
    } else {
      const simples = grupo.map((r) => r.texto).join('');
      const antes = /^\s/.test(simples) ? ' ' : '', depois = /\s$/.test(simples) ? ' ' : '';
      const limpo = simples.trim();
      const semEsquema = url.replace(/^mailto:/i, '').replace(/\/$/, '');
      if (contar) contar.links++;
      if (limpo === url || (/^mailto:/i.test(url) && limpo === semEsquema)) {
        out += `${antes}<${url.replace(/[<> ]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}>${depois}`;
      } else {
        const dentro = escreverEstilos(grupo, estilo, false).trim();
        out += `${antes}[${dentro}](${destinoLink(url)})${depois}`;
      }
    }
    i = j;
  }
  return out.replace(/ {2,}/g, ' ').trim();
}

/** Evita que o começo de um parágrafo vire outra coisa no Markdown (título, lista, citação, linha). */
function escaparInicio(s: string): string {
  if (/^#{1,6}(\s|$)/.test(s) || /^>/.test(s) || /^[-+](\s|$)/.test(s)) return '\\' + s;
  if (/^([-*_=])(\s*\1){2,}\s*$/.test(s)) return '\\' + s;
  if (/^\d{1,9}[.)](\s|$)/.test(s)) return s.replace(/^(\d+)([.)])/, '$1\\$2');
  return s;
}

const todoNegrito = (linhas: Trecho[][]) => linhas.every((l) => l.every((t) => t.negrito));

function escreverBloco(b: Bloco, contar: { links: number }): string {
  switch (b.tipo) {
    case 'pagina': return `<!-- página ${b.numero} -->`;
    case 'titulo': return '#'.repeat(b.nivel) + ' ' + escreverInline(runsDasLinhas(b.linhas), false, contar);
    case 'par': return escaparInicio(escreverInline(runsDasLinhas(b.linhas), true, contar));
    case 'lista': {
      const linhas: string[] = [];
      const recuos: string[] = [''];
      const larguras: number[] = [];
      const contagem: number[] = [];
      let nivelAnt = -1;
      for (const it of b.itens) {
        const n = Math.min(it.nivel, nivelAnt + 1);
        recuos.length = n + 1;
        contagem.length = n + 1;
        if (n > 0 && recuos[n] === undefined) recuos[n] = recuos[n - 1] + ' '.repeat(larguras[n - 1] ?? 2);
        if (recuos[n] === undefined) recuos[n] = '';
        contagem[n] = (n > nivelAnt || contagem[n] === undefined ? 0 : contagem[n]) + 1;
        const marcador = it.ordenada ? `${it.letra ? contagem[n] : it.numero}. ` : '- ';
        larguras[n] = marcador.length;
        const texto = escaparInicio(escreverInline(runsDasLinhas(it.linhas), true, contar));
        linhas.push(recuos[n] + marcador + texto);
        nivelAnt = n;
      }
      return linhas.join('\n');
    }
    case 'tabela': {
      const k = b.linhas[0].length;
      const semNegritoNoTopo = b.linhas[0].every((c) => todoNegrito([c]));
      const linhas = b.linhas.map((cels, i) => '| ' + cels.map((c) => {
        const runs = runsDasLinhas([c]);
        return escreverInline(runs, !(i === 0 && semNegritoNoTopo), contar).replace(/\|/g, '\\|');
      }).join(' | ') + ' |');
      linhas.splice(1, 0, '|' + ' --- |'.repeat(k));
      return linhas.join('\n');
    }
  }
}

/* ------------------------------------------------------------------ documento */

/** Converte as páginas em Markdown e conta o que foi reconhecido. */
export function converterParaMarkdown(paginas: PaginaMd[], opcoes: OpcoesMarkdown = {}): { markdown: string; resumo: ResumoMarkdown } {
  const limpar = opcoes.limparRepetidos !== false;
  const linhasPorPagina = paginas.map((p) => {
    const links = p.links ?? [];
    return montarLinhas(p.itens.flatMap((it) => dividirPorLinks(it, links)));
  });
  let corpo = tamanhoDoCorpo(linhasPorPagina);
  let removidas = 0;
  if (limpar) {
    removidas = limparMargens(linhasPorPagina, paginas, corpo);
    corpo = tamanhoDoCorpo(linhasPorPagina);
  }
  const escolhidas = (opcoes.paginas?.length ? opcoes.paginas : paginas.map((_, i) => i + 1))
    .filter((n) => n >= 1 && n <= paginas.length);
  // Níveis de título calculados com o documento todo, para não mudarem quando só algumas páginas são escolhidas.
  const niveis = tamanhosDeTitulo(linhasPorPagina, corpo);

  // Blocos de todas as páginas; parágrafo cortado na virada de página volta a ficar inteiro.
  const blocos: Bloco[] = [];
  escolhidas.forEach((n) => {
    const doPagina = blocosDaPagina(linhasPorPagina[n - 1], corpo, niveis);
    if (opcoes.separarPaginas) blocos.push({ tipo: 'pagina', numero: n });
    else {
      const ult = blocos[blocos.length - 1], pri = doPagina[0];
      if (ult?.tipo === 'par' && pri?.tipo === 'par') {
        const fim = textoDaLinha(ult.linhas[ult.linhas.length - 1]);
        const inicio = textoDaLinha(pri.linhas[0]);
        if (!TERMINA_FRASE.test(fim) && /^\p{Ll}/u.test(inicio)) { ult.linhas.push(...pri.linhas); doPagina.shift(); }
      }
    }
    blocos.push(...doPagina);
  });

  // Linha curta e solta, toda em negrito, sem pontuação no fim: provavelmente um subtítulo.
  const nivelNegrito = niveis.length ? Math.min(3, niveis.length + 1) : 2;
  const candidato = (b: Bloco | undefined) => {
    if (b?.tipo !== 'par' || b.linhas.length > 2 || !todoNegrito(b.linhas)) return false;
    const t = b.linhas.map(textoDaLinha).join(' ').trim();
    return t.length <= 100 && t.split(/\s+/).length <= 14 && /\p{L}/u.test(t) && !/[.,;:!?…]$/.test(t) && !marcadorDe(t);
  };
  const marcados = blocos.map((b, i) => candidato(b) && !candidato(blocos[i - 1]) && !candidato(blocos[i + 1]) && i < blocos.length - 1);
  const finais: Bloco[] = blocos.map((b, i) => (marcados[i] ? { tipo: 'titulo', nivel: nivelNegrito, linhas: (b as { linhas: Trecho[][] }).linhas } : b));

  const contar = { links: 0 };
  const partes: string[] = [];
  for (const b of finais) {
    if (b.tipo === 'pagina' && partes.length) partes.push('---');
    const s = escreverBloco(b, contar);
    if (s.trim()) partes.push(s);
  }
  const resumo: ResumoMarkdown = {
    titulos: finais.filter((b) => b.tipo === 'titulo').length,
    listas: finais.filter((b) => b.tipo === 'lista').length,
    tabelas: finais.filter((b) => b.tipo === 'tabela').length,
    links: contar.links,
    removidas,
  };
  return { markdown: partes.length ? partes.join('\n\n') + '\n' : '', resumo };
}

/** Atalho: só o texto em Markdown. */
export function pdfParaMarkdown(paginas: PaginaMd[], opcoes: OpcoesMarkdown = {}): string {
  return converterParaMarkdown(paginas, opcoes).markdown;
}
