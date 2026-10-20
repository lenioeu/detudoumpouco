// Datas e sorteio do desafio do dia. Funções puras: rodam no navegador e no Node
// (o build usa as mesmas funções para gerar as páginas de respostas anteriores).

export const FUSO = 'America/Sao_Paulo';
const UM_DIA = 86400000;

/** Data de hoje em Brasília no formato AAAA-MM-DD. */
export function hojeEmBrasilia(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(agora);
}

function emUtc(chave) {
  const [a, m, d] = chave.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
}

/** Soma dias a uma data AAAA-MM-DD. */
export function somarDias(chave, dias) {
  return new Date(emUtc(chave) + dias * UM_DIA).toISOString().slice(0, 10);
}

/** Diferença em dias entre duas datas AAAA-MM-DD (b - a). */
export function diasEntre(a, b) {
  return Math.round((emUtc(b) - emUtc(a)) / UM_DIA);
}

/** Número do jogo: o dia do lançamento é o jogo nº 1. */
export function numeroDoJogo(chave, lancamento) {
  return diasEntre(lancamento, chave) + 1;
}

/** "19 de outubro" */
export function dataPorExtenso(chave, comAno = false) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC', day: 'numeric', month: 'long', ...(comAno ? { year: 'numeric' } : {}),
  }).format(new Date(emUtc(chave)));
}

/** Milissegundos até a próxima meia-noite em Brasília. */
export function msAteAmanha(agora = new Date()) {
  const amanha = somarDias(hojeEmBrasilia(agora), 1);
  // Brasília não tem horário de verão desde 2019: meia-noite = 03:00 UTC.
  return emUtc(amanha) + 3 * 3600000 - agora.getTime();
}

export function formatarRelogio(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

/** Gerador pseudoaleatório determinístico (mulberry32) a partir de um texto. */
export function geradorDoDia(semente) {
  let h = 1779033703 ^ semente.length;
  for (let i = 0; i < semente.length; i++) {
    h = Math.imul(h ^ semente.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let t = h >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function embaralhar(lista, aleatorio) {
  const copia = lista.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}
