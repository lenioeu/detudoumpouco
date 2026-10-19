// Contas do "Ajustar PDF para A4": nome do tamanho de cada página e a escala para caber no A4.
// Funções puras, em pontos (1 pt = 1/72 de polegada).
import { PAGINAS } from './pdf-pagina';
import { normalizarRotacao, ptParaMm, type Caixa } from './pdf-visual';

export const [A4_CURTO, A4_LONGO] = PAGINAS.a4;

const CONHECIDOS: { nome: string; curto: number; longo: number }[] = [
  { nome: 'A4', curto: 595.28, longo: 841.89 },
  { nome: 'A3', curto: 841.89, longo: 1190.55 },
  { nome: 'A5', curto: 419.53, longo: 595.28 },
  { nome: 'Carta', curto: 612, longo: 792 },
  { nome: 'Ofício (Legal)', curto: 612, longo: 1008 },
  { nome: 'Ofício', curto: 609.45, longo: 935.43 },
  { nome: 'Tabloide', curto: 792, longo: 1224 },
];

/** "A4", "Carta", "A3"... ou as medidas em cm, como "15 x 21 cm". Tolerância de 3 pontos (1 mm). */
export function nomeDoTamanho(largura: number, altura: number): string {
  const curto = Math.min(largura, altura), longo = Math.max(largura, altura);
  const achado = CONHECIDOS.find((t) => Math.abs(t.curto - curto) <= 3 && Math.abs(t.longo - longo) <= 3);
  if (achado) return achado.nome;
  const cm = (pt: number) => (Math.round(ptParaMm(pt)) / 10).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${cm(largura)} x ${cm(altura)} cm`;
}

export type OrientacaoA4 = 'auto' | 'retrato' | 'paisagem';

export interface AjusteA4 {
  /** Nova MediaBox (no espaço do PDF, que pode estar girado em relação à tela). */
  largura: number;
  altura: number;
  /** Matriz que leva o conteúdo antigo para a página nova: x' = escala·x + dx; y' = escala·y + dy. */
  escala: number;
  dx: number;
  dy: number;
  /** Como fica na tela. */
  deitada: boolean;
}

/**
 * Como encaixar a página (área visível `caixa`, girada `rotacao`) numa folha A4, sem distorcer
 * e centralizada. Na orientação automática, página deitada vai para A4 deitado.
 * `ampliar` = false deixa páginas menores que o A4 no tamanho original (só centraliza).
 */
export function ajustarParaA4(caixa: Caixa, rotacao: number, orientacao: OrientacaoA4, margem: number, ampliar: boolean): AjusteA4 {
  const r = normalizarRotacao(rotacao);
  const girada = r === 90 || r === 270;
  const larguraTela = girada ? caixa.altura : caixa.largura;
  const alturaTela = girada ? caixa.largura : caixa.altura;
  const deitada = orientacao === 'paisagem' || (orientacao === 'auto' && larguraTela > alturaTela);
  const [lt, at] = deitada ? [A4_LONGO, A4_CURTO] : [A4_CURTO, A4_LONGO];
  // A rotação continua valendo na página nova, então a folha é montada no espaço do PDF.
  const [largura, altura] = girada ? [at, lt] : [lt, at];
  let escala = Math.min((largura - 2 * margem) / caixa.largura, (altura - 2 * margem) / caixa.altura);
  if (!ampliar) escala = Math.min(escala, 1);
  escala = Math.max(escala, 0.0001);
  const dx = (largura - caixa.largura * escala) / 2 - caixa.x * escala;
  const dy = (altura - caixa.altura * escala) / 2 - caixa.y * escala;
  return { largura, altura, escala, dx, dy, deitada };
}

/** A página já está em A4 na orientação certa (nada a fazer, se não há margem). */
export function jaEstaEmA4(caixa: Caixa, a: AjusteA4): boolean {
  return Math.abs(caixa.largura - a.largura) <= 1 && Math.abs(caixa.altura - a.altura) <= 1;
}
