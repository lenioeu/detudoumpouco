// Cartão de um arquivo numa lista ordenável (componente GradeArquivos):
// miniatura, número da posição, nome, detalhe e botões de mover, girar e remover.
// Os botões têm data-acao; a página escuta os cliques na lista inteira.

const ICONES = {
  alca: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  antes: '<path d="m15 18-6-6 6-6"/>',
  depois: '<path d="m9 18 6-6-6-6"/>',
  girar: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  remover: '<path d="M18 6 6 18M6 6l12 12"/>',
};

function botao(acao: keyof typeof ICONES, rotulo: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'acao';
  b.setAttribute('aria-label', rotulo);
  b.title = rotulo;
  if (acao === 'alca') b.dataset.alca = '';
  else b.dataset.acao = acao;
  b.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${acao === 'alca' ? 3.2 : 2.2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[acao]}</svg>`;
  return b;
}

export interface Cartao { li: HTMLLIElement; mini: HTMLElement; detalhe: HTMLElement; numero: HTMLElement; }

export function criarCartao(id: string, nome: string, opcoes: { girar?: boolean } = {}): Cartao {
  const li = document.createElement('li');
  li.dataset.id = id;
  const mini = document.createElement('div'); mini.className = 'mini';
  const numero = document.createElement('span'); numero.className = 'numero';
  mini.append(numero);
  const n = document.createElement('span'); n.className = 'nome'; n.textContent = nome; n.title = nome;
  const detalhe = document.createElement('span'); detalhe.className = 'detalhe muted'; detalhe.textContent = 'Abrindo…';
  const acoes = document.createElement('div'); acoes.className = 'acoes';
  acoes.append(botao('alca', 'Arrastar para mudar a ordem'), botao('antes', 'Mover para antes'), botao('depois', 'Mover para depois'));
  if (opcoes.girar) acoes.append(botao('girar', 'Girar 90 graus'));
  acoes.append(botao('remover', `Tirar ${nome} da lista`));
  li.append(mini, n, detalhe, acoes);
  return { li, mini, detalhe, numero };
}

/** Atualiza o número de posição de cada cartão (1, 2, 3...) depois de mudar a ordem. */
export function numerar(lista: HTMLElement): void {
  Array.from(lista.children).forEach((li, i) => {
    const n = li.querySelector('.numero');
    if (n) n.textContent = String(i + 1);
  });
}
