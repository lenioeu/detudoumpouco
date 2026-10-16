// Conversor de unidades. Cada unidade tem um fator para a unidade base da categoria
// (metro, quilo, metro quadrado, litro, metro por segundo). Temperatura usa fórmulas.
// Fatores exatos pelas definições internacionais (polegada = 25,4 mm, libra = 0,45359237 kg...).

export interface Unidade {
  id: string;
  nome: string;
  /** Plural, usado na frase do resultado. */
  plural: string;
  simbolo: string;
  /** Quanto 1 desta unidade vale na unidade base. */
  fator?: number;
  paraBase?: (v: number) => number;
  daBase?: (v: number) => number;
}

export interface Categoria { id: string; nome: string; unidades: Unidade[]; padrao: [string, string]; }

const u = (id: string, nome: string, plural: string, simbolo: string, fator: number): Unidade => ({ id, nome, plural, simbolo, fator });

export const CATEGORIAS: Categoria[] = [
  {
    id: 'comprimento', nome: 'Comprimento', padrao: ['pol', 'cm'], unidades: [
      u('mm', 'milímetro', 'milímetros', 'mm', 0.001),
      u('cm', 'centímetro', 'centímetros', 'cm', 0.01),
      u('m', 'metro', 'metros', 'm', 1),
      u('km', 'quilômetro', 'quilômetros', 'km', 1000),
      u('pol', 'polegada', 'polegadas', 'pol', 0.0254),
      u('pe', 'pé', 'pés', 'pé', 0.3048),
      u('jd', 'jarda', 'jardas', 'jd', 0.9144),
      u('mi', 'milha', 'milhas', 'mi', 1609.344),
      u('nmi', 'milha náutica', 'milhas náuticas', 'M', 1852),
    ],
  },
  {
    id: 'peso', nome: 'Peso', padrao: ['lb', 'kg'], unidades: [
      u('mg', 'miligrama', 'miligramas', 'mg', 1e-6),
      u('g', 'grama', 'gramas', 'g', 0.001),
      u('kg', 'quilo', 'quilos', 'kg', 1),
      u('t', 'tonelada', 'toneladas', 't', 1000),
      u('oz', 'onça', 'onças', 'oz', 0.028349523125),
      u('lb', 'libra', 'libras', 'lb', 0.45359237),
      u('arroba', 'arroba', 'arrobas', '@', 15),
      u('ct', 'quilate', 'quilates', 'ct', 0.0002),
    ],
  },
  {
    id: 'temperatura', nome: 'Temperatura', padrao: ['f', 'c'], unidades: [
      { id: 'c', nome: 'grau Celsius', plural: 'graus Celsius', simbolo: '°C', paraBase: (v) => v, daBase: (v) => v },
      { id: 'f', nome: 'grau Fahrenheit', plural: 'graus Fahrenheit', simbolo: '°F', paraBase: (v) => (v - 32) / 1.8, daBase: (v) => v * 1.8 + 32 },
      { id: 'k', nome: 'kelvin', plural: 'kelvins', simbolo: 'K', paraBase: (v) => v - 273.15, daBase: (v) => v + 273.15 },
    ],
  },
  {
    id: 'area', nome: 'Área', padrao: ['alqsp', 'ha'], unidades: [
      u('cm2', 'centímetro quadrado', 'centímetros quadrados', 'cm²', 1e-4),
      u('m2', 'metro quadrado', 'metros quadrados', 'm²', 1),
      u('ha', 'hectare', 'hectares', 'ha', 10_000),
      u('km2', 'quilômetro quadrado', 'quilômetros quadrados', 'km²', 1e6),
      u('alqsp', 'alqueire paulista', 'alqueires paulistas', 'alq. SP', 24_200),
      u('alqmg', 'alqueire mineiro', 'alqueires mineiros', 'alq. MG', 48_400),
      u('acre', 'acre', 'acres', 'ac', 4046.8564224),
      u('pe2', 'pé quadrado', 'pés quadrados', 'pé²', 0.09290304),
      u('pol2', 'polegada quadrada', 'polegadas quadradas', 'pol²', 0.00064516),
    ],
  },
  {
    id: 'volume', nome: 'Volume', padrao: ['galus', 'l'], unidades: [
      u('ml', 'mililitro', 'mililitros', 'ml', 0.001),
      u('l', 'litro', 'litros', 'L', 1),
      u('m3', 'metro cúbico', 'metros cúbicos', 'm³', 1000),
      u('cm3', 'centímetro cúbico', 'centímetros cúbicos', 'cm³', 0.001),
      u('galus', 'galão americano', 'galões americanos', 'gal', 3.785411784),
      u('galuk', 'galão imperial', 'galões imperiais', 'gal (UK)', 4.54609),
      u('ozfl', 'onça fluida', 'onças fluidas', 'fl oz', 0.0295735295625),
      u('bbl', 'barril de petróleo', 'barris de petróleo', 'bbl', 158.987294928),
    ],
  },
  {
    id: 'velocidade', nome: 'Velocidade', padrao: ['mph', 'kmh'], unidades: [
      u('kmh', 'quilômetro por hora', 'quilômetros por hora', 'km/h', 1 / 3.6),
      u('ms', 'metro por segundo', 'metros por segundo', 'm/s', 1),
      u('mph', 'milha por hora', 'milhas por hora', 'mph', 0.44704),
      u('kn', 'nó', 'nós', 'kn', 1852 / 3600),
      u('fts', 'pé por segundo', 'pés por segundo', 'pé/s', 0.3048),
    ],
  },
];

export const categoria = (id: string) => CATEGORIAS.find((c) => c.id === id);
export const unidade = (cat: Categoria, id: string) => cat.unidades.find((x) => x.id === id);

const paraBase = (x: Unidade, v: number) => (x.paraBase ? x.paraBase(v) : v * x.fator!);
const daBase = (x: Unidade, v: number) => (x.daBase ? x.daBase(v) : v / x.fator!);

/** Converte `valor` da unidade `de` para `para`, dentro da categoria. */
export function converter(catId: string, valor: number, de: string, para: string): number {
  const cat = categoria(catId);
  if (!cat) throw new Error(`Categoria ${catId} não existe.`);
  const a = unidade(cat, de), b = unidade(cat, para);
  if (!a || !b) throw new Error('Unidade não existe nesta categoria.');
  if (de === para) return valor;
  return daBase(b, paraBase(a, valor));
}

/** Formata com até 10 algarismos significativos (tira o 2,5399999 dos fatores). */
export function formatarMedida(n: number): string {
  if (n === 0 || Object.is(n, -0)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e15 || abs < 1e-9) {
    return n.toLocaleString('pt-BR', { notation: 'scientific', maximumSignificantDigits: 6 });
  }
  return n.toLocaleString('pt-BR', { maximumSignificantDigits: 10 });
}

/** "1 polegada" / "2,54 centímetros": singular só para 1 e −1. */
export function comNome(n: number, x: Unidade): string {
  const s = formatarMedida(n);
  return `${s} ${s === '1' || s === '-1' ? x.nome : x.plural}`;
}
