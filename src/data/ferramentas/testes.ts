import type { Ferramenta } from '../tipos';

export default [
  { slug: 'teste-de-microfone', nome: 'Teste de microfone', resumo: 'Veja se o seu microfone está captando.', status: 'planejada' },
  { slug: 'teste-de-webcam', nome: 'Teste de webcam', resumo: 'Veja a imagem da sua câmera.', status: 'planejada' },
  { slug: 'teste-de-teclado', nome: 'Teste de teclado', resumo: 'Descubra se alguma tecla não funciona.', status: 'planejada' },
  { slug: 'velocidade-de-digitacao', nome: 'Velocidade de digitação', resumo: 'Quantas palavras por minuto você digita.', status: 'planejada' },
  { slug: 'teste-de-mouse', nome: 'Teste de mouse e cliques', resumo: 'Botões, rolagem e cliques por segundo.', status: 'planejada' },
  { slug: 'teste-de-alto-falante', nome: 'Teste de alto-falante', resumo: 'Lado esquerdo e direito do som.', status: 'planejada' },
  { slug: 'teste-de-tela', nome: 'Teste de tela', resumo: 'Procure pixels mortos na tela.', status: 'planejada' },
] satisfies Ferramenta[];
