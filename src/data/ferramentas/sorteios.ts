import type { Ferramenta } from '../tipos';

export default [
  { slug: 'sorteador-de-nomes', nome: 'Sorteador de nomes', resumo: 'Sorteie um ou vários nomes de uma lista.', status: 'pronta' },
  { slug: 'sorteador-de-numeros', nome: 'Sorteador de números', resumo: 'Sorteie números num intervalo.', status: 'pronta' },
  { slug: 'amigo-secreto', nome: 'Amigo secreto', resumo: 'Sorteio do amigo secreto com link para cada um.', status: 'planejada' },
  { slug: 'roleta', nome: 'Roleta', resumo: 'Gire a roleta com as suas opções.', status: 'planejada' },
  { slug: 'times-aleatorios', nome: 'Times aleatórios', resumo: 'Divida a turma em times equilibrados.', status: 'planejada' },
  { slug: 'gerador-de-nomes', nome: 'Gerador de nomes', resumo: 'Ideias de nome para empresa, pet ou personagem.', status: 'planejada' },
  { slug: 'dados-cara-ou-coroa', nome: 'Dados e cara ou coroa', resumo: 'Jogue dados ou uma moeda.', status: 'planejada' },
] satisfies Ferramenta[];
