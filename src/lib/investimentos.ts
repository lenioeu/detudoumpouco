// Rendimento de poupança, CDB e Tesouro Selic. Taxas em porcentagem (13,75 = 13,75%), prazo em meses.
// Regras usadas (confira se mudaram antes de atualizar a página):
// - Poupança (Lei 12.703/2012): Selic meta acima de 8,5% a.a. → 0,5% a.m. + TR; senão, 70% da Selic + TR. Isenta de IR.
// - IR regressivo de renda fixa (Lei 11.033/2004, Receita Federal): 22,5% até 180 dias, 20% até 360,
//   17,5% até 720 e 15% acima disso, só sobre o rendimento.
// - Tesouro Selic: taxa de custódia da B3 sobre o saldo que passa do valor isento.

/** Faixas do IR regressivo: até `ateDias` dias corridos, alíquota `aliquota` em %. */
export const FAIXAS_IR = [
  { ateDias: 180, aliquota: 22.5 },
  { ateDias: 360, aliquota: 20 },
  { ateDias: 720, aliquota: 17.5 },
  { ateDias: Infinity, aliquota: 15 },
];

/** Alíquota de IR (em %) para uma aplicação mantida por `dias` dias corridos. */
export function aliquotaIR(dias: number): number {
  return FAIXAS_IR.find((f) => dias <= f.ateDias)!.aliquota;
}

/** Dias corridos aproximados de um prazo em meses (ano de 365,25 dias). 6 meses = 183 dias; 12 = 365. */
export const diasCorridos = (meses: number) => Math.round((meses * 365.25) / 12);

/** Dias úteis aproximados de um prazo em meses (252 por ano, como no mercado). */
export const diasUteis = (meses: number) => Math.round((meses * 252) / 12);

/** Taxa mensal da poupança em %, pela regra da Selic meta. */
export function taxaPoupancaMensal(selicMetaAnual: number, trMensal: number): number {
  const base = selicMetaAnual > 8.5 ? 0.005 : Math.pow(1 + (0.7 * selicMetaAnual) / 100, 1 / 12) - 1;
  return ((1 + base) * (1 + trMensal / 100) - 1) * 100;
}

export interface Rendimento {
  bruto: number;
  ir: number;
  custodia: number;
  liquido: number;
  final: number;
  /** Rentabilidade líquida no período, em %. */
  rentabilidade: number;
  aliquota: number;
}

function montar(valor: number, bruto: number, custodia: number, aliquota: number): Rendimento {
  const base = Math.max(0, bruto - custodia);
  const ir = (base * aliquota) / 100;
  const liquido = bruto - custodia - ir;
  return { bruto, ir, custodia, liquido, final: valor + liquido, rentabilidade: valor ? (liquido / valor) * 100 : 0, aliquota };
}

/** Poupança: rende a cada aniversário mensal, sem IR. */
export function rendimentoPoupanca(valor: number, meses: number, selicMetaAnual: number, trMensal: number): Rendimento {
  const i = taxaPoupancaMensal(selicMetaAnual, trMensal) / 100;
  const bruto = valor * (Math.pow(1 + i, Math.floor(meses)) - 1);
  return montar(valor, bruto, 0, 0);
}

/** CDB pós-fixado: `percentualCdi`% do CDI ao dia, por 252 dias úteis ao ano, com IR regressivo. */
export function rendimentoCdb(valor: number, meses: number, cdiAnual: number, percentualCdi: number): Rendimento {
  const diaria = (Math.pow(1 + cdiAnual / 100, 1 / 252) - 1) * (percentualCdi / 100);
  const bruto = valor * (Math.pow(1 + diaria, diasUteis(meses)) - 1);
  return montar(valor, bruto, 0, aliquotaIR(diasCorridos(meses)));
}

/**
 * Tesouro Selic: rende a Selic (efetiva) mais um ágio anual, com IR regressivo e custódia da B3
 * cobrada mês a mês sobre o saldo acima de `isencao`. O IR incide sobre o rendimento já sem a custódia.
 */
export function rendimentoTesouroSelic(
  valor: number, meses: number, selicAnual: number, adicionalAnual: number, custodiaAnual: number, isencao: number,
): Rendimento {
  const anual = (1 + selicAnual / 100) * (1 + adicionalAnual / 100) - 1;
  const mensal = Math.pow(1 + anual, 1 / 12) - 1;
  let saldo = valor;
  let custodia = 0;
  const n = Math.round(meses);
  for (let m = 0; m < n; m++) {
    saldo *= 1 + mensal;
    custodia += (Math.max(0, saldo - isencao) * custodiaAnual) / 100 / 12;
  }
  return montar(valor, saldo - valor, custodia, aliquotaIR(diasCorridos(meses)));
}

