// Inicialização comum a todas as páginas de todos os sites.

import { iniciarConsentimento, reverConsentimento } from './consentimento.js';
import { prepararBanners } from './anuncios.js';
import { hojeEmBrasilia } from './dia.js';
import { criarProgresso } from './progresso.js';

/** Atualiza o contador de sequência do cabeçalho. */
export function atualizarSequenciaDoCabecalho() {
  const el = document.querySelector('[data-sequencia-cabecalho]');
  if (!el || !window.SITE) return;
  const { sequencia } = criarProgresso(window.SITE.id).estatisticas(hojeEmBrasilia());
  el.querySelector('[data-numero]').textContent = sequencia;
  el.setAttribute('aria-label', `Sequência de ${sequencia} ${sequencia === 1 ? 'dia' : 'dias'}`);
}

iniciarConsentimento();
prepararBanners();
atualizarSequenciaDoCabecalho();

document.querySelector('[data-rever-cookies]')?.addEventListener('click', reverConsentimento);

// Fora da página do jogo, o botão de progresso leva até ele.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-abrir-progresso]') && !document.getElementById('painel-progresso')) {
    location.href = '/#progresso';
  }
});
