// Funções puras do "Comparar PDF": montar o texto de cada página a partir dos pedaços que o
// pdf.js entrega, separar em palavras, comparar e agrupar as diferenças por página.
import { diferencas, type TipoTrecho, type Trecho } from './diff';

/** Pedaço de texto como o pdf.js entrega (já simplificado): posição na página e tamanho. */
export interface PedacoTexto {
  str: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** O pdf.js marca fim de linha. */
  fimDeLinha?: boolean;
}

/**
 * Junta os pedaços de uma página num texto só. Põe espaço quando muda de linha ou quando há
 * um vão entre um pedaço e o próximo (muitos PDFs guardam cada palavra, ou até cada letra, separada).
 */
export function textoDaPagina(pedacos: readonly PedacoTexto[]): string {
  let texto = '';
  let fimX = 0, ultimoY = 0, ultimaAltura = 0, temAnterior = false;
  for (const p of pedacos) {
    if (!p.str) { if (p.fimDeLinha) texto += ' '; continue; }
    if (temAnterior) {
      const altura = Math.max(p.altura, ultimaAltura, 1);
      const outraLinha = Math.abs(p.y - ultimoY) > altura * 0.5;
      const vao = p.x - fimX > altura * 0.15;
      if ((outraLinha || vao || p.x < fimX - altura) && !/\s$/.test(texto)) texto += ' ';
    }
    texto += p.str;
    if (p.fimDeLinha) texto += ' ';
    fimX = p.x + p.largura; ultimoY = p.y; ultimaAltura = p.altura; temAnterior = true;
  }
  return texto;
}

export interface Palavra {
  texto: string;
  /** Versão usada na comparação (sem diferenças invisíveis, como ligaduras "ﬁ"). */
  chave: string;
  /** Página de onde a palavra veio (começa em 1). */
  pagina: number;
}

export function palavras(paginas: readonly string[], ignorarCaixa = false): Palavra[] {
  const lista: Palavra[] = [];
  paginas.forEach((t, i) => {
    for (const w of t.split(/\s+/)) {
      if (!w) continue;
      let chave = w.normalize('NFKC');
      if (ignorarCaixa) chave = chave.toLocaleLowerCase('pt-BR');
      lista.push({ texto: w, chave, pagina: i + 1 });
    }
  });
  return lista;
}

export interface Pedaco { tipo: TipoTrecho; texto: string; palavras: number; }

export interface PaginaComparada {
  /** Página no PDF novo (ou no original, quando o novo não tem páginas com texto depois deste ponto). */
  pagina: number;
  /** Páginas do original que aparecem nesta página (para mostrar "era a página X"). */
  paginasOriginal: number[];
  pedacos: Pedaco[];
  adicionadas: number;
  removidas: number;
}

export interface Comparacao {
  paginas: PaginaComparada[];
  adicionadas: number;
  removidas: number;
  /** true quando foi preciso comparar página a página porque os textos mudaram demais. */
  porPagina: boolean;
}

/**
 * Compara as páginas de A (original) com as de B (novo).
 * Primeiro tenta o documento inteiro, que acerta mesmo quando entram ou saem páginas.
 * Se houver mudanças demais, compara página 1 com 1, 2 com 2 e assim por diante.
 */
export function compararPaginas(paginasA: readonly string[], paginasB: readonly string[], ignorarCaixa = false, limite = 4000): Comparacao {
  const a = palavras(paginasA, ignorarCaixa);
  const b = palavras(paginasB, ignorarCaixa);
  const igual = (x: Palavra, y: Palavra) => x.chave === y.chave;
  const total = diferencas(a, b, igual, limite);
  if (total) return montar(a, b, total, paginasB.length, false);

  // Mudanças demais: página a página. Página que mudou demais aparece toda removida e toda adicionada.
  const resultado: Comparacao = { paginas: [], adicionadas: 0, removidas: 0, porPagina: true };
  const n = Math.max(paginasA.length, paginasB.length);
  for (let i = 0; i < n; i++) {
    const pa = palavras([paginasA[i] ?? ''], ignorarCaixa).map((p) => ({ ...p, pagina: i + 1 }));
    const pb = palavras([paginasB[i] ?? ''], ignorarCaixa).map((p) => ({ ...p, pagina: i + 1 }));
    const t = diferencas(pa, pb, igual, Math.max(200, Math.floor(limite / 2))) ?? [
      ...(pa.length ? [{ tipo: 'removido' as const, a: [0, pa.length] as [number, number], b: [0, 0] as [number, number] }] : []),
      ...(pb.length ? [{ tipo: 'adicionado' as const, a: [pa.length, pa.length] as [number, number], b: [0, pb.length] as [number, number] }] : []),
    ];
    const parcial = montar(pa, pb, t, i + 1, false);
    const pagina: PaginaComparada = { pagina: i + 1, paginasOriginal: paginasA[i] !== undefined ? [i + 1] : [], pedacos: [], adicionadas: 0, removidas: 0 };
    for (const p of parcial.paginas) {
      pagina.pedacos.push(...p.pedacos); pagina.adicionadas += p.adicionadas; pagina.removidas += p.removidas;
    }
    resultado.paginas.push(pagina);
    resultado.adicionadas += pagina.adicionadas;
    resultado.removidas += pagina.removidas;
  }
  return resultado;
}

