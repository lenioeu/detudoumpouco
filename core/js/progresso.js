// Histórico do jogador, sequência e estatísticas, guardados no próprio aparelho.
// Na fase 2 (ranking), este histórico passa a ser sincronizado com o servidor.

import { diasEntre, somarDias } from './dia.js';

function ler(chave, padrao) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Navegação privada ou armazenamento cheio: o jogo continua, só não guarda.
  }
}

export function criarProgresso(idJogo) {
  const chaveHistorico = `${idJogo}:historico`;
  const chavePartida = `${idJogo}:partida`;

  return {
    /** Estado da partida em andamento de um dia (para continuar após recarregar). */
    partida(dia) {
      const salva = ler(chavePartida, null);
      return salva && salva.dia === dia ? salva.estado : null;
    },
    salvarPartida(dia, estado) {
      gravar(chavePartida, { dia, estado });
    },

    /** Registra o resultado final do dia. `resultado` = { pontos, valor, dicas, ... } */
    concluir(dia, resultado) {
      const historico = ler(chaveHistorico, {});
      if (!historico[dia]) {
        historico[dia] = resultado;
        gravar(chaveHistorico, historico);
      }
      return historico[dia];
    },

    resultado(dia) {
      return ler(chaveHistorico, {})[dia] ?? null;
    },

    historico() {
      return ler(chaveHistorico, {});
    },

    /** Estatísticas para o painel "Seu progresso". */
    estatisticas(hoje) {
      return calcularEstatisticas(ler(chaveHistorico, {}), hoje);
    },
  };
}

/**
 * A sequência conta dias jogados (concluídos). Ela continua viva se o último dia
 * jogado foi hoje ou ontem; pular um dia inteiro zera.
 */
export function calcularEstatisticas(historico, hoje) {
  const dias = Object.keys(historico).sort();
  let melhor = 0;
  let corrente = 0;
  let anterior = null;
  for (const dia of dias) {
    corrente = anterior && diasEntre(anterior, dia) === 1 ? corrente + 1 : 1;
    melhor = Math.max(melhor, corrente);
    anterior = dia;
  }
  const ultimo = dias[dias.length - 1];
  const viva = ultimo && diasEntre(ultimo, hoje) <= 1;

  const valores = dias.map((d) => historico[d].valor);
  const soma = valores.reduce((a, b) => a + b, 0);

  // Semana atual, de segunda a domingo.
  const diaDaSemana = (new Date(`${hoje}T12:00:00Z`).getUTCDay() + 6) % 7;
  const segunda = somarDias(hoje, -diaDaSemana);
  const semana = Array.from({ length: 7 }, (_, i) => {
    const dia = somarDias(segunda, i);
    return { dia, jogou: Boolean(historico[dia]), hoje: dia === hoje, futuro: dia > hoje };
  });

  return {
    jogos: dias.length,
    media: dias.length ? soma / dias.length : 0,
    sequencia: viva ? corrente : 0,
    melhorSequencia: melhor,
    valores,
    semana,
  };
}
