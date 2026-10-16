// Mantém a tela acesa (Screen Wake Lock) enquanto um cronômetro ou timer roda.
// O navegador pode recusar (bateria fraca, aba em segundo plano, navegador sem suporte):
// nesse caso só avisamos, a ferramenta continua funcionando.

export type EstadoTela = 'ativa' | 'indisponivel' | 'recusada' | 'solta';

export function criarTelaAcesa(aoMudar?: (estado: EstadoTela) => void) {
  let trava: WakeLockSentinel | null = null;
  let querer = false;
  let pedindo = false;

  async function pedir() {
    if (pedindo || trava) return;
    if (!('wakeLock' in navigator)) { aoMudar?.('indisponivel'); return; }
    pedindo = true;
    try {
      const t = await navigator.wakeLock.request('screen');
      if (!querer) { t.release().catch(() => {}); return; }
      trava = t;
      t.addEventListener('release', () => { if (trava === t) trava = null; });
      aoMudar?.('ativa');
    } catch {
      aoMudar?.('recusada');
    } finally {
      pedindo = false;
    }
  }

  // A trava cai quando a aba fica escondida; pedimos de novo quando ela volta.
  document.addEventListener('visibilitychange', () => {
    if (querer && document.visibilityState === 'visible') pedir();
  });

  return {
    ligar() { querer = true; pedir(); },
    desligar() {
      querer = false;
      const t = trava;
      trava = null;
      t?.release().catch(() => {});
      aoMudar?.('solta');
    },
  };
}
