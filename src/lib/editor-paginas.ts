// Editor visual de páginas de PDF, usado pelo "Editar PDF" e pelo "Ocultar informações".
// Mostra as páginas uma embaixo da outra e, por cima de cada uma, uma camada onde a pessoa
// escreve, desenha e coloca imagens. Funciona com mouse, caneta e toque (Pointer Events).
// Só guarda os objetos em pontos (coordenadas da página como aparece na tela, escala 1);
// gravar no PDF fica a cargo de cada ferramenta.
// Os estilos (classes .ep-*) estão em src/components/EditorPaginas.astro.
import { FONTES, ENTRELINHA, caixaDosPontos, simplificarTraco, type Fonte } from './editor-pdf';

export type Ferramenta = 'mover' | 'texto' | 'retangulo' | 'linha' | 'desenho' | 'destaque' | 'tarja';

interface Base { id: number; pagina: number; }
export interface ObjTexto extends Base { tipo: 'texto'; x: number; y: number; texto: string; fonte: Fonte; tamanho: number; negrito: boolean; cor: string; w: number; h: number; }
export interface ObjImagem extends Base { tipo: 'imagem'; x: number; y: number; w: number; h: number; imagem: string; }
export interface ObjRetangulo extends Base { tipo: 'retangulo'; x: number; y: number; w: number; h: number; cor: string; espessura: number; preencher: boolean; }
export interface ObjDestaque extends Base { tipo: 'destaque'; x: number; y: number; w: number; h: number; cor: string; }
export interface ObjTarja extends Base { tipo: 'tarja'; x: number; y: number; w: number; h: number; }
export interface ObjLinha extends Base { tipo: 'linha'; x1: number; y1: number; x2: number; y2: number; cor: string; espessura: number; }
export interface ObjDesenho extends Base { tipo: 'desenho'; pontos: number[]; cor: string; espessura: number; }
export type Objeto = ObjTexto | ObjImagem | ObjRetangulo | ObjDestaque | ObjTarja | ObjLinha | ObjDesenho;
type SemId<T> = T extends Objeto ? Omit<T, 'id'> : never;
export type NovoObjeto = SemId<Objeto>;

export interface Estilo {
  cor: string;
  espessura: number;
  fonte: Fonte;
  tamanho: number;
  negrito: boolean;
  preencher: boolean;
  corDestaque: string;
}

export interface OpcoesEditor {
  raiz: HTMLElement;
  /** Tamanho de cada página na tela, em pontos (escala 1, já girada). */
  paginas: { largura: number; altura: number }[];
  /** Desenha a página `indice` (começa em 0) com a largura pedida, em pixels. */
  desenhar: (indice: number, larguraPx: number) => Promise<HTMLCanvasElement>;
  /** Endereço (object URL) da imagem guardada com esta chave. */
  urlDaImagem?: (chave: string) => string;
  /** Ferramentas permitidas. O padrão é todas. */
  ferramentas?: Ferramenta[];
  estilo?: Partial<Estilo>;
  aoSelecionar?: (o: Objeto | null) => void;
  aoMudar?: () => void;
  /** Texto do rótulo de cada página. */
  rotulo?: (indice: number, total: number) => string;
}

const SVG = 'http://www.w3.org/2000/svg';
const MINIMO = 4; // pontos: menor que isso, o desenho é descartado

function caixa(o: Objeto): { x: number; y: number; w: number; h: number } {
  switch (o.tipo) {
    case 'linha': return { x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2), w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1) };
    case 'desenho': return caixaDosPontos(o.pontos);
    default: return { x: o.x, y: o.y, w: o.w, h: o.h };
  }
}

function deslocar(o: Objeto, dx: number, dy: number): void {
  switch (o.tipo) {
    case 'linha': o.x1 += dx; o.x2 += dx; o.y1 += dy; o.y2 += dy; break;
    case 'desenho': for (let i = 0; i < o.pontos.length; i += 2) { o.pontos[i] += dx; o.pontos[i + 1] += dy; } break;
    default: o.x += dx; o.y += dy;
  }
}

const pct = (v: number, total: number) => `${(v / total) * 100}%`;

