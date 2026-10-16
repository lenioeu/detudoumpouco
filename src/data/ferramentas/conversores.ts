import type { Ferramenta } from '../tipos';

export default [
  { slug: 'numero-por-extenso', nome: 'Número por extenso', resumo: 'Escreva valores em reais por extenso.', status: 'planejada' },
  { slug: 'unidades', nome: 'Conversor de unidades', resumo: 'Comprimento, peso, temperatura, área e mais.', status: 'planejada' },
  { slug: 'medidas-de-receita', nome: 'Medidas de receita', resumo: 'Xícaras e colheres para gramas e ml.', status: 'planejada' },
  { slug: 'numeros-romanos', nome: 'Números romanos', resumo: 'Converta para algarismos romanos e de volta.', status: 'planejada' },
  { slug: 'binario-hexadecimal', nome: 'Binário e hexadecimal', resumo: 'Converta entre bases numéricas.', status: 'planejada' },
  { slug: 'fuso-horario', nome: 'Fuso horário', resumo: 'Que horas são em outra cidade.', status: 'planejada' },
] satisfies Ferramenta[];
