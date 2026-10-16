import type { Ferramenta } from '../tipos';

export default [
  { slug: 'calculadora-de-gravidez', nome: 'Calculadora de gravidez', resumo: 'Semanas de gestação e data provável do parto.', status: 'planejada' },
  { slug: 'periodo-fertil', nome: 'Período fértil', resumo: 'Dias férteis e próxima menstruação.', status: 'planejada' },
  { slug: 'imc', nome: 'Calculadora de IMC', resumo: 'Índice de massa corporal e o que ele indica.', status: 'planejada' },
  { slug: 'consumo-de-agua', nome: 'Quanta água beber', resumo: 'Quantidade de água recomendada por dia.', status: 'planejada' },
  { slug: 'calorias', nome: 'Calorias por dia', resumo: 'Gasto calórico diário estimado.', status: 'planejada' },
] satisfies Ferramenta[];
