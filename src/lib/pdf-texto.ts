// Monta texto legível a partir dos pedaços que o pdf.js devolve em getTextContent().
// O PDF não guarda "linhas" nem "parágrafos": só pedaços de texto com posição na página.
// Aqui as linhas são reconstruídas pela altura (y) de cada pedaço e os parágrafos pelo
// espaço vertical entre as linhas. Funções puras, sem depender do navegador.

export interface PedacoTexto {
  str: string;
  /** Posição do início do pedaço, em pontos (y cresce para cima, como no PDF). */
  x: number;
  y: number;
  largura: number;
  /** Altura da letra, em pontos. */
  altura: number;
  /** O pdf.js marcou que a linha termina aqui. */
  fimDeLinha: boolean;
}

export interface Linha { texto: string; y: number; altura: number; }

/** Converte um item do pdf.js (TextItem) em PedacoTexto. Itens sem texto (marcações) viram null. */
export function pedacoDoPdfJs(item: unknown): PedacoTexto | null {
  const i = item as { str?: string; transform?: number[]; width?: number; height?: number; hasEOL?: boolean };
  if (typeof i.str !== 'string' || !i.transform) return null;
  const [, , c, d, e, f] = i.transform;
  const altura = i.height && i.height > 0 ? i.height : Math.hypot(c, d) || 10;
  return { str: i.str, x: e, y: f, largura: i.width ?? 0, altura, fimDeLinha: !!i.hasEOL };
}

/** Agrupa os pedaços em linhas, na ordem em que aparecem no arquivo (assim colunas não se misturam). */
export function montarLinhas(pedacos: PedacoTexto[]): Linha[] {
  const linhas: Linha[] = [];
  let atual: (Linha & { fimX: number; fechada: boolean }) | null = null;
  const fechar = () => {
    if (atual) {
      const texto = atual.texto.replace(/[ \t ]+$/, '');
      if (texto.trim()) linhas.push({ texto, y: atual.y, altura: atual.altura });
    }
    atual = null;
  };
  for (const p of pedacos) {
    const str = p.str.replace(/\u0000/g, '');
    if (str) {
      const mesmaLinha = atual && !atual.fechada && Math.abs(p.y - atual.y) <= Math.max(p.altura, atual.altura) * 0.5;
      if (!mesmaLinha) {
        fechar();
        atual = { texto: '', y: p.y, altura: p.altura, fimX: p.x, fechada: false };
      }
      const a = atual!;
      if (a.texto) {
        const vao = p.x - a.fimX;
        const temEspaco = /\s$/.test(a.texto) || /^\s/.test(str);
        if (!temEspaco && vao > Math.min(p.altura, a.altura) * 0.15) a.texto += ' ';
      }
      if (!(/^\s+$/.test(str) && (!a.texto || /\s$/.test(a.texto)))) a.texto += str;
      a.fimX = p.x + p.largura;
      a.altura = Math.max(a.altura, p.altura);
    }
    if (p.fimDeLinha && atual) (atual as { fechada: boolean }).fechada = true;
  }
  fechar();
  return linhas;
}

function mediana(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Separa as linhas em parágrafos: um espaço vertical bem maior que o normal começa um parágrafo novo. */
export function montarParagrafos(linhas: Linha[]): string[][] {
  if (!linhas.length) return [];
  const vaos: number[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const v = linhas[i - 1].y - linhas[i].y;
    if (v > 0 && v < linhas[i].altura * 3) vaos.push(v);
  }
  const normal = mediana(vaos);
  const paragrafos: string[][] = [[linhas[0].texto]];
  for (let i = 1; i < linhas.length; i++) {
    const v = linhas[i - 1].y - linhas[i].y;
    const alt = Math.max(linhas[i].altura, linhas[i - 1].altura);
    // Subiu na página (outra coluna) ou pulou bem mais que o espaço normal entre linhas.
    const novo = v <= -alt * 0.5 || (normal > 0 ? v > normal * 1.45 : v > alt * 1.9);
    if (novo) paragrafos.push([linhas[i].texto]);
    else paragrafos[paragrafos.length - 1].push(linhas[i].texto);
  }
  return paragrafos;
}

/** Junta as linhas de um parágrafo numa só, desfazendo a hifenização do fim da linha ("compu-" + "tador"). */
export function juntarLinhas(linhas: string[]): string {
  let r = '';
  for (const l of linhas.map((x) => x.trim())) {
    if (!r) r = l;
    else if (/\p{L}-$/u.test(r) && /^\p{Ll}/u.test(l)) r = r.slice(0, -1) + l;
    else r += ' ' + l;
  }
  return r;
}

export interface OpcoesTexto {
  /** Junta as linhas de cada parágrafo (bom para colar no Word). Sem isso, mantém as quebras do PDF. */
  juntar: boolean;
  /** Põe "--- Página N ---" antes de cada página. */
  marcarPaginas: boolean;
}

/** Texto de uma página a partir dos pedaços. */
export function textoDaPagina(pedacos: PedacoTexto[], juntar: boolean): string {
  const paragrafos = montarParagrafos(montarLinhas(pedacos));
  return paragrafos.map((p) => (juntar ? juntarLinhas(p) : p.join('\n'))).join('\n\n');
}

/** Junta as páginas num texto só. `paginas[i]` são os pedaços da página i + 1. */
export function textoDoDocumento(paginas: PedacoTexto[][], opcoes: OpcoesTexto): string {
  const partes: string[] = [];
  paginas.forEach((pedacos, i) => {
    const t = textoDaPagina(pedacos, opcoes.juntar);
    if (opcoes.marcarPaginas) partes.push(`--- Página ${i + 1} ---` + (t ? '\n\n' + t : ''));
    else if (t) partes.push(t);
  });
  return partes.join('\n\n') + (partes.length ? '\n' : '');
}

/** Números das páginas sem nenhum texto (provavelmente imagem ou escaneadas). */
export function paginasSemTexto(paginas: PedacoTexto[][]): number[] {
  const r: number[] = [];
  paginas.forEach((p, i) => { if (!p.some((x) => x.str.trim())) r.push(i + 1); });
  return r;
}

/** Quantidade de palavras, para mostrar ao lado do resultado. */
export function contarPalavras(texto: string): number {
  return (texto.match(/[\p{L}\p{N}]+(?:[-'’.,][\p{L}\p{N}]+)*/gu) ?? []).length;
}
