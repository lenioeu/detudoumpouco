// Funções puras de tempo para cronômetro e timer.
// O tempo é sempre medido pela diferença entre leituras de performance.now(), nunca contando "tiques".

const dois = (n: number) => String(n).padStart(2, '0');

/** Cronômetro: "mm:ss,cc" ou "h:mm:ss,cc" (centésimos com vírgula, padrão brasileiro). */
export function formatarCronometro(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 10)); // em centésimos, sempre arredondando para baixo
  const cc = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000) % 60;
  const h = Math.floor(total / 360000);
  return h > 0 ? `${h}:${dois(m)}:${dois(s)},${dois(cc)}` : `${dois(m)}:${dois(s)},${dois(cc)}`;
}

/** Timer: segundos arredondados para cima ("00:01" até o último instante), "mm:ss" ou "h:mm:ss". */
export function formatarTimer(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000 - 1e-9));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  return h > 0 ? `${h}:${dois(m)}:${dois(s)}` : `${dois(m)}:${dois(s)}`;
}

/** Converte horas, minutos e segundos em milissegundos. Retorna null se algo for inválido. */
export function duracaoMs(h: number, m: number, s: number): number | null {
  if (![h, m, s].every((x) => Number.isFinite(x) && x >= 0)) return null;
  return Math.round((h * 3600 + m * 60 + s) * 1000);
}

/** Separa milissegundos em horas, minutos e segundos inteiros. */
export function separar(ms: number): { h: number; m: number; s: number } {
  const total = Math.max(0, Math.round(ms / 1000));
  return { h: Math.floor(total / 3600), m: Math.floor(total / 60) % 60, s: total % 60 };
}

/** Relógio que pode ser iniciado, pausado e zerado. `agora` vem de performance.now(). */
export interface Relogio {
  rodando: boolean;
  /** Momento (performance.now) em que começou o trecho atual. */
  inicio: number;
  /** Tempo somado dos trechos anteriores, em ms. */
  acumulado: number;
}

export const relogioNovo = (): Relogio => ({ rodando: false, inicio: 0, acumulado: 0 });
export const decorrido = (r: Relogio, agora: number) => r.acumulado + (r.rodando ? agora - r.inicio : 0);
export const iniciar = (r: Relogio, agora: number): Relogio => (r.rodando ? r : { rodando: true, inicio: agora, acumulado: r.acumulado });
export const pausar = (r: Relogio, agora: number): Relogio => (r.rodando ? { rodando: false, inicio: 0, acumulado: decorrido(r, agora) } : r);

export interface Volta {
  numero: number;
  /** Duração só desta volta, em ms. */
  volta: number;
  /** Tempo total no momento da volta, em ms. */
  total: number;
}

/** Cria a próxima volta a partir do tempo total atual. */
export function novaVolta(voltas: readonly Volta[], total: number): Volta {
  const anterior = voltas.length ? voltas[voltas.length - 1].total : 0;
  return { numero: voltas.length + 1, volta: total - anterior, total };
}

/** Índices da volta mais rápida e da mais lenta (só faz sentido com 2 voltas ou mais). */
export function extremos(voltas: readonly Volta[]): { rapida: number; lenta: number } | null {
  if (voltas.length < 2) return null;
  let rapida = 0, lenta = 0;
  voltas.forEach((v, i) => {
    if (v.volta < voltas[rapida].volta) rapida = i;
    if (v.volta > voltas[lenta].volta) lenta = i;
  });
  return rapida === lenta ? null : { rapida, lenta };
}

/** Texto das voltas em CSV (separador ";" para abrir direto no Excel em português). */
export function voltasCsv(voltas: readonly Volta[]): string {
  const linhas = voltas.map((v) => `${v.numero};${formatarCronometro(v.volta)};${formatarCronometro(v.total)}`);
  return ['Volta;Tempo da volta;Tempo total', ...linhas].join('\r\n');
}
