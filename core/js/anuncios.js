// Anúncios: banners do AdSense e anúncio de recompensa (Google Ad Manager).
//
// Regras do AdSense seguidas aqui (ver CLAUDE.md):
// - os espaços ficam no topo e no fim da página, nunca colados em botões;
// - nunca dentro de painéis ou janelas;
// - o anúncio de recompensa só abre depois que o jogador escolhe assistir.
//
// Sem IDs configurados em site.json, ou com ?anuncios=teste na URL, os espaços
// aparecem como caixas tracejadas para conferir o layout.

import { consentimento } from './consentimento.js';

const config = () => window.SITE?.anuncios ?? {};

function modoTeste() {
  const p = new URLSearchParams(location.search);
  return p.get('anuncios') === 'teste' || ['localhost', '127.0.0.1'].includes(location.hostname);
}

let scriptAdsense = null;
function carregarAdsense(cliente) {
  if (scriptAdsense) return scriptAdsense;
  window.adsbygoogle = window.adsbygoogle || [];
  // Quem recusou cookies recebe anúncios não personalizados.
  if (consentimento() !== 'aceito') window.adsbygoogle.requestNonPersonalizedAds = 1;
  scriptAdsense = document.createElement('script');
  scriptAdsense.async = true;
  scriptAdsense.crossOrigin = 'anonymous';
  scriptAdsense.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${cliente}`;
  document.head.append(scriptAdsense);
  return scriptAdsense;
}

/** Preenche os elementos .anuncio[data-espaco] que estiverem na página. */
export function prepararBanners(raiz = document) {
  const { cliente, espacos = {} } = config();
  for (const el of raiz.querySelectorAll('.anuncio[data-espaco]:not([data-pronto])')) {
    el.dataset.pronto = '1';
    const espaco = espacos[el.dataset.espaco];
    if (!cliente || !espaco) {
      if (modoTeste()) {
        el.classList.add('anuncio--teste');
        el.textContent = 'Espaço para anúncio';
      }
      continue;
    }
    carregarAdsense(cliente);
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.dataset.adClient = cliente;
    ins.dataset.adSlot = espaco;
    ins.dataset.adFormat = 'auto';
    ins.dataset.fullWidthResponsive = 'true';
    el.append(ins);
    window.adsbygoogle.push({});
  }
}

let scriptGpt = null;
function carregarGpt() {
  if (scriptGpt) return;
  window.googletag = window.googletag || { cmd: [] };
  scriptGpt = document.createElement('script');
  scriptGpt.async = true;
  scriptGpt.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
  document.head.append(scriptGpt);
}

/**
 * Mostra um anúncio de recompensa. Resolve `true` quando o jogador ganha a
 * recompensa. Se não houver anúncio disponível (sem configuração, sem estoque,
 * bloqueador ou demora), também resolve `true`: a dica é liberada mesmo assim.
 * Resolve `false` só quando o jogador fecha o anúncio antes do fim.
 */
export function mostrarAnuncioRecompensa() {
  const { recompensa } = config();
  if (!recompensa) return Promise.resolve(true);

  return new Promise((resolver) => {
    let terminou = false;
    let apareceu = false;
    const fim = (valor) => {
      if (terminou) return;
      terminou = true;
      resolver(valor);
    };
    // Sem anúncio em 6 segundos: libera a recompensa.
    setTimeout(() => { if (!apareceu) fim(true); }, 6000);

    carregarGpt();
    const gt = window.googletag;
    gt.cmd.push(() => {
      const espaco = gt.defineOutOfPageSlot(recompensa, gt.enums.OutOfPageFormat.REWARDED);
      if (!espaco) return fim(true);
      espaco.addService(gt.pubads());
      let ganhou = false;
      const pubads = gt.pubads();
      pubads.addEventListener('rewardedSlotReady', (e) => {
        if (e.slot !== espaco) return;
        apareceu = true;
        e.makeRewardedVisible();
      });
      pubads.addEventListener('rewardedSlotGranted', (e) => { if (e.slot === espaco) ganhou = true; });
      pubads.addEventListener('rewardedSlotClosed', (e) => {
        if (e.slot !== espaco) return;
        gt.destroySlots([espaco]);
        fim(ganhou);
      });
      pubads.addEventListener('slotRenderEnded', (e) => {
        if (e.slot === espaco && e.isEmpty) { gt.destroySlots([espaco]); fim(true); }
      });
      gt.enableServices();
      gt.display(espaco);
    });
  });
}
