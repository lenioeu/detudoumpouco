// Peças de interface comuns aos cinco jogos.

import { formatarRelogio, msAteAmanha } from './dia.js';

export const icones = {
  chama: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5.5C10 9.5 11 11 12 11c0-3-1.5-5 0-9z" fill="var(--cor)" stroke="var(--tinta)" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  chamaGrande: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5.5C10 9.5 11 11 12 11c0-3-1.5-5 0-9z" fill="var(--cor)" stroke="var(--tinta)" stroke-width="1.4" stroke-linejoin="round"/><path d="M12 14c.6 1.6 2 2.2 2 3.8a2 2 0 0 1-4 0c0-1.2.9-1.8 2-3.8z" fill="#fff" stroke="var(--tinta)" stroke-width="1" stroke-linejoin="round"/></svg>',
  certo: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  fechar: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  compartilhar: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
  anuncio: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" fill="currentColor"/><path d="M10 8.5v7l6-3.5z" fill="var(--papel)"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" fill="currentColor"/></svg>',
  cadeado: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="12" rx="2" fill="currentColor"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>',
};

export function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Abre um <dialog class="painel">. Fecha no botão [data-fechar], no Esc e ao tocar fora. */
export function abrirPainel(painel) {
  if (painel.open) return;
  if (!painel.dataset.preparado) {
    painel.dataset.preparado = '1';
    painel.addEventListener('click', (e) => {
      if (e.target === painel || e.target.closest('[data-fechar]')) painel.close();
    });
  }
  painel.showModal();
}

let recadoAtual = null;
/** Mensagem curta no topo da tela. */
export function recado(texto, duracao = 2200) {
  recadoAtual?.remove();
  const el = document.createElement('div');
  el.className = 'recado';
  el.setAttribute('role', 'status');
  el.textContent = texto;
  document.body.append(el);
  recadoAtual = el;
  setTimeout(() => el.remove(), duracao);
}

/** Compartilha pelo menu do celular ou copia o texto. */
export async function compartilhar(texto) {
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text: texto });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(texto);
    recado('Resultado copiado. É só colar no grupo!');
  } catch {
    recado('Não consegui copiar. Tente de novo.');
  }
}

/** Mantém um relógio regressivo até o próximo jogo. */
export function iniciarContagem(el) {
  const atualizar = () => {
    const ms = msAteAmanha();
    el.textContent = formatarRelogio(ms);
    if (ms <= 0) location.reload();
  };
  atualizar();
  return setInterval(atualizar, 1000);
}

const LETRAS_SEMANA = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

/** Bloco de sequência com a semana marcada. */
export function htmlSequencia(est) {
  const dias = est.semana.map((d, i) => {
    const classe = d.hoje && d.jogou ? 'hoje' : d.jogou ? 'jogou' : '';
    const nome = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${d.dia}T12:00:00Z`));
    const estado = d.jogou ? 'jogou' : d.futuro ? 'ainda não chegou' : 'não jogou';
    return `<div class="${classe}"><span aria-hidden="true">${LETRAS_SEMANA[i]}</span><i title="${nome}: ${estado}">${d.jogou ? icones.certo : ''}</i><span class="visualmente-oculto">${nome}: ${estado}</span></div>`;
  }).join('');
  const dias1 = est.sequencia === 1 ? 'dia seguido' : 'dias seguidos';
  return `
    <div class="sequencia">
      <div class="sequencia__topo">
        ${icones.chamaGrande}
        <div>
          <strong>${est.sequencia} ${dias1}</strong>
          <span>Seu recorde é de ${est.melhorSequencia} ${est.melhorSequencia === 1 ? 'dia' : 'dias'}</span>
        </div>
      </div>
      <div class="semana">${dias}</div>
      <p style="margin:0">Volte amanhã para chegar a <strong>${est.sequencia + 1} dias</strong>.</p>
    </div>`;
}

/**
 * Conteúdo do painel "Seu progresso".
 * `faixas` = [{ rotulo, testa: (valor) => boolean }], de cima para baixo.
 */
export function htmlProgresso(est, { mediaRotulo, formatarMedia, faixas, tituloDistribuicao, valorHoje }) {
  const contagens = faixas.map((f) => est.valores.filter(f.testa).length);
  const maior = Math.max(1, ...contagens);
  const linhas = faixas.map((f, i) => {
    const hoje = valorHoje !== null && valorHoje !== undefined && f.testa(valorHoje);
    const largura = Math.max(8, Math.round((contagens[i] / maior) * 100));
    return `
      <div class="distribuicao__linha">
        <span class="distribuicao__rotulo">${f.rotulo}</span>
        <span class="distribuicao__barra${hoje ? ' hoje' : ''}" style="width:${largura}%">
          ${hoje ? '<span>hoje</span>' : ''}<span>${contagens[i]}</span>
        </span>
      </div>`;
  }).join('');
  return `
    <div class="numeros">
      <div><strong>${est.jogos}</strong><span>jogos</span></div>
      <div><strong>${formatarMedia(est.media)}</strong><span>${mediaRotulo}</span></div>
      <div class="destaque"><strong>${est.sequencia}</strong><span>dias seguidos</span></div>
      <div><strong>${est.melhorSequencia}</strong><span>melhor sequência</span></div>
    </div>
    <div class="distribuicao">
      <h3>${tituloDistribuicao}</h3>
      ${linhas}
    </div>`;
}