function montar(a: Palavra[], b: Palavra[], trechos: Trecho[], totalPaginasB: number, porPagina: boolean): Comparacao {
  const mapa = new Map<number, PaginaComparada>();
  const pagina = (n: number) => {
    let p = mapa.get(n);
    if (!p) { p = { pagina: n, paginasOriginal: [], pedacos: [], adicionadas: 0, removidas: 0 }; mapa.set(n, p); }
    return p;
  };
  // Todas as páginas do novo aparecem, mesmo sem texto.
  for (let i = 1; i <= totalPaginasB; i++) pagina(i);
  const ultimaB = Math.max(1, totalPaginasB);

  const por = (pg: PaginaComparada, tipo: TipoTrecho, w: Palavra) => {
    const ult = pg.pedacos[pg.pedacos.length - 1];
    if (ult && ult.tipo === tipo) { ult.texto += ' ' + w.texto; ult.palavras++; }
    else pg.pedacos.push({ tipo, texto: w.texto, palavras: 1 });
    if (tipo === 'adicionado') pg.adicionadas++;
    if (tipo === 'removido') pg.removidas++;
  };
  const marcarOriginal = (pg: PaginaComparada, n: number) => { if (!pg.paginasOriginal.includes(n)) pg.paginasOriginal.push(n); };

  for (const t of trechos) {
    if (t.tipo === 'removido') {
      // O que saiu fica na página do novo onde estaria: a da próxima palavra (ou da anterior, no fim).
      const ref = b[t.b[0]] ?? b[t.b[0] - 1];
      const pg = pagina(ref ? ref.pagina : Math.min(a[t.a[0]].pagina, ultimaB));
      for (let i = t.a[0]; i < t.a[1]; i++) { por(pg, 'removido', a[i]); marcarOriginal(pg, a[i].pagina); }
    } else {
      for (let i = t.b[0]; i < t.b[1]; i++) {
        const pg = pagina(b[i].pagina);
        por(pg, t.tipo, b[i]);
        if (t.tipo === 'igual') marcarOriginal(pg, a[t.a[0] + (i - t.b[0])].pagina);
      }
    }
  }
  const paginas = [...mapa.values()].sort((x, y) => x.pagina - y.pagina);
  for (const p of paginas) p.paginasOriginal.sort((x, y) => x - y);
  return {
    paginas,
    adicionadas: paginas.reduce((s, p) => s + p.adicionadas, 0),
    removidas: paginas.reduce((s, p) => s + p.removidas, 0),
    porPagina,
  };
}

/** Pedaço já pronto para mostrar: os trechos iguais longos viram "começo … fim". */
export interface PedacoVisivel { tipo: TipoTrecho | 'corte'; texto: string; }

/**
 * Encurta os trechos iguais, deixando `contexto` palavras perto de cada mudança.
 * O que foi escondido vira um pedaço "corte" com a quantidade de palavras.
 */
export function resumirPedacos(pedacos: readonly Pedaco[], contexto = 8): PedacoVisivel[] {
  const saida: PedacoVisivel[] = [];
  pedacos.forEach((p, i) => {
    if (p.tipo !== 'igual') { saida.push({ tipo: p.tipo, texto: p.texto }); return; }
    const ws = p.texto.split(' ');
    const antes = i > 0 ? contexto : 0; // palavras mostradas no começo (depois de uma mudança)
    const depois = i < pedacos.length - 1 ? contexto : 0; // palavras mostradas no fim (antes de uma mudança)
    if (ws.length <= antes + depois + 3) { saida.push({ tipo: 'igual', texto: p.texto }); return; }
    if (antes) saida.push({ tipo: 'igual', texto: ws.slice(0, antes).join(' ') });
    const escondidas = ws.length - antes - depois;
    saida.push({ tipo: 'corte', texto: `${escondidas.toLocaleString('pt-BR')} ${escondidas === 1 ? 'palavra igual' : 'palavras iguais'}` });
    if (depois) saida.push({ tipo: 'igual', texto: ws.slice(ws.length - depois).join(' ') });
  });
  return saida;
}

/** "1, 3-5, 8": lista curta de páginas. */
export function listarPaginas(nums: readonly number[]): string {
  const ord = [...new Set(nums)].sort((x, y) => x - y);
  const partes: string[] = [];
  for (let i = 0; i < ord.length; i++) {
    let j = i;
    while (j + 1 < ord.length && ord[j + 1] === ord[j] + 1) j++;
    partes.push(j > i + 1 ? `${ord[i]}-${ord[j]}` : j === i + 1 ? `${ord[i]}, ${ord[j]}` : `${ord[i]}`);
    i = j;
  }
  return partes.join(', ');
}
