import type { Ferramenta } from '../tipos';

export default [
  { slug: 'cronometro', nome: 'Cronômetro', resumo: 'Cronômetro online com voltas.', status: 'pronta' },
  { slug: 'timer', nome: 'Timer', resumo: 'Contagem regressiva com alarme.', status: 'planejada' },
  { slug: 'pomodoro', nome: 'Pomodoro', resumo: 'Foco de 25 minutos com pausas.', status: 'planejada' },
  { slug: 'bloco-de-notas', nome: 'Bloco de notas', resumo: 'Anote algo rápido; fica salvo no navegador.', status: 'planejada' },
  { slug: 'despertador', nome: 'Despertador online', resumo: 'Alarme no navegador.', status: 'planejada' },
  { slug: 'lista-de-tarefas', nome: 'Lista de tarefas', resumo: 'Lista simples salva no navegador.', status: 'planejada' },
] satisfies Ferramenta[];
