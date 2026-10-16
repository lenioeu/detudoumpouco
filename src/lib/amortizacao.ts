// Amortização extraordinária: pagar a mais para quitar antes ou baixar a parcela.
// Taxas em porcentagem ao mês (1 = 1%), prazos em meses.
import { prestacaoPrice } from './juros';

export type Sistema = 'price' | 'sac';
/** "prazo": mantém a parcela e termina antes. "parcela": mantém o prazo e a parcela cai. */
export type Modo = 'prazo' | 'parcela';

export interface OpcoesAmortizacao {
  saldo: number;
  taxaMensal: number;
  meses: number;
  sistema: Sistema;
  modo: Modo;
  /** Valor pago a mais todo mês, junto com a parcela. */
  extraMensal?: number;
  /** Valor pago a mais uma única vez. */
  extraUnico?: number;
  /** Em qual parcela o valor único é pago (1 = junto com a primeira). */
  mesUnico?: number;
}

export interface LinhaAmortizacao {
  numero: number;
  prestacao: number;
  juros: number;
  amortizacao: number;
  extra: number;
  saldo: number;
}

export interface ResultadoAmortizacao {
  linhas: LinhaAmortizacao[];
  meses: number;
  totalJuros: number;
  /** Parcelas + valores extras. */
  totalPago: number;
  totalExtra: number;
  primeira: number;
  /** Parcela no mês seguinte ao valor único (ou a 2ª), para mostrar quanto a parcela caiu. */
  parcelaDepois: number;
  ultima: number;
}

const ZERO = 0.005;

export function simularAmortizacao(o: OpcoesAmortizacao): ResultadoAmortizacao {
  const i = o.taxaMensal / 100;
  const n = Math.round(o.meses);
  const extraMensal = Math.max(0, o.extraMensal ?? 0);
  const extraUnico = Math.max(0, o.extraUnico ?? 0);
  const mesUnico = Math.max(1, Math.round(o.mesUnico ?? 1));
  const pmtFixa = prestacaoPrice(o.saldo, o.taxaMensal, n);
  const amortFixa = o.saldo / n;

  const linhas: LinhaAmortizacao[] = [];
  let saldo = o.saldo;
  for (let k = 1; k <= n && saldo > ZERO; k++) {
    const restantes = n - k + 1;
    const juros = saldo * i;
    let amortizacao: number;
    if (o.sistema === 'price') {
      const pmt = o.modo === 'prazo' ? pmtFixa : prestacaoPrice(saldo, o.taxaMensal, restantes);
      amortizacao = pmt - juros;
    } else {
      amortizacao = o.modo === 'prazo' ? amortFixa : saldo / restantes;
    }
    amortizacao = Math.min(amortizacao, saldo);
    saldo -= amortizacao;
    let extra = extraMensal + (k === mesUnico ? extraUnico : 0);
    extra = Math.min(extra, saldo);
    saldo -= extra;
    if (saldo < ZERO) saldo = 0;
    linhas.push({ numero: k, prestacao: juros + amortizacao, juros, amortizacao, extra, saldo });
  }

  const soma = (f: (l: LinhaAmortizacao) => number) => linhas.reduce((s, l) => s + f(l), 0);
  const totalExtra = soma((l) => l.extra);
  const idxDepois = Math.min(extraUnico > 0 ? mesUnico : 1, linhas.length - 1);
  return {
    linhas,
    meses: linhas.length,
    totalJuros: soma((l) => l.juros),
    totalPago: soma((l) => l.prestacao) + totalExtra,
    totalExtra,
    primeira: linhas[0]?.prestacao ?? 0,
    parcelaDepois: linhas[idxDepois]?.prestacao ?? 0,
    ultima: linhas.at(-1)?.prestacao ?? 0,
  };
}

/** "8 anos e 4 meses", "11 meses", "2 anos" */
export function duracao(meses: number): string {
  const a = Math.floor(meses / 12), m = meses % 12;
  const pa = a ? `${a} ${a === 1 ? 'ano' : 'anos'}` : '';
  const pm = m ? `${m} ${m === 1 ? 'mês' : 'meses'}` : '';
  return pa && pm ? `${pa} e ${pm}` : pa || pm || '0 meses';
}
