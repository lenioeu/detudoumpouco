// Contas puras do "OCR em PDF": onde colocar cada palavra reconhecida como texto invisível
// por cima da imagem da página, para o PDF ficar pesquisável e o texto poder ser selecionado.
// Nada aqui depende do navegador nem do tesseract.js.

/** Retângulo em pixels da imagem reconhecida (origem no canto de cima, à esquerda). */
export interface Caixa { x0: number; y0: number; x1: number; y1: number; }

/** Uma linha como o tesseract devolve: as palavras e a linha de base (onde as letras "assentam"). */
export interface LinhaOcr {
  palavras: { texto: string; caixa: Caixa }[];
  base?: Caixa | null;
}

/** Converte um ponto da imagem (pixels) para o PDF (pontos, origem embaixo à esquerda). */
export type Converter = (x: number, y: number) => [number, number];

export interface Colocacao {
  texto: string;
  /** Matriz de texto do PDF (Tm): direção da linha, direção "para cima" e o ponto de início. */
  matriz: [number, number, number, number, number, number];
  /** Tamanho da fonte, em pontos. */
  tamanho: number;
  /** Largura que a palavra tem que ocupar, em pontos (para ajustar a largura da fonte). */
  largura: number;
}

/** Na Helvetica, as letras altas (como "d" e "l") têm cerca de 72% do tamanho da fonte. */
const ALTURA_ASCENDENTE = 0.72;

/**
 * Calcula a posição de cada palavra no PDF. A linha de base vem do tesseract; se faltar,
 * usa a parte de baixo das caixas. Funciona também com páginas giradas: a direção e o tamanho
 * saem do próprio `converter`.
 */
export function posicionarPalavras(linhas: readonly LinhaOcr[], converter: Converter): Colocacao[] {
  const saida: Colocacao[] = [];
  for (const linha of linhas) {
    const validas = linha.palavras.filter((p) => p.texto.trim() && p.caixa.x1 > p.caixa.x0 && p.caixa.y1 > p.caixa.y0);
    if (!validas.length) continue;
    const b = linha.base;
    const temBase = !!b && b.x1 !== b.x0;
    const baseEm = (x: number, caixa: Caixa) =>
      temBase ? b!.y0 + ((b!.y1 - b!.y0) * (x - b!.x0)) / (b!.x1 - b!.x0) : caixa.y1;
    // Altura das letras altas da linha: do topo da palavra mais alta até a linha de base.
    let ascendente = 0;
    for (const p of validas) ascendente = Math.max(ascendente, baseEm((p.caixa.x0 + p.caixa.x1) / 2, p.caixa) - p.caixa.y0);
    if (!(ascendente > 0)) ascendente = Math.max(...validas.map((p) => p.caixa.y1 - p.caixa.y0));
    const tamanhoPx = Math.max(1, ascendente / ALTURA_ASCENDENTE);

    for (const p of validas) {
      const { x0, x1 } = p.caixa;
      const y0 = baseEm(x0, p.caixa), y1 = baseEm(x1, p.caixa);
      const [ax, ay] = converter(x0, y0);
      const [bx, by] = converter(x1, y1);
      // "Para cima", perpendicular à linha de base (na imagem, para cima é y menor).
      const dx = x1 - x0, dy = y1 - y0, comp = Math.hypot(dx, dy) || 1;
      const [cx, cy] = converter(x0 + (dy / comp) * tamanhoPx, y0 - (dx / comp) * tamanhoPx);
      const largura = Math.hypot(bx - ax, by - ay);
      const tamanho = Math.hypot(cx - ax, cy - ay);
      if (!(largura > 0) || !(tamanho > 0)) continue;
      saida.push({
        texto: p.texto,
        matriz: [(bx - ax) / largura, (by - ay) / largura, (cx - ax) / tamanho, (cy - ay) / tamanho, ax, ay],
        tamanho,
        largura,
      });
    }
  }
  return saida;
}

/** Trocas para caracteres que a fonte padrão do PDF (WinAnsi) não tem. */
const TROCAS: Record<string, string> = { '−': '-', '‐': '-', '‑': '-', ' ': ' ', '′': "'", '″': '"' };

/**
 * Deixa só os caracteres que a fonte consegue escrever (`aceitos` = códigos Unicode da fonte).
 * Ligaduras viram letras separadas ("ﬁ" -> "fi"); o resto que não existe na fonte sai.
 */
export function limparParaFonte(texto: string, aceitos: ReadonlySet<number>): string {
  let saida = '';
  for (const ch of texto) {
    const c = TROCAS[ch] ?? ch;
    if (aceitos.has(c.codePointAt(0)!)) { saida += c; continue; }
    for (const parte of c.normalize('NFKC')) if (aceitos.has(parte.codePointAt(0)!)) saida += parte;
  }
  return saida.trim();
}

/** Texto final para copiar ou baixar: as páginas separadas por um título. */
export function juntarTexto(paginas: readonly { numero: number; texto: string }[]): string {
  if (paginas.length === 1) return paginas[0].texto.trim();
  return paginas.map((p) => `--- Página ${p.numero} ---\n\n${p.texto.trim()}`).join('\n\n');
}