// ---------------------------------------------------------------------------
// Evolução mês a mês com aportes.
// Cada aporte é um "lote" com a própria idade: o IR regressivo usa o tempo de cada lote.
// Um aporte no mês m entra no começo do mês m (m = 0 é o valor inicial) e rende (t − m) meses até o mês t.

export interface Aporte { mes: number; valor: number }

export type Produto = 'poupanca' | 'cdb' | 'tesouro';

export interface ParametrosProduto {
  selicMeta: number;
  tr: number;
  cdi: number;
  percentualCdi: number;
  adicionalTesouro: number;
  custodia: number;
  isencaoCustodia: number;
}

export interface Evolucao {
  /** Valor líquido se resgatar no fim de cada mês: índice t = mês t (0 a n). */
  liquido: number[];
  /** Total investido até o mês t. */
  investido: number[];
  /** Resumo no fim do prazo, no mesmo formato de antes. */
  final: Rendimento;
}

/** Fator de crescimento de um mês para cada produto. */
export function fatorMensal(p: Produto, x: ParametrosProduto): number {
  if (p === 'poupanca') return 1 + taxaPoupancaMensal(x.selicMeta, x.tr) / 100;
  if (p === 'cdb') return Math.pow(1 + (Math.pow(1 + x.cdi / 100, 1 / 252) - 1) * (x.percentualCdi / 100), 252 / 12);
  const anual = (1 + x.cdi / 100) * (1 + x.adicionalTesouro / 100) - 1;
  return Math.pow(1 + anual, 1 / 12);
}

/** Junta aportes do mesmo mês e descarta os que caem fora do prazo. */
export function organizarAportes(aportes: Aporte[], meses: number): Aporte[] {
  const m = new Map<number, number>();
  for (const a of aportes) {
    const mes = Math.round(a.mes);
    if (a.valor > 0 && mes >= 0 && mes < meses) m.set(mes, (m.get(mes) ?? 0) + a.valor);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([mes, valor]) => ({ mes, valor }));
}

export function evolucao(p: Produto, aportesBrutos: Aporte[], meses: number, x: ParametrosProduto): Evolucao {
  const n = Math.round(meses);
  const aportes = organizarAportes(aportesBrutos, n);
  const g = fatorMensal(p, x);
  const comIR = p !== 'poupanca';
  const liquido: number[] = [];
  const investido: number[] = [];
  let custodiaAcum = 0;
  let fim: Rendimento = montar(0, 0, 0, 0);

  for (let t = 0; t <= n; t++) {
    let inv = 0, bruto = 0;
    const ganhos: { ganho: number; aliq: number }[] = [];
    for (const a of aportes) {
      if (a.mes > t) break;
      inv += a.valor;
      // Poupança só rende em meses inteiros, o que já vale aqui porque t − m é inteiro.
      const ganho = a.valor * (Math.pow(g, t - a.mes) - 1);
      bruto += ganho;
      ganhos.push({ ganho, aliq: comIR ? aliquotaIR(diasCorridos(t - a.mes)) : 0 });
    }
    if (p === 'tesouro' && t > 0) custodiaAcum += (Math.max(0, inv + bruto - x.isencaoCustodia) * x.custodia) / 100 / 12;
    const custodia = p === 'tesouro' ? custodiaAcum : 0;
    // A custódia é dividida entre os lotes na proporção do ganho de cada um; o IR incide no ganho já sem ela.
    let ir = 0;
    for (const l of ganhos) {
      const parte = bruto > 0 ? (custodia * l.ganho) / bruto : 0;
      ir += (Math.max(0, l.ganho - parte) * l.aliq) / 100;
    }
    const liq = bruto - custodia - ir;
    investido.push(inv);
    liquido.push(inv + liq);
    if (t === n) {
      const base = Math.max(0, bruto - custodia);
      fim = { bruto, ir, custodia, liquido: liq, final: inv + liq, rentabilidade: inv ? (liq / inv) * 100 : 0, aliquota: base > 0 ? (ir / base) * 100 : 0 };
    }
  }
  return { liquido, investido, final: fim };
}
