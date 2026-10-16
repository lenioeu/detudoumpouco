// Som de alarme gerado na hora com Web Audio (sem baixar arquivo de áudio).
// Os navegadores só liberam som depois de um toque ou clique: chame prepararSom() dentro do clique em "Iniciar".

let ctx: AudioContext | null = null;
let repetidor = 0;
let limite = 0;

/** Cria ou destrava o áudio. Deve ser chamada a partir de um clique do usuário. */
export function prepararSom(): boolean {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/** Três bipes curtos. */
export function bipar(volume = 0.6) {
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.02;
  for (let i = 0; i < 3; i++) {
    const ini = t0 + i * 0.22;
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = i === 2 ? 1046 : 880;
    ganho.gain.setValueAtTime(0, ini);
    ganho.gain.linearRampToValueAtTime(volume * 0.25, ini + 0.01);
    ganho.gain.setValueAtTime(volume * 0.25, ini + 0.13);
    ganho.gain.linearRampToValueAtTime(0, ini + 0.16);
    osc.connect(ganho).connect(ctx.destination);
    osc.start(ini);
    osc.stop(ini + 0.18);
  }
}

/** Toca os bipes a cada segundo até pararAlarme() ou até `maxMs` (padrão: 1 minuto). */
export function tocarAlarme(maxMs = 60_000, volume = 0.6) {
  pararAlarme();
  bipar(volume);
  repetidor = window.setInterval(() => bipar(volume), 1000);
  limite = window.setTimeout(pararAlarme, maxMs);
  if ('vibrate' in navigator) navigator.vibrate?.([300, 150, 300, 150, 300]);
}

export function pararAlarme() {
  clearInterval(repetidor);
  clearTimeout(limite);
  repetidor = limite = 0;
  if ('vibrate' in navigator) navigator.vibrate?.(0);
}

export const alarmeTocando = () => repetidor !== 0;
