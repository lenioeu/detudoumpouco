// Lista que muda de ordem arrastando (mouse, dedo ou caneta) e com animação suave.
// Cada item da lista precisa de um data-id único. No celular o arrasto começa só pela
// alça ([data-alca]), para não atrapalhar a rolagem da página; no computador, pelo item inteiro.
// Movimento só com transform, e nada de animação para quem pediu menos movimento.

const CURVA = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const poucoMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Muda a lista com `mudar()` e anima cada item (pelo data-id) da posição antiga até a nova. */
export function animarTroca(lista: HTMLElement, mudar: () => void, ignorar?: Element): void {
  const antes = new Map<string, DOMRect>();
  for (const el of Array.from(lista.children) as HTMLElement[]) {
    if (el.dataset.id) antes.set(el.dataset.id, el.getBoundingClientRect());
  }
  mudar();
  if (poucoMovimento()) return;
  for (const el of Array.from(lista.children) as HTMLElement[]) {
    if (el === ignorar) continue;
    const r0 = antes.get(el.dataset.id ?? '');
    if (!r0) continue;
    const r1 = el.getBoundingClientRect();
    const dx = r0.left - r1.left, dy = r0.top - r1.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 250, easing: CURVA });
    }
  }
}

/** Move o item `de` para a posição `para` (mesma regra usada pelos arrays das páginas). */
export function mover<T>(lista: T[], de: number, para: number): T[] {
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

/**
 * Liga o arrastar-para-ordenar em `lista`. Quando a pessoa solta o item numa nova posição,
 * a ordem dos elementos já está trocada e `aoMover(de, para)` é chamado para atualizar os dados.
 */
export function ordenavel(lista: HTMLElement, aoMover: (de: number, para: number) => void): void {
  lista.addEventListener('pointerdown', (e) => {
    const alvo = e.target as HTMLElement;
    const item = alvo.closest<HTMLElement>('[data-id]');
    if (!item || item.parentElement !== lista || e.button !== 0) return;
    const pelaAlca = !!alvo.closest('[data-alca]');
    if (!pelaAlca && (e.pointerType !== 'mouse' || alvo.closest('button, a, input, select, label'))) return;
    e.preventDefault();

    const itens = () => Array.from(lista.children) as HTMLElement[];
    const de = itens().indexOf(item);
    const r = item.getBoundingClientRect();
    // Posições em coordenadas da página, para a rolagem durante o arrasto não atrapalhar.
    const origem = { x: r.left + scrollX, y: r.top + scrollY };
    const inicio = { x: e.pageX, y: e.pageY };
    let desloc = { x: 0, y: 0 };
    let ultimo = { x: e.pageX, y: e.pageY };
    let mexeu = false;

    const posicionar = () => {
      const atual = item.getBoundingClientRect();
      const layout = { x: atual.left + scrollX - desloc.x, y: atual.top + scrollY - desloc.y };
      desloc = { x: origem.x + (ultimo.x - inicio.x) - layout.x, y: origem.y + (ultimo.y - inicio.y) - layout.y };
      item.style.transform = `translate(${desloc.x}px, ${desloc.y}px) scale(1.03)`;
    };

    const mexer = (ev: PointerEvent) => {
      ultimo = { x: ev.pageX, y: ev.pageY };
      if (!mexeu) {
        if (Math.hypot(ultimo.x - inicio.x, ultimo.y - inicio.y) < 4) return;
        mexeu = true;
        item.classList.add('arrastando');
      }
      // Rola a página quando o dedo chega perto da borda da tela.
      if (ev.clientY < 60) scrollBy(0, -14);
      else if (ev.clientY > innerHeight - 60) scrollBy(0, 14);

      const sobre = itens().find((outro) => {
        // Quem ainda está se movendo fica de fora: evita que dois itens fiquem trocando de lugar sem parar.
        if (outro === item || outro.getAnimations().length) return false;
        const o = outro.getBoundingClientRect();
        return ev.clientX >= o.left && ev.clientX <= o.right && ev.clientY >= o.top && ev.clientY <= o.bottom;
      });
      if (sobre) {
        const lista_ = itens();
        const iAlvo = lista_.indexOf(sobre), iItem = lista_.indexOf(item);
        animarTroca(lista, () => lista.insertBefore(item, iAlvo > iItem ? sobre.nextSibling : sobre), item);
      }
      posicionar();
    };

    const soltar = () => {
      item.removeEventListener('pointermove', mexer);
      item.removeEventListener('pointerup', soltar);
      item.removeEventListener('pointercancel', soltar);
      item.classList.remove('arrastando');
      const final = desloc;
      item.style.transform = '';
      if (mexeu && !poucoMovimento()) {
        item.animate([{ transform: `translate(${final.x}px, ${final.y}px) scale(1.03)` }, { transform: 'none' }], { duration: 220, easing: CURVA });
      }
      const para = itens().indexOf(item);
      if (para !== de) aoMover(de, para);
    };

    item.setPointerCapture(e.pointerId);
    item.addEventListener('pointermove', mexer);
    item.addEventListener('pointerup', soltar);
    item.addEventListener('pointercancel', soltar);
  });
}
