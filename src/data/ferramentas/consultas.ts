import type { Ferramenta } from '../tipos';

export default [
  { slug: 'buscar-cep', nome: 'Buscar CEP', resumo: 'Endereço pelo CEP ou CEP pelo endereço.', status: 'planejada' },
  { slug: 'cotacao-do-dolar', nome: 'Cotação do dólar', resumo: 'Dólar, euro e conversor de moedas.', status: 'planejada' },
  { slug: 'feriados', nome: 'Feriados nacionais', resumo: 'Feriados do ano e quanto falta para o próximo.', status: 'planejada' },
] satisfies Ferramenta[];
