// Contas de juros: conversão de taxas, juros compostos com aportes e tabelas Price e SAC.
// Taxas sempre em porcentagem (1 = 1%), prazos sempre em meses.

/** Converte uma taxa anual em % para a taxa mensal equivalente em % (juros compostos). */
export const anualParaMensal = (anual: number) => (Math.pow(1 + anual / 100, 1 / 12) - 1) * 100;

/** Converte uma taxa mensal em % para a taxa anual equivalente em %. */
export const mensalParaAnual = (mensal: number) => (Math.pow(1 + mensal / 100, 12) - 1) * 100;

export interface LinhaEvolucao {
  mes: number;
  investido: number;
  juros: number;
  saldo: number;
}

export interface ResultadoJurosCompostos {
  montante: number;
  investido: number;
  juros: number;
  /** Saldo ao fim de cada mês (o índice 0 é o mês 1). */
  meses: LinhaEvolucao[];
}

/**
 * Juros compostos com valor inicial e aporte mensal.
 * O aporte entra no fim de cada mês (o primeiro aporte não rende no mês em que entra).
 * Fórmula fechada: M = P·(1+i)^n + A·((1+i)^n − 1)/i
 */
export function jurosCompostos(inicial: number, aporteMensal: number, taxaMensal: number, meses: number): ResultadoJurosCompostos {
  const i = taxaMensal / 100;
  const n = Math.max(0, Math.round(meses));
  const linhas: LinhaEvolucao[] = [];
  let saldo = inicial;
  let investido = inicial;
  for (let m = 1; m <= n; m++) {
    saldo = saldo * (1 + i) + aporteMensal;
    investido += aporteMensal;
    linhas.push({ mes: m, investido, juros: saldo - investido, saldo });
  }
  return { montante: saldo, investido, juros: saldo - investido, meses: linhas };
}

/** Montante pela fórmula fechada, usado para conferir a conta mês a mês. */
export function montanteFormula(inicial: number, aporteMensal: number, taxaMensal: number, meses: number): number {
  const i = taxaMensal / 100;
  const f = Math.pow(1 + i, meses);
  return inicial * f + (i === 0 ? aporteMensal * meses : (aporteMensal * (f - 1)) / i);
}

export interface Parcela {
  numero: number;
  prestacao: number;
  juros: number;
  amortizacao: number;
  saldo: number;
}

export interface Financiamento {
  parcelas: Parcela[];
  totalPago: number;
  totalJuros: number;
  primeira: number;
  ultima: number;
}

function resumo(parcelas: Parcela[]): Financiamento {
  const totalPago = parcelas.reduce((s, p) => s + p.prestacao, 0);
  const totalJuros = parcelas.reduce((s, p) => s + p.juros, 0);
  return { parcelas, totalPago, totalJuros, primeira: parcelas[0]?.prestacao ?? 0, ultima: parcelas.at(-1)?.prestacao ?? 0 };
}

/** Prestação fixa da tabela Price: PMT = PV·i / (1 − (1+i)^−n). */
export function prestacaoPrice(valor: number, taxaMensal: number, meses: number): number {
  const i = taxaMensal / 100;
  if (i === 0) return valor / meses;
  return (valor * i) / (1 - Math.pow(1 + i, -meses));
}

/** Tabela Price (Sistema Francês): prestações iguais, amortização crescente. */
export function tabelaPrice(valor: number, taxaMensal: number, meses: number): Financiamento {
  const i = taxaMensal / 100;
  const n = Math.round(meses);
  const pmt = prestacaoPrice(valor, taxaMensal, n);
  const parcelas: Parcela[] = [];
  let saldo = valor;
  for (let k = 1; k <= n; k++) {
    const juros = saldo * i;
    const amortizacao = pmt - juros;
    saldo = k === n ? 0 : saldo - amortizacao;
    parcelas.push({ numero: k, prestacao: pmt, juros, amortizacao, saldo: Math.abs(saldo) < 1e-6 ? 0 : saldo });
  }
  return resumo(parcelas);
}

/** Tabela SAC (Sistema de Amortização Constante): amortização fixa, prestação decrescente. */
export function tabelaSac(valor: number, taxaMensal: number, meses: number): Financiamento {
  const i = taxaMensal / 100;
  const n = Math.round(meses);
  const amortizacao = valor / n;
  const parcelas: Parcela[] = [];
  let saldo = valor;
  for (let k = 1; k <= n; k++) {
    const juros = saldo * i;
    saldo = k === n ? 0 : saldo - amortizacao;
    parcelas.push({ numero: k, prestacao: amortizacao + juros, juros, amortizacao, saldo });
  }
  return resumo(parcelas);
}