export function criarEditor(op: OpcoesEditor) {
  const permitidas = op.ferramentas ?? ['mover', 'texto', 'retangulo', 'linha', 'desenho', 'destaque', 'tarja'];
  const estilo: Estilo = { cor: '#1d4ed8', espessura: 2, fonte: 'helvetica', tamanho: 14, negrito: false, preencher: false, corDestaque: '#ffe14d', ...op.estilo };
  let ferramenta: Ferramenta = 'mover';
  let objetos: Objeto[] = [];
  let proximoId = 1;
  let selecionado: Objeto | null = null;
  let editando: ObjTexto | null = null;
  const historico: string[] = [];
  let ultimaMarca = '';
  const elementos = new Map<number, HTMLElement | SVGSVGElement>();
  let selecao: HTMLElement[] = [];

  // ------------------------------------------------------------------ páginas
  op.raiz.classList.add('ep-paginas');
  op.raiz.innerHTML = '';
  const camadas: HTMLElement[] = [];
  const fundos: HTMLElement[] = [];
  const desenhadas = new Uint8Array(op.paginas.length);
  op.paginas.forEach((p, i) => {
    const pag = document.createElement('div');
    pag.className = 'ep-pagina';
    pag.style.aspectRatio = `${p.largura} / ${p.altura}`;
    pag.dataset.indice = String(i);
    const fundo = document.createElement('div');
    fundo.className = 'ep-fundo';
    const camada = document.createElement('div');
    camada.className = 'ep-camada';
    camada.dataset.indice = String(i);
    const rot = document.createElement('span');
    rot.className = 'ep-rotulo';
    rot.textContent = op.rotulo ? op.rotulo(i, op.paginas.length) : `Página ${i + 1} de ${op.paginas.length}`;
    pag.append(fundo, camada);
    const caixaPag = document.createElement('div');
    caixaPag.className = 'ep-caixa';
    caixaPag.append(pag, rot);
    op.raiz.append(caixaPag);
    camadas.push(camada);
    fundos.push(fundo);
  });

  const k = (i: number) => camadas[i].clientWidth / op.paginas[i].largura || 0;

  const redim = new ResizeObserver(() => {
    camadas.forEach((c, i) => c.style.setProperty('--k', String(k(i))));
    objetos.forEach((o) => desenharObjeto(o));
    desenharSelecao();
  });
  camadas.forEach((c) => redim.observe(c));

  // Desenha as páginas perto da tela e libera a memória das que ficam longe.
  let fila: Promise<unknown> = Promise.resolve();
  let vivo = true;
  const observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      const i = Number((e.target as HTMLElement).dataset.indice);
      if (e.isIntersecting && !desenhadas[i]) {
        desenhadas[i] = 1;
        fila = fila.then(async () => {
          if (!vivo || !desenhadas[i]) return;
          const dens = Math.min(window.devicePixelRatio || 1, 2);
          const canvas = await op.desenhar(i, Math.max(200, Math.round(camadas[i].clientWidth * dens)));
          if (!vivo || !desenhadas[i]) { canvas.width = 0; return; }
          fundos[i].replaceChildren(canvas);
        }).catch(() => { desenhadas[i] = 0; });
      } else if (!e.isIntersecting && desenhadas[i]) {
        desenhadas[i] = 0;
        const c = fundos[i].querySelector('canvas');
        if (c) { c.width = 0; c.height = 0; c.remove(); }
      }
    }
  }, { rootMargin: '900px 0px' });
  op.raiz.querySelectorAll<HTMLElement>('.ep-pagina').forEach((p) => observador.observe(p));

  // ------------------------------------------------------------------ desenho dos objetos
  function novoSvg(o: Objeto): SVGSVGElement {
    const p = op.paginas[o.pagina];
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', `0 0 ${p.largura} ${p.altura}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', `ep-obj ep-forma ep-${o.tipo}`);
    return svg;
  }

  function desenharObjeto(o: Objeto): void {
    const camada = camadas[o.pagina];
    const P = op.paginas[o.pagina];
    let el = elementos.get(o.id);
    if (!el) {
      if (o.tipo === 'texto') {
        el = document.createElement('div');
        el.className = 'ep-obj ep-texto';
        el.spellcheck = false;
      } else if (o.tipo === 'imagem') {
        const img = document.createElement('img');
        img.className = 'ep-obj ep-imagem';
        img.alt = '';
        img.draggable = false;
        img.src = op.urlDaImagem?.(o.imagem) ?? '';
        el = img;
      } else {
        el = novoSvg(o);
      }
      el.dataset.id = String(o.id);
      elementos.set(o.id, el);
      camada.append(el);
    }
    const kk = k(o.pagina) || 1;
    if (o.tipo === 'texto') {
      const d = el as HTMLElement;
      const f = FONTES[o.fonte];
      d.style.left = pct(o.x, P.largura);
      d.style.top = pct(o.y, P.altura);
      d.style.fontFamily = f.css;
      d.style.fontWeight = o.negrito ? '700' : '400';
      d.style.color = o.cor;
      d.style.fontSize = `calc(var(--k, 1) * ${o.tamanho}px)`;
      d.style.lineHeight = String(ENTRELINHA);
      if (editando !== o && d.textContent !== o.texto) d.textContent = o.texto;
      if (kk && d.offsetWidth) { o.w = d.offsetWidth / kk; o.h = d.offsetHeight / kk; }
      else if (!o.w) {
        const linhas = o.texto.split('\n');
        o.w = Math.max(...linhas.map((l) => l.length)) * o.tamanho * 0.55;
        o.h = linhas.length * o.tamanho * ENTRELINHA;
      }
      return;
    }
    if (o.tipo === 'imagem') {
      const d = el as HTMLElement;
      d.style.left = pct(o.x, P.largura); d.style.top = pct(o.y, P.altura);
      d.style.width = pct(o.w, P.largura); d.style.height = pct(o.h, P.altura);
      return;
    }
    const svg = el as SVGSVGElement;
    svg.replaceChildren();
    const forma = (nome: string, attrs: Record<string, string | number>) => {
      const s = document.createElementNS(SVG, nome);
      for (const [a, v] of Object.entries(attrs)) s.setAttribute(a, String(v));
      svg.append(s);
      return s;
    };
    const alvo = Math.max(14 / kk, 4);
    if (o.tipo === 'retangulo') {
      const e = o.espessura;
      forma('rect', { x: o.x + e / 2, y: o.y + e / 2, width: Math.max(o.w - e, 0), height: Math.max(o.h - e, 0),
        fill: o.preencher ? o.cor : 'transparent', stroke: o.cor, 'stroke-width': e, class: 'ep-alvo' });
    } else if (o.tipo === 'destaque') {
      forma('rect', { x: o.x, y: o.y, width: o.w, height: o.h, fill: o.cor, class: 'ep-alvo ep-marca' });
    } else if (o.tipo === 'tarja') {
      forma('rect', { x: o.x, y: o.y, width: o.w, height: o.h, fill: '#000', class: 'ep-alvo' });
    } else if (o.tipo === 'linha') {
      const a = { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2 };
      forma('line', { ...a, stroke: o.cor, 'stroke-width': o.espessura, 'stroke-linecap': 'round' });
      forma('line', { ...a, stroke: 'transparent', 'stroke-width': Math.max(alvo, o.espessura), class: 'ep-alvo' });
    } else if (o.tipo === 'desenho') {
      const p = o.pontos;
      let d = `M${p[0]} ${p[1]}`;
      for (let i = 2; i + 1 < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
      if (p.length === 2) d += `l0.01 0`;
      forma('path', { d, fill: 'none', stroke: o.cor, 'stroke-width': o.espessura, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
      forma('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(alvo, o.espessura), 'stroke-linecap': 'round', class: 'ep-alvo' });
    }
  }

  function removerElemento(id: number) {
    elementos.get(id)?.remove();
    elementos.delete(id);
  }

  function redesenharTudo() {
    for (const id of Array.from(elementos.keys())) removerElemento(id);
    objetos.forEach(desenharObjeto);
    desenharSelecao();
  }

  // ------------------------------------------------------------------ seleção
  function botao(classe: string, rotulo: string, attrs: Record<string, string>) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = classe;
    b.setAttribute('aria-label', rotulo);
    b.title = rotulo;
    for (const [a, v] of Object.entries(attrs)) b.setAttribute(a, v);
    return b;
  }

  function desenharSelecao() {
    selecao.forEach((e) => e.remove());
    selecao = [];
    const o = selecionado;
    if (!o) return;
    const camada = camadas[o.pagina];
    const P = op.paginas[o.pagina];
    const c = caixa(o);
    const moldura = document.createElement('div');
    moldura.className = 'ep-moldura';
    moldura.style.left = pct(c.x, P.largura); moldura.style.top = pct(c.y, P.altura);
    moldura.style.width = pct(c.w, P.largura); moldura.style.height = pct(c.h, P.altura);
    selecao.push(moldura);
    const colocar = (b: HTMLElement, x: number, y: number) => {
      b.style.left = pct(x, P.largura); b.style.top = pct(y, P.altura);
      selecao.push(b);
    };
    if (o.tipo === 'linha') {
      colocar(botao('ep-alca', 'Mover a ponta da linha', { 'data-alca': 'p1' }), o.x1, o.y1);
      colocar(botao('ep-alca', 'Mover a outra ponta da linha', { 'data-alca': 'p2' }), o.x2, o.y2);
    } else {
      colocar(botao('ep-alca ep-canto', 'Mudar o tamanho', { 'data-alca': 'se' }), c.x + c.w, c.y + c.h);
    }
    const apagar = botao('ep-apagar', 'Apagar', { 'data-apagar': '' });
    apagar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    colocar(apagar, c.x + c.w, c.y);
    camada.append(...selecao);
    elementos.forEach((el, id) => el.classList.toggle('ep-ativo', id === o.id));
  }

  function selecionar(o: Objeto | null) {
    if (editando && editando !== o) terminarEdicao();
    selecionado = o;
    elementos.forEach((el, id) => el.classList.toggle('ep-ativo', !!o && id === o.id));
    desenharSelecao();
    op.aoSelecionar?.(o);
  }

  // ------------------------------------------------------------------ histórico
  const foto = () => JSON.stringify(objetos);
  function marcar(chave = '') {
    // Mudanças seguidas do mesmo tipo (arrastar um controle de cor ou tamanho) viram uma só.
    if (chave && chave === ultimaMarca) return;
    ultimaMarca = chave;
    historico.push(foto());
    if (historico.length > 100) historico.shift();
  }
  function mudou() { op.aoMudar?.(); }

  function desfazer() {
    if (editando) terminarEdicao();
    const anterior = historico.pop();
    if (anterior === undefined) return;
    ultimaMarca = '';
    objetos = JSON.parse(anterior);
    const id = selecionado?.id;
    selecionado = objetos.find((o) => o.id === id) ?? null;
    redesenharTudo();
    op.aoSelecionar?.(selecionado);
    mudou();
  }

  function adicionar(novo: NovoObjeto, comHistorico = true): Objeto {
    if (comHistorico) marcar();
    const o = { ...novo, id: proximoId++ } as Objeto;
    objetos.push(o);
    desenharObjeto(o);
    mudou();
    return o;
  }

  function remover(o: Objeto, comHistorico = true) {
    if (comHistorico) marcar();
    objetos = objetos.filter((x) => x !== o);
    removerElemento(o.id);
    if (selecionado === o) selecionar(null);
    mudou();
  }

  // ------------------------------------------------------------------ edição de texto
  function editar(o: ObjTexto, tudo = false) {
    const el = elementos.get(o.id) as HTMLElement | undefined;
    if (!el) return;
    if (editando !== o) { marcar(); ultimaMarca = ''; }
    editando = o;
    // "plaintext-only" evita colar texto formatado; navegadores antigos não conhecem e dão erro.
    try { el.contentEditable = 'plaintext-only'; } catch { /* segue abaixo */ }
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.classList.add('ep-editando');
    el.focus({ preventScroll: true });
    const r = document.createRange();
    r.selectNodeContents(el);
    if (!tudo) r.collapse(false);
    const s = getSelection();
    s?.removeAllRanges(); s?.addRange(r);
  }

  function terminarEdicao() {
    const o = editando;
    if (!o) return;
    editando = null;
    const el = elementos.get(o.id) as HTMLElement | undefined;
    if (el) { el.contentEditable = 'false'; el.classList.remove('ep-editando'); }
    o.texto = (el?.innerText ?? o.texto).replace(/\n$/, '');
    if (!o.texto.trim()) {
      remover(o, false);
      // Um texto novo apagado sem nada não deixa rastro no histórico.
      historico.pop();
    } else {
      if (historico[historico.length - 1] === foto()) historico.pop();
      desenharObjeto(o);
      desenharSelecao();
    }
    mudou();
  }

  // ------------------------------------------------------------------ ponteiro
  type Arrasto =
    | { tipo: 'mover'; o: Objeto; u: number; v: number; antes: Objeto; mexeu: boolean; jaSelecionado: boolean; antesFoto: string }
    | { tipo: 'alca'; o: Objeto; alca: string; u: number; v: number; antes: Objeto; antesFoto: string }
    | { tipo: 'criar'; o: Objeto; u: number; v: number; antesFoto: string }
    | { tipo: 'texto'; u: number; v: number };
  let arrasto: Arrasto | null = null;
  let ponteiro = -1;

  function ponto(e: PointerEvent, i: number): [number, number] {
    const r = camadas[i].getBoundingClientRect();
    const P = op.paginas[i];
    return [((e.clientX - r.left) / r.width) * P.largura, ((e.clientY - r.top) / r.height) * P.altura];
  }

  const limitar = (v: number, a: number, b: number) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));

  function aoApertar(e: PointerEvent) {
    if (e.button !== 0 || arrasto) return;
    const camada = e.currentTarget as HTMLElement;
    const i = Number(camada.dataset.indice);
    const alvo = e.target as Element;
    if (alvo.closest('[data-apagar]')) return; // o clique cuida
    const [u, v] = ponto(e, i);

    const alca = alvo.closest<HTMLElement>('[data-alca]');
    if (alca && selecionado) {
      e.preventDefault();
      arrasto = { tipo: 'alca', o: selecionado, alca: alca.dataset.alca!, u, v, antes: structuredClone(selecionado), antesFoto: foto() };
    } else if (ferramenta === 'mover') {
      const el = alvo.closest<HTMLElement | SVGElement>('[data-id]');
      const o = el ? objetos.find((x) => x.id === Number(el.dataset.id)) : undefined;
      if (!o) { if (selecionado) selecionar(null); return; }
      if (editando === o) return; // deixa o cursor do texto funcionar
      e.preventDefault();
      const ja = selecionado === o;
      if (!ja) selecionar(o);
      arrasto = { tipo: 'mover', o, u, v, antes: structuredClone(o), mexeu: false, jaSelecionado: ja, antesFoto: foto() };
    } else if (ferramenta === 'texto') {
      e.preventDefault();
      arrasto = { tipo: 'texto', u, v };
    } else {
      e.preventDefault();
      if (editando) terminarEdicao();
      const antesFoto = foto();
      let novo: NovoObjeto;
      if (ferramenta === 'linha') novo = { tipo: 'linha', pagina: i, x1: u, y1: v, x2: u, y2: v, cor: estilo.cor, espessura: estilo.espessura };
      else if (ferramenta === 'desenho') novo = { tipo: 'desenho', pagina: i, pontos: [u, v], cor: estilo.cor, espessura: estilo.espessura };
      else if (ferramenta === 'destaque') novo = { tipo: 'destaque', pagina: i, x: u, y: v, w: 0, h: 0, cor: estilo.corDestaque };
      else if (ferramenta === 'tarja') novo = { tipo: 'tarja', pagina: i, x: u, y: v, w: 0, h: 0 };
      else novo = { tipo: 'retangulo', pagina: i, x: u, y: v, w: 0, h: 0, cor: estilo.cor, espessura: estilo.espessura, preencher: estilo.preencher };
      selecionar(null);
      const o = adicionar(novo, false);
      arrasto = { tipo: 'criar', o, u, v, antesFoto };
    }
    ponteiro = e.pointerId;
    try { camada.setPointerCapture(e.pointerId); } catch { /* sem captura, segue igual */ }
  }

  function aoMover(e: PointerEvent) {
    if (!arrasto || e.pointerId !== ponteiro || arrasto.tipo === 'texto') return;
    const o = arrasto.o;
    const P = op.paginas[o.pagina];
    let [u, v] = ponto(e, o.pagina);
    u = limitar(u, 0, P.largura); v = limitar(v, 0, P.altura);
    const du = u - arrasto.u, dv = v - arrasto.v;

    if (arrasto.tipo === 'mover') {
      if (!arrasto.mexeu && Math.hypot(du, dv) * (k(o.pagina) || 1) < 3) return;
      arrasto.mexeu = true;
      const a = arrasto.antes;
      const c = caixa(a);
      const dx = limitar(c.x + du, 0, P.largura - c.w) - c.x;
      const dy = limitar(c.y + dv, 0, P.altura - c.h) - c.y;
      Object.assign(o, structuredClone(a));
      deslocar(o, dx, dy);
    } else if (arrasto.tipo === 'alca') {
      const a = arrasto.antes;
      if (o.tipo === 'linha' && a.tipo === 'linha') {
        if (arrasto.alca === 'p1') { o.x1 = u; o.y1 = v; } else { o.x2 = u; o.y2 = v; }
      } else if (o.tipo === 'texto' && a.tipo === 'texto') {
        const f = Math.max((a.h + dv) / a.h, (a.w + du) / a.w);
        o.tamanho = Math.round(limitar(a.tamanho * f, 6, 160) * 2) / 2;
        estilo.tamanho = o.tamanho;
        op.aoSelecionar?.(o);
      } else if (o.tipo === 'desenho' && a.tipo === 'desenho') {
        const c = caixaDosPontos(a.pontos);
        const sx = c.w > 1 ? Math.max(c.w + du, 4) / c.w : 1;
        const sy = c.h > 1 ? Math.max(c.h + dv, 4) / c.h : 1;
        o.pontos = a.pontos.map((p, idx) => (idx % 2 ? c.y + (p - c.y) * sy : c.x + (p - c.x) * sx));
      } else if (o.tipo === 'imagem' && a.tipo === 'imagem') {
        const f = Math.max(Math.max(a.w + du, 8) / a.w, Math.max(a.h + dv, 8) / a.h);
        const fMax = Math.min((P.largura - a.x) / a.w, (P.altura - a.y) / a.h);
        o.w = a.w * Math.min(f, fMax); o.h = a.h * Math.min(f, fMax);
      } else if ('w' in o && 'w' in a) {
        o.w = limitar(a.w + du, MINIMO, P.largura - a.x);
        o.h = limitar(a.h + dv, MINIMO, P.altura - a.y);
      }
    } else if (arrasto.tipo === 'criar') {
      if (o.tipo === 'linha') { o.x2 = u; o.y2 = v; }
      else if (o.tipo === 'desenho') {
        const n = o.pontos.length;
        if (Math.hypot(u - o.pontos[n - 2], v - o.pontos[n - 1]) * (k(o.pagina) || 1) >= 1.5) o.pontos.push(u, v);
      } else if ('w' in o) {
        o.x = Math.min(arrasto.u, u); o.y = Math.min(arrasto.v, v);
        o.w = Math.abs(u - arrasto.u); o.h = Math.abs(v - arrasto.v);
      }
    }
    desenharObjeto(o);
    desenharSelecao();
  }

  function aoSoltar(e: PointerEvent) {
    if (!arrasto || e.pointerId !== ponteiro) return;
    const a = arrasto;
    arrasto = null;
    ponteiro = -1;
    if (a.tipo === 'texto') {
      const i = Number((e.currentTarget as HTMLElement).dataset.indice);
      const P = op.paginas[i];
      const t = estilo.tamanho;
      const o = adicionar({ tipo: 'texto', pagina: i, x: limitar(a.u, 0, P.largura - t * 3), y: limitar(a.v - t * 0.6, 0, P.altura - t * ENTRELINHA),
        texto: 'Texto', fonte: estilo.fonte, tamanho: t, negrito: estilo.negrito, cor: estilo.cor, w: 0, h: 0 }) as ObjTexto;
      definirFerramenta('mover');
      selecionar(o);
      editar(o, true);
      return;
    }
    const o = a.o;
    if (a.tipo === 'criar') {
      const c = caixa(o);
      if (o.tipo === 'linha' ? Math.hypot(c.w, c.h) < MINIMO : o.tipo !== 'desenho' && Math.max(c.w, c.h) < MINIMO) { remover(o, false); return; }
      if (o.tipo === 'desenho') o.pontos = simplificarTraco(o.pontos, 0.35);
      else if ('h' in o) {
        // Um arrasto quase reto vira uma faixa fina, mas visível (marca-texto e tarja de uma linha).
        const minimo = o.tipo === 'retangulo' ? MINIMO : 10;
        if (o.h < minimo) { o.y = Math.max(0, o.y + o.h / 2 - minimo / 2); o.h = minimo; }
        if (o.w < minimo) { o.x = Math.max(0, o.x + o.w / 2 - minimo / 2); o.w = minimo; }
      }
      historico.push(a.antesFoto); ultimaMarca = '';
      desenharObjeto(o);
      if (o.tipo === 'retangulo' || o.tipo === 'linha') selecionar(o);
      mudou();
      return;
    }
    if (a.tipo === 'mover' && !a.mexeu) {
      if (a.jaSelecionado && o.tipo === 'texto') editar(o);
      return;
    }
    if (a.antesFoto !== foto()) { historico.push(a.antesFoto); ultimaMarca = ''; mudou(); }
  }

  function aoCancelar(e: PointerEvent) {
    if (!arrasto || e.pointerId !== ponteiro) return;
    const a = arrasto;
    arrasto = null;
    if (a.tipo === 'criar') remover(a.o, false);
    else if (a.tipo !== 'texto') { Object.assign(a.o, a.antes); desenharObjeto(a.o); desenharSelecao(); }
  }

  function aoClicar(e: MouseEvent) {
    const b = (e.target as Element).closest('[data-apagar]');
    if (b && selecionado) { e.preventDefault(); remover(selecionado); }
  }

  function aoDigitar(e: Event) {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.ep-texto');
    if (!el || !editando || elementos.get(editando.id) !== el) return;
    editando.texto = el.innerText.replace(/\n$/, '');
    const kk = k(editando.pagina);
    if (kk) { editando.w = el.offsetWidth / kk; editando.h = el.offsetHeight / kk; }
    desenharSelecao();
    mudou();
  }

  function aoSairDoTexto(e: FocusEvent) {
    const el = e.target as HTMLElement;
    if (editando && elementos.get(editando.id) === el) terminarEdicao();
  }

  camadas.forEach((c) => {
    c.addEventListener('pointerdown', aoApertar);
    c.addEventListener('pointermove', aoMover);
    c.addEventListener('pointerup', aoSoltar);
    c.addEventListener('pointercancel', aoCancelar);
    c.addEventListener('click', aoClicar);
    c.addEventListener('input', aoDigitar);
    c.addEventListener('focusout', aoSairDoTexto);
  });

  function aoTeclar(e: KeyboardEvent) {
    const foco = document.activeElement as HTMLElement | null;
    const digitando = !!foco && (foco.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(foco.tagName));
    if (editando) {
      if (e.key === 'Escape') { e.preventDefault(); (elementos.get(editando.id) as HTMLElement)?.blur(); }
      return;
    }
    if (digitando) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      if (historico.length) { e.preventDefault(); desfazer(); }
      return;
    }
    if (!selecionado) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remover(selecionado); }
    else if (e.key === 'Escape') selecionar(null);
    else if (e.key === 'Enter' && selecionado.tipo === 'texto') { e.preventDefault(); editar(selecionado); }
    else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const passo = e.shiftKey ? 10 : 1;
      marcar(`seta-${selecionado.id}`);
      deslocar(selecionado, e.key === 'ArrowLeft' ? -passo : e.key === 'ArrowRight' ? passo : 0, e.key === 'ArrowUp' ? -passo : e.key === 'ArrowDown' ? passo : 0);
      desenharObjeto(selecionado); desenharSelecao(); mudou();
    }
  }
  document.addEventListener('keydown', aoTeclar);

  // ------------------------------------------------------------------ API
  function definirFerramenta(f: Ferramenta) {
    if (!permitidas.includes(f)) return;
    ferramenta = f;
    if (f !== 'mover') selecionar(null);
    camadas.forEach((c) => {
      c.classList.toggle('ep-desenhando', f !== 'mover');
      c.dataset.ferramenta = f;
    });
  }

  function definirEstilo(parcial: Partial<Estilo>) {
    Object.assign(estilo, parcial);
    const o = selecionado;
    if (!o) return;
    const chave = `estilo-${o.id}-${Object.keys(parcial).join()}`;
    let mexeu = false;
    const por = <T extends Objeto>(obj: T, campo: keyof T, valor: unknown) => {
      if (valor === undefined || obj[campo] === valor) return;
      if (!mexeu) marcar(chave);
      mexeu = true;
      (obj as Record<keyof T, unknown>)[campo] = valor;
    };
    if (o.tipo === 'texto') {
      por(o, 'cor', parcial.cor); por(o, 'fonte', parcial.fonte); por(o, 'tamanho', parcial.tamanho); por(o, 'negrito', parcial.negrito);
    } else if (o.tipo === 'retangulo') {
      por(o, 'cor', parcial.cor); por(o, 'espessura', parcial.espessura); por(o, 'preencher', parcial.preencher);
    } else if (o.tipo === 'linha' || o.tipo === 'desenho') {
      por(o, 'cor', parcial.cor); por(o, 'espessura', parcial.espessura);
    } else if (o.tipo === 'destaque') {
      por(o, 'cor', parcial.corDestaque);
    }
    if (mexeu) { desenharObjeto(o); desenharSelecao(); mudou(); }
  }

  /** Índice da página que está no meio da tela (ou a mais perto dele). */
  function paginaVisivel(): number {
    const meio = window.innerHeight / 2;
    let melhor = 0, dist = Infinity;
    camadas.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      const d = r.top <= meio && r.bottom >= meio ? 0 : Math.min(Math.abs(r.top - meio), Math.abs(r.bottom - meio));
      if (d < dist) { dist = d; melhor = i; }
    });
    return melhor;
  }

  /** Coloca uma imagem no meio da página visível, com até metade da largura e da altura dela. */
  function adicionarImagem(chave: string, larguraPx: number, alturaPx: number): Objeto {
    const i = paginaVisivel();
    const P = op.paginas[i];
    const f = Math.min((P.largura * 0.5) / larguraPx, (P.altura * 0.5) / alturaPx);
    const w = larguraPx * f, h = alturaPx * f;
    definirFerramenta('mover');
    const o = adicionar({ tipo: 'imagem', pagina: i, x: (P.largura - w) / 2, y: (P.altura - h) / 2, w, h, imagem: chave });
    selecionar(o);
    return o;
  }

  function destruir() {
    vivo = false;
    observador.disconnect();
    redim.disconnect();
    document.removeEventListener('keydown', aoTeclar);
    fundos.forEach((f) => f.querySelectorAll('canvas').forEach((c) => { c.width = 0; c.height = 0; }));
    op.raiz.innerHTML = '';
  }

  definirFerramenta('mover');

  return {
    get ferramenta() { return ferramenta; },
    get estilo() { return { ...estilo }; },
    get selecionado() { return selecionado; },
    get podeDesfazer() { return historico.length > 0; },
    /** Os objetos na ordem em que foram criados (a mesma ordem de desenho). */
    objetos: () => { if (editando) { const el = elementos.get(editando.id) as HTMLElement; editando.texto = el.innerText.replace(/\n$/, ''); } return objetos.filter((o) => o.tipo !== 'texto' || o.texto.trim()); },
    definirFerramenta,
    definirEstilo,
    adicionar,
    adicionarImagem,
    remover: (o: Objeto) => remover(o),
    apagarSelecionado: () => { if (selecionado) remover(selecionado); },
    selecionar,
    desfazer,
    terminarEdicao,
    paginaVisivel,
    /** Elemento da página (para rolar até ela). */
    pagina: (i: number) => camadas[i]?.parentElement ?? null,
    destruir,
  };
}

export type Editor = ReturnType<typeof criarEditor>;
