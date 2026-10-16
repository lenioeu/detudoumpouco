// Números por extenso em português do Brasil.
// Funções puras: a seção Documentos usa `reaisPorExtenso` no recibo.

const UNIDADES = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos',
  'setecentos', 'oitocentos', 'novecentos'];
/** Nome de cada grupo de três dígitos: [singular, plural]. O índice 1 (mil) não varia. */
const GRUPOS: [string, string][] = [
  ['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões'], ['trilhão', 'trilhões'],
];

/** Maior inteiro aceito: 999 trilhões, 999 bilhões... (10^15 − 1). */
export const MAXIMO = 999_999_999_999_999;

/** De 0 a 999. */
function ate999(n: number): string {
  if (n < 20) return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10), u = n % 10;
    return u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d];
  }
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100), resto = n % 100;
  return resto ? `${CENTENAS[c]} e ${ate999(resto)}` : CENTENAS[c];
}

/**
 * Inteiro por extenso: 1001 → "mil e um", 2500000 → "dois milhões e quinhentos mil".
 * Usa "e" antes do último grupo quando ele é menor que 100 ou uma centena redonda
 * (mil e cem, mil e vinte), e espaço nos outros casos (mil duzentos e trinta).
 */
export function inteiroPorExtenso(n: number): string {
  if (!Number.isInteger(n)) throw new RangeError('Use um número inteiro.');
  if (Math.abs(n) > MAXIMO) throw new RangeError('Número grande demais.');
  if (n < 0) return `menos ${inteiroPorExtenso(-n)}`;
  if (n === 0) return 'zero';

  const grupos: number[] = []; // do menor (unidades) para o maior
  for (let r = n; r > 0; r = Math.floor(r / 1000)) grupos.push(r % 1000);

  const partes: { texto: string; valor: number }[] = [];
  for (let i = grupos.length - 1; i >= 0; i--) {
    const g = grupos[i];
    if (!g) continue;
    let texto: string;
    if (i === 0) texto = ate999(g);
    else if (i === 1) texto = g === 1 ? 'mil' : `${ate999(g)} mil`;
    else texto = `${ate999(g)} ${g === 1 ? GRUPOS[i][0] : GRUPOS[i][1]}`;
    partes.push({ texto, valor: g });
  }

  return partes.reduce((acc, p, k) => {
    if (k === 0) return p.texto;
    const ultima = k === partes.length - 1;
    const usaE = ultima && (p.valor < 100 || p.valor % 100 === 0);
    return `${acc}${usaE ? ' e ' : ' '}${p.texto}`;
  }, '');
}

/**
 * Número com casas decimais lido com "vírgula": 3,5 → "três vírgula cinco",
 * 2,05 → "dois vírgula zero cinco". `texto` é o número já normalizado ("2.05").
 */
export function decimalPorExtenso(texto: string): string {
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(texto.trim());
  if (!m) throw new RangeError('Número inválido.');
  const [, sinal, int, dec] = m;
  let s = inteiroPorExtenso(Number(int));
  if (dec && /[1-9]/.test(dec)) {
    const casas = dec.replace(/0+$/, '');
    const zeros = casas.match(/^0*/)![0].length;
    const resto = casas.slice(zeros);
    s += ' vírgula ' + [...Array(zeros).fill('zero'), inteiroPorExtenso(Number(resto))].join(' ');
  }
  return sinal && s !== 'zero' ? `menos ${s}` : s;
}

/**
 * Valor em reais por extenso: 1230.4 → "mil duzentos e trinta reais e quarenta centavos".
 * Arredonda para centavos. Usa "de reais" depois de milhão/bilhão redondo
 * ("um milhão de reais") e "real" no singular para R$ 1.
 */
export function reaisPorExtenso(valor: number): string {
  if (!Number.isFinite(valor)) throw new RangeError('Valor inválido.');
  const negativo = valor < 0;
  const abs = Math.abs(valor);
  if (abs > 9_999_999_999_999) throw new RangeError('Valor grande demais.');
  // toPrecision(15) desfaz o erro de ponto flutuante (1,005 × 100 = 100,4999...).
  const total = Math.round(Number((abs * 100).toPrecision(15)));
  const reais = Math.floor(total / 100);
  const centavos = total % 100;

  const partes: string[] = [];
  if (reais > 0 || centavos === 0) {
    const de = reais >= 1_000_000 && reais % 1_000_000 === 0 ? ' de' : '';
    partes.push(`${inteiroPorExtenso(reais)}${de} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) partes.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  const s = partes.join(' e ');
  return negativo && (reais > 0 || centavos > 0) ? `menos ${s}` : s;
}

/** Primeira letra maiúscula, para começar frase ou preencher cheque. */
export const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
