/**
 * Localiza, no próprio documento, a linha de assinatura de cada signatário: a linha
 * em que o nome dele aparece sozinho (ex.: "MARIA DA SILVA" embaixo de "______").
 * O carimbo de assinatura é posto logo acima dela, além da página de assinaturas.
 */

/** Trecho de texto com posição em pontos (origem embaixo à esquerda, y = base do texto). */
export type TrechoDeTexto = { texto: string; x: number; y: number; largura: number; altura: number };
export type PaginaDeTexto = { largura: number; altura: number; trechos: TrechoDeTexto[] };

/** Área acima da linha de assinatura de um signatário, onde vai o carimbo. */
export type LinhaDeAssinatura = { signatario: number; pagina: number; x: number; y: number; largura: number; altura: number };

/** Extrai o texto posicionado de cada página (pdf.js no Node ou no navegador). */
export type LeitorDeTexto = (pdf: Uint8Array) => Promise<PaginaDeTexto[]>;

const LARGURA_CARIMBO = 270;
const ALTURA_CARIMBO = 40;

export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function encontrarLinhasDeAssinatura(paginas: PaginaDeTexto[], nomes: string[]): LinhaDeAssinatura[] {
  const resultado: LinhaDeAssinatura[] = [];
  nomes.forEach((nome, signatario) => {
    const alvo = normalizar(nome);
    if (!alvo) return;
    let achado: LinhaDeAssinatura | null = null;
    paginas.forEach((pagina, indicePagina) => {
      for (const linha of agruparEmLinhas(pagina.trechos)) {
        if (normalizar(linha.texto) !== alvo) continue;
        // Se há uma linha de sublinhados logo acima do nome, o carimbo vai acima dela
        const traco = pagina.trechos.find(
          (t) => /^_{5,}$/.test(t.texto.trim()) && t.y > linha.y && t.y - linha.y < 30,
        );
        const base = (traco ? traco.y + traco.altura : linha.y + linha.altura) + 2;
        const centro = linha.x + linha.largura / 2;
        const x = Math.min(Math.max(centro - LARGURA_CARIMBO / 2, 8), pagina.largura - LARGURA_CARIMBO - 8);
        // A última ocorrência costuma ser o bloco de assinatura (a primeira é a qualificação)
        achado = { signatario, pagina: indicePagina, x, y: base, largura: LARGURA_CARIMBO, altura: ALTURA_CARIMBO };
      }
    });
    if (achado) resultado.push(achado);
  });
  return resultado;
}

/** Junta trechos na mesma altura (o pdf.js costuma quebrar uma linha em vários pedaços). */
function agruparEmLinhas(trechos: TrechoDeTexto[]): TrechoDeTexto[] {
  const linhas: TrechoDeTexto[][] = [];
  for (const t of trechos.filter((t) => t.texto.trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
    const linha = linhas.find((l) => Math.abs(l[0]!.y - t.y) < 2);
    if (linha) linha.push(t);
    else linhas.push([t]);
  }
  return linhas.map((l) => {
    l.sort((a, b) => a.x - b.x);
    const fim = Math.max(...l.map((t) => t.x + t.largura));
    return {
      texto: l.map((t) => t.texto).join(" "),
      x: l[0]!.x,
      y: l[0]!.y,
      largura: fim - l[0]!.x,
      altura: Math.max(...l.map((t) => t.altura)),
    };
  });
}

/** Tipo mínimo do pdf.js usado aqui, para servir tanto ao Node quanto ao navegador. */
export type PdfJs = {
  getDocument(src: { data: Uint8Array; isEvalSupported?: boolean; useSystemFonts?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getViewport(o: { scale: number }): { width: number; height: number };
        getTextContent(): Promise<{ items: unknown[] }>;
      }>;
    }>;
  };
};

export function criarLeitorDeTexto(pdfjs: PdfJs): LeitorDeTexto {
  return async (pdf) => {
    const doc = await pdfjs.getDocument({ data: pdf.slice(), isEvalSupported: false }).promise;
    const paginas: PaginaDeTexto[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const { width, height } = pagina.getViewport({ scale: 1 });
      const conteudo = await pagina.getTextContent();
      const trechos = (conteudo.items as { str?: string; transform?: number[]; width?: number; height?: number }[])
        .filter((i) => i.str && i.transform)
        .map((i) => ({
          texto: i.str!,
          x: i.transform![4]!,
          y: i.transform![5]!,
          largura: i.width ?? 0,
          altura: i.height || Math.abs(i.transform![3]!),
        }));
      paginas.push({ largura: width, altura: height, trechos });
    }
    return paginas;
  };
}
