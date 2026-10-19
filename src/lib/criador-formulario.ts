// Editor do "Criar formulário PDF": mostra as páginas uma embaixo da outra e, por cima de cada uma,
// uma camada onde a pessoa coloca, move e redimensiona campos. Mouse, caneta e toque (Pointer Events).
// Usa a mesma estrutura e os mesmos estilos de página do editor do "Editar PDF"
// (classes .ep-* de src/components/EditorPaginas.astro); os estilos dos campos (.cf-*) ficam na página.
// Só guarda os campos em pontos (coordenadas de tela, escala 1); gravar fica em src/lib/formulario-pdf.ts.
import { ENTRELINHA } from './editor-pdf';
import {
  DICA_DATA, LADO_MARCAR, PASSO_OPCAO, TAMANHO_DICA, nomeDaCopia, proximaOpcao, proximoNome, tamanhoLegenda, tamanhoPadrao,
  type Campo, type TipoCampo,
} from './formulario-pdf';

export type FerramentaForm = 'mover' | 'texto' | 'paragrafo' | 'marcar' | 'opcao' | 'lista' | 'data' | 'rotulo';

export interface CampoExistente { pagina: number; x: number; y: number; w: number; h: number; nome: string; }

export interface OpcoesCriador {
  raiz: HTMLElement;
  /** Tamanho de cada página na tela, em pontos (escala 1, já girada). */
  paginas: { largura: number; altura: number }[];
  /** Desenha a página `indice` com a largura pedida, em pixels. */
  desenhar: (indice: number, larguraPx: number) => Promise<HTMLCanvasElement>;
  /** Campos que o PDF já tinha: aparecem tracejados e não mudam. */
  existentes?: CampoExistente[];
  /** Começar com "escrever o nome da opção ao lado" ligado (bom para página em branco). */
  escreverOpcoes?: boolean;
  aoSelecionar?: (c: Campo | null) => void;
  aoMudar?: () => void;
}

const MINIMO = 8; // pontos: menor caixa que um campo pode ter
const pct = (v: number, total: number) => `${(v / total) * 100}%`;
const limitar = (v: number, a: number, b: number) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7"/></svg>';
const SETA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';

export function criarCriador(op: OpcoesCriador) {
  const paginas = op.paginas.map((p) => ({ ...p }));
  const existentes = op.existentes ?? [];
  let ferramenta: FerramentaForm = 'mover';
  let campos: Campo[] = [];
  let proximoId = 1;
  let proximoGrupo = 1;
  let selecionado: Campo | null = null;
  const historico: string[] = [];
  let ultimaMarca = '';
  const elementos = new Map<number, HTMLElement>();
  let selecao: HTMLElement[] = [];
  let vivo = true;

  // ------------------------------------------------------------------ páginas
  op.raiz.classList.add('ep-paginas');
  op.raiz.innerHTML = '';
  const camadas: HTMLElement[] = [];
  const fundos: HTMLElement[] = [];
  const desenhadas: boolean[] = [];
  let fila: Promise<unknown> = Promise.resolve();

  const k = (i: number) => camadas[i].clientWidth / paginas[i].largura || 0;
  const redim = new ResizeObserver(() => {
    camadas.forEach((c, i) => c.style.setProperty('--k', String(k(i))));
    campos.forEach((c) => { if (c.tipo === 'rotulo') desenharCampo(c); });
    desenharSelecao();
  });
  const observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      const i = Number((e.target as HTMLElement).dataset.indice);
      if (e.isIntersecting && !desenhadas[i]) {
        desenhadas[i] = true;
        fila = fila.then(async () => {
          if (!vivo || !desenhadas[i]) return;
          const dens = Math.min(window.devicePixelRatio || 1, 2);
          const canvas = await op.desenhar(i, Math.max(200, Math.round(camadas[i].clientWidth * dens)));
          if (!vivo || !desenhadas[i]) { canvas.width = 0; return; }
          fundos[i].replaceChildren(canvas);
        }).catch(() => { desenhadas[i] = false; });
      } else if (!e.isIntersecting && desenhadas[i]) {
        desenhadas[i] = false;
        const c = fundos[i].querySelector('canvas');
        if (c) { c.width = 0; c.height = 0; c.remove(); }
      }
    }
  }, { rootMargin: '900px 0px' });

  function criarPagina(i: number) {
    const p = paginas[i];
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
    pag.append(fundo, camada);
    const caixaPag = document.createElement('div');
    caixaPag.className = 'ep-caixa';
    caixaPag.append(pag, rot);
    op.raiz.append(caixaPag);
    camadas[i] = camada;
    fundos[i] = fundo;
    desenhadas[i] = false;
    for (const ex of existentes) {
      if (ex.pagina !== i) continue;
      const d = document.createElement('div');
      d.className = 'cf-existente';
      d.style.left = pct(ex.x, p.largura); d.style.top = pct(ex.y, p.altura);
      d.style.width = pct(ex.w, p.largura); d.style.height = pct(ex.h, p.altura);
      d.title = `Campo que o PDF já tinha: ${ex.nome}`;
      camada.append(d);
    }
    camada.addEventListener('pointerdown', aoApertar);
    camada.addEventListener('pointermove', aoMover);
    camada.addEventListener('pointerup', aoSoltar);
    camada.addEventListener('pointercancel', aoCancelar);
    camada.addEventListener('click', aoClicar);
    camada.classList.toggle('ep-desenhando', ferramenta !== 'mover');
    camada.dataset.ferramenta = ferramenta;
    redim.observe(camada);
    observador.observe(pag);
  }

  function rotularPaginas() {
    op.raiz.querySelectorAll<HTMLElement>('.ep-rotulo').forEach((r, i) => { r.textContent = `Página ${i + 1} de ${paginas.length}`; });
  }

  // ------------------------------------------------------------------ desenho dos campos
  function desenharCampo(c: Campo): void {
    const P = paginas[c.pagina];
    let el = elementos.get(c.id);
    if (!el || el.dataset.tipo !== c.tipo || el.parentElement !== camadas[c.pagina]) {
      el?.remove();
      el = document.createElement('div');
      el.dataset.id = String(c.id);
      el.dataset.tipo = c.tipo;
      elementos.set(c.id, el);
      camadas[c.pagina].append(el);
    }
    el.className = `ep-obj cf-campo cf-${c.tipo}${c.tipo === 'texto' && c.multilinha ? ' cf-multi' : ''}${selecionado?.id === c.id ? ' ep-ativo' : ''}`;
    el.style.left = pct(c.x, P.largura);
    el.style.top = pct(c.y, P.altura);
    const tam = (n: number) => `calc(var(--k, 1) * ${n}px)`;
    el.title = c.tipo === 'rotulo' ? 'Rótulo' : c.tipo === 'opcao' ? `${c.nome} · ${c.opcao}` : c.nome;
    el.replaceChildren();
    const span = (classe: string, texto: string) => {
      const s = document.createElement('span');
      s.className = classe;
      s.textContent = texto;
      el!.append(s);
      return s;
    };
    if (c.tipo === 'rotulo') {
      el.style.width = ''; el.style.height = '';
      el.style.fontSize = tam(c.tamanho || 12);
      el.style.lineHeight = String(ENTRELINHA);
      el.style.fontWeight = c.negrito ? '700' : '400';
      el.textContent = c.valor || ' ';
      const kk = k(c.pagina);
      if (kk && el.offsetWidth) { c.w = el.offsetWidth / kk; c.h = el.offsetHeight / kk; }
      return;
    }
    el.style.width = pct(c.w, P.largura);
    el.style.height = pct(c.h, P.altura);
    // Tamanho de letra aproximado do "automático" dos leitores de PDF, só para a prévia.
    const auto = c.tipo === 'texto' && c.multilinha ? 12 : Math.min(Math.max(c.h * 0.62, 6), 14);
    el.style.fontSize = tam(c.tamanho || auto);
    if (c.tipo === 'texto' || c.tipo === 'data') {
      if (c.valor) span('cf-valor', c.valor);
      else span('cf-dica', c.tipo === 'data' ? DICA_DATA : c.nome);
      if (c.tipo === 'data' && c.escrever) {
        const d = span('cf-extra cf-abaixo', DICA_DATA);
        d.style.fontSize = tam(TAMANHO_DICA);
      }
    } else if (c.tipo === 'lista') {
      if (c.valor) span('cf-valor', c.valor); else span('cf-dica', c.opcoes[0] ?? c.nome);
      const s = document.createElement('span');
      s.className = 'cf-seta';
      s.innerHTML = SETA;
      el.append(s);
    } else if (c.tipo === 'marcar' || c.tipo === 'opcao') {
      if (c.marcado) {
        const m = document.createElement('span');
        m.className = 'cf-marca';
        if (c.tipo === 'marcar') m.innerHTML = CHECK;
        el.append(m);
      }
      const legenda = c.tipo === 'marcar' ? c.legenda.trim() : c.escrever ? c.opcao.trim() : '';
      if (legenda) {
        const s = span('cf-extra cf-lado', legenda);
        s.style.fontSize = tam(tamanhoLegenda(c.h));
      }
    }
    if (c.obrigatorio) span('cf-obrigatorio', '*');
  }

  function removerElemento(id: number) {
    elementos.get(id)?.remove();
    elementos.delete(id);
  }

  function redesenharTudo() {
    for (const id of Array.from(elementos.keys())) removerElemento(id);
    campos.forEach(desenharCampo);
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
    const c = selecionado;
    if (!c) return;
    const camada = camadas[c.pagina];
    const P = paginas[c.pagina];
    const moldura = document.createElement('div');
    moldura.className = 'ep-moldura';
    moldura.style.left = pct(c.x, P.largura); moldura.style.top = pct(c.y, P.altura);
    moldura.style.width = pct(c.w, P.largura); moldura.style.height = pct(c.h, P.altura);
    selecao.push(moldura);
    const colocar = (b: HTMLElement, x: number, y: number) => {
      b.style.left = pct(x, P.largura); b.style.top = pct(y, P.altura);
      selecao.push(b);
    };
    const alca = botao('ep-alca ep-canto', 'Mudar o tamanho', { 'data-alca': 'se' });
    // Em caixa pequena na tela (caixa de marcar no celular), a alça e o X ficam afastados do canto:
    // se ficassem em cima, tocar no campo para arrastar pegaria um deles.
    const pequena = Math.min(c.w, c.h) * (k(c.pagina) || 1) < 36;
    if (pequena) alca.style.margin = '2px 0 0 2px';
    colocar(alca, c.x + c.w, c.y + c.h);
    const apagar = botao('ep-apagar', 'Apagar', { 'data-apagar': '' });
    apagar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    if (pequena) apagar.style.margin = '-36px 0 0 6px';
    colocar(apagar, c.x + c.w, c.y);
    camada.append(...selecao);
    elementos.forEach((el, id) => el.classList.toggle('ep-ativo', id === c.id));
  }

  function selecionar(c: Campo | null) {
    selecionado = c;
    elementos.forEach((el, id) => el.classList.toggle('ep-ativo', !!c && id === c.id));
    desenharSelecao();
    op.aoSelecionar?.(c);
  }

  // ------------------------------------------------------------------ histórico
  const foto = () => JSON.stringify(campos);
  function marcar(chave = '') {
    // Mudanças seguidas no mesmo controle (digitar um nome, arrastar com as setas) viram uma só.
    if (chave && chave === ultimaMarca) return;
    ultimaMarca = chave;
    historico.push(foto());
    if (historico.length > 100) historico.shift();
  }
  const mudou = () => op.aoMudar?.();

  function desfazer() {
    const anterior = historico.pop();
    if (anterior === undefined) return;
    ultimaMarca = '';
    campos = JSON.parse(anterior);
    const id = selecionado?.id;
    selecionado = campos.find((c) => c.id === id) ?? null;
    redesenharTudo();
    op.aoSelecionar?.(selecionado);
    mudou();
  }

  const nomesUsados = () => [...campos.map((c) => c.nome), ...existentes.map((e) => e.nome)];

  function novoCampo(tipo: TipoCampo, pagina: number, x: number, y: number, w: number, h: number, extra: Partial<Campo> = {}): Campo {
    return {
      id: proximoId++, tipo, pagina, x, y, w, h,
      nome: tipo === 'rotulo' ? '' : proximoNome(tipo, nomesUsados()),
      obrigatorio: false, tamanho: tipo === 'rotulo' ? 12 : 0, valor: tipo === 'rotulo' ? 'Rótulo' : '',
      multilinha: false, limite: 0, marcado: false,
      opcoes: tipo === 'lista' ? ['Opção 1', 'Opção 2', 'Opção 3'] : [],
      opcao: '', grupo: 0, legenda: '', escrever: tipo === 'data' || (tipo === 'opcao' && !!op.escreverOpcoes), negrito: false,
      ...extra,
    };
  }

  function incluir(c: Campo) {
    campos.push(c);
    desenharCampo(c);
  }

  /** Cria o campo da ferramenta atual no retângulo (ou no ponto, com o tamanho padrão). */
  function criar(f: FerramentaForm, pagina: number, x: number, y: number, w: number, h: number, arrastou: boolean) {
    const P = paginas[pagina];
    const tipo: TipoCampo = f === 'paragrafo' ? 'texto' : (f as TipoCampo);
    const multilinha = f === 'paragrafo';
    const padrao = tamanhoPadrao(tipo, multilinha);
    if (!arrastou) {
      w = padrao.w; h = padrao.h;
      y -= h / 2;
    }
    if (tipo === 'marcar' || tipo === 'opcao') { const l = arrastou ? Math.max(w, h, MINIMO) : LADO_MARCAR; w = l; h = l; }
    w = Math.min(Math.max(w, MINIMO), P.largura); h = Math.min(Math.max(h, MINIMO), P.altura);
    x = limitar(x, 0, P.largura - w); y = limitar(y, 0, P.altura - h);
    marcar(); ultimaMarca = '';
    let principal: Campo;
    if (tipo === 'opcao') {
      const grupo = proximoGrupo++;
      const nome = proximoNome('opcao', nomesUsados());
      principal = novoCampo('opcao', pagina, x, y, w, h, { nome, grupo, opcao: 'Opção 1', marcado: false });
      incluir(principal);
      const y2 = y + Math.max(PASSO_OPCAO, h + 8);
      if (y2 + h <= P.altura) incluir(novoCampo('opcao', pagina, x, y2, w, h, { nome, grupo, opcao: 'Opção 2', escrever: principal.escrever }));
    } else {
      // Arrastar um rótulo escolhe o tamanho da letra pela altura do arrasto.
      const extra: Partial<Campo> = tipo === 'rotulo' ? (arrastou ? { tamanho: Math.round(limitar(h / ENTRELINHA, 6, 72)) } : {}) : { multilinha };
      principal = novoCampo(tipo, pagina, x, y, w, h, extra);
      incluir(principal);
      if (tipo === 'rotulo') {
        // O rótulo mede o próprio texto: ajusta a posição depois de desenhado.
        principal.x = limitar(principal.x, 0, P.largura - principal.w);
        principal.y = limitar(principal.y, 0, P.altura - principal.h);
        desenharCampo(principal);
      }
    }
    definirFerramenta('mover');
    selecionar(principal);
    mudou();
    return principal;
  }

  function remover(c: Campo, comHistorico = true) {
    if (comHistorico) marcar();
    ultimaMarca = '';
    campos = campos.filter((x) => x !== c);
    removerElemento(c.id);
    if (selecionado === c) selecionar(null);
    mudou();
  }

  /** Copia o campo selecionado logo abaixo dele (ou ao lado, se não couber). Numa opção, cria outra opção do grupo. */
  function duplicar(): Campo | null {
    const c = selecionado;
    if (!c) return null;
    const P = paginas[c.pagina];
    marcar(); ultimaMarca = '';
    let x = c.x, y = c.y + c.h + (c.tipo === 'opcao' ? Math.max(PASSO_OPCAO - c.h, 8) : 8);
    if (c.tipo === 'opcao') {
      const doGrupo = campos.filter((o) => o.tipo === 'opcao' && o.grupo === c.grupo && o.pagina === c.pagina);
      const ultimo = doGrupo.reduce((a, b) => (b.y > a.y ? b : a), c);
      x = ultimo.x; y = ultimo.y + Math.max(PASSO_OPCAO, ultimo.h + 8);
    }
    if (y + c.h > P.altura) { y = Math.min(c.y + 12, P.altura - c.h); x = Math.min(c.x + 12, P.largura - c.w); }
    const copia: Campo = { ...structuredClone(c), id: proximoId++, x, y };
    if (c.tipo === 'opcao') {
      copia.opcao = proximaOpcao(campos.filter((o) => o.grupo === c.grupo).map((o) => o.opcao));
      copia.marcado = false;
    } else if (c.tipo !== 'rotulo') {
      copia.nome = nomeDaCopia(c.nome, nomesUsados());
    }
    incluir(copia);
    selecionar(copia);
    mudou();
    return copia;
  }

  /** Muda propriedades de um campo. `chave` junta mudanças seguidas num passo só do desfazer. */
  function atualizar(c: Campo, parcial: Partial<Campo>, chave = '') {
    const mudancas = Object.entries(parcial).filter(([k2, v]) => JSON.stringify((c as unknown as Record<string, unknown>)[k2]) !== JSON.stringify(v));
    if (!mudancas.length) return;
    marcar(chave ? `${chave}-${c.id}` : '');
    if (!chave) ultimaMarca = '';
    Object.assign(c, parcial);
    // Propriedades do grupo valem para todas as opções dele.
    if (c.tipo === 'opcao') {
      const doGrupo: Partial<Campo> = {};
      for (const k2 of ['nome', 'obrigatorio', 'escrever'] as const) if (k2 in parcial) (doGrupo as Record<string, unknown>)[k2] = parcial[k2];
      for (const o of campos) {
        if (o === c || o.tipo !== 'opcao' || o.grupo !== c.grupo) continue;
        Object.assign(o, doGrupo);
        if (parcial.marcado) o.marcado = false;
        desenharCampo(o);
      }
    }
    if (c.tipo === 'marcar' || c.tipo === 'opcao') { const l = Math.max(c.w, c.h); c.w = l; c.h = l; }
    const P = paginas[c.pagina];
    desenharCampo(c);
    c.x = limitar(c.x, 0, P.largura - c.w); c.y = limitar(c.y, 0, P.altura - c.h);
    desenharCampo(c);
    desenharSelecao();
    mudou();
  }

  /** Cria mais uma opção no grupo da opção selecionada. */
  function adicionarOpcao(): Campo | null {
    return selecionado?.tipo === 'opcao' ? duplicar() : null;
  }

  // ------------------------------------------------------------------ ponteiro
  type Arrasto =
    | { tipo: 'mover'; c: Campo; u: number; v: number; x: number; y: number; mexeu: boolean; antesFoto: string }
    | { tipo: 'alca'; c: Campo; u: number; v: number; w: number; h: number; tamanho: number; antesFoto: string }
    | { tipo: 'criar'; pagina: number; u: number; v: number; previa: HTMLElement; fim: [number, number] };
  let arrasto: Arrasto | null = null;
  let ponteiro = -1;

  function ponto(e: PointerEvent, i: number): [number, number] {
    const r = camadas[i].getBoundingClientRect();
    const P = paginas[i];
    return [((e.clientX - r.left) / r.width) * P.largura, ((e.clientY - r.top) / r.height) * P.altura];
  }

  const dentro = (c: Campo, u: number, v: number) => u >= c.x && u <= c.x + c.w && v >= c.y && v <= c.y + c.h;

  function aoApertar(e: PointerEvent) {
    if (e.button !== 0 || arrasto) return;
    const camada = e.currentTarget as HTMLElement;
    const i = Number(camada.dataset.indice);
    const alvo = e.target as Element;
    const [u, v] = ponto(e, i);
    // O navegador do celular "puxa" o toque para o botão mais perto (alça ou X). Se o dedo
    // caiu dentro do campo selecionado, vale o campo: arrastar move, e não apaga nem redimensiona.
    const noSelecionado = !!selecionado && selecionado.pagina === i && dentro(selecionado, u, v);
    if (alvo.closest('[data-apagar]') && !noSelecionado) return; // o clique cuida
    const alca = noSelecionado ? null : alvo.closest<HTMLElement>('[data-alca]');
    if (noSelecionado && ferramenta === 'mover') {
      e.preventDefault();
      const c = selecionado!;
      arrasto = { tipo: 'mover', c, u, v, x: c.x, y: c.y, mexeu: false, antesFoto: foto() };
    } else if (alca && selecionado) {
      e.preventDefault();
      const c = selecionado;
      arrasto = { tipo: 'alca', c, u, v, w: c.w, h: c.h, tamanho: c.tamanho, antesFoto: foto() };
    } else if (ferramenta === 'mover') {
      const el = alvo.closest<HTMLElement>('[data-id]');
      const c = el ? campos.find((x) => x.id === Number(el.dataset.id)) : undefined;
      if (!c) { if (selecionado) selecionar(null); return; }
      e.preventDefault();
      if (selecionado !== c) selecionar(c);
      arrasto = { tipo: 'mover', c, u, v, x: c.x, y: c.y, mexeu: false, antesFoto: foto() };
    } else {
      e.preventDefault();
      selecionar(null);
      const previa = document.createElement('div');
      previa.className = 'cf-previa';
      previa.hidden = true;
      camada.append(previa);
      arrasto = { tipo: 'criar', pagina: i, u, v, previa, fim: [u, v] };
    }
    ponteiro = e.pointerId;
    try { camada.setPointerCapture(e.pointerId); } catch { /* sem captura, segue igual */ }
  }

  function aoMover(e: PointerEvent) {
    if (!arrasto || e.pointerId !== ponteiro) return;
    const pag = arrasto.tipo === 'criar' ? arrasto.pagina : arrasto.c.pagina;
    const P = paginas[pag];
    let [u, v] = ponto(e, pag);
    u = limitar(u, 0, P.largura); v = limitar(v, 0, P.altura);
    const du = u - arrasto.u, dv = v - arrasto.v;
    if (arrasto.tipo === 'criar') {
      arrasto.fim = [u, v];
      const p = arrasto.previa;
      const x = Math.min(u, arrasto.u), y = Math.min(v, arrasto.v);
      p.hidden = Math.hypot(du, dv) * (k(pag) || 1) < 4;
      p.style.left = pct(x, P.largura); p.style.top = pct(y, P.altura);
      p.style.width = pct(Math.abs(du), P.largura); p.style.height = pct(Math.abs(dv), P.altura);
      return;
    }
    const c = arrasto.c;
    if (arrasto.tipo === 'mover') {
      if (!arrasto.mexeu && Math.hypot(du, dv) * (k(pag) || 1) < 3) return;
      arrasto.mexeu = true;
      c.x = limitar(arrasto.x + du, 0, P.largura - c.w);
      c.y = limitar(arrasto.y + dv, 0, P.altura - c.h);
    } else {
      if (c.tipo === 'rotulo') {
        const f = Math.max((arrasto.h + dv) / arrasto.h, (arrasto.w + du) / arrasto.w);
        c.tamanho = Math.round(limitar((arrasto.tamanho || 12) * f, 6, 72) * 2) / 2;
        op.aoSelecionar?.(c);
      } else if (c.tipo === 'marcar' || c.tipo === 'opcao') {
        const l = limitar(Math.max(arrasto.w + du, arrasto.h + dv), MINIMO, Math.min(P.largura - c.x, P.altura - c.y));
        c.w = l; c.h = l;
      } else {
        c.w = limitar(arrasto.w + du, MINIMO, P.largura - c.x);
        c.h = limitar(arrasto.h + dv, MINIMO, P.altura - c.y);
      }
    }
    desenharCampo(c);
    desenharSelecao();
  }

  function aoSoltar(e: PointerEvent) {
    if (!arrasto || e.pointerId !== ponteiro) return;
    const a = arrasto;
    arrasto = null;
    ponteiro = -1;
    if (a.tipo === 'criar') {
      a.previa.remove();
      const [u, v] = a.fim;
      const w = Math.abs(u - a.u), h = Math.abs(v - a.v);
      const arrastou = Math.hypot(w, h) * (k(a.pagina) || 1) >= 6 && w >= MINIMO / 2;
      if (arrastou) criar(ferramenta, a.pagina, Math.min(u, a.u), Math.min(v, a.v), w, h, true);
      else criar(ferramenta, a.pagina, a.u, a.v, 0, 0, false);
      return;
    }
    if (a.tipo === 'mover' && !a.mexeu) return;
    if (a.antesFoto !== foto()) { historico.push(a.antesFoto); ultimaMarca = ''; mudou(); }
  }

  function aoCancelar(e: PointerEvent) {
    if (!arrasto || e.pointerId !== ponteiro) return;
    const a = arrasto;
    arrasto = null;
    if (a.tipo === 'criar') { a.previa.remove(); return; }
    const antes = (JSON.parse(a.antesFoto) as Campo[]).find((c) => c.id === a.c.id);
    if (antes) { Object.assign(a.c, antes); desenharCampo(a.c); desenharSelecao(); }
  }

  function aoClicar(e: MouseEvent) {
    const b = (e.target as Element).closest('[data-apagar]');
    if (!b || !selecionado) return;
    e.preventDefault();
    const i = Number((e.currentTarget as HTMLElement).dataset.indice);
    const r = camadas[i].getBoundingClientRect();
    const P = paginas[i];
    const u = ((e.clientX - r.left) / r.width) * P.largura, v = ((e.clientY - r.top) / r.height) * P.altura;
    if (e.detail && selecionado.pagina === i && dentro(selecionado, u, v)) return; // toque puxado para o X
    remover(selecionado);
  }

  function aoTeclar(e: KeyboardEvent) {
    const foco = document.activeElement as HTMLElement | null;
    if (foco && (foco.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(foco.tagName))) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      if (historico.length) { e.preventDefault(); desfazer(); }
      return;
    }
    if (!selecionado) return;
    if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicar(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remover(selecionado); }
    else if (e.key === 'Escape') selecionar(null);
    else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const c = selecionado;
      const P = paginas[c.pagina];
      const passo = e.shiftKey ? 10 : 1;
      marcar(`seta-${c.id}`);
      c.x = limitar(c.x + (e.key === 'ArrowLeft' ? -passo : e.key === 'ArrowRight' ? passo : 0), 0, P.largura - c.w);
      c.y = limitar(c.y + (e.key === 'ArrowUp' ? -passo : e.key === 'ArrowDown' ? passo : 0), 0, P.altura - c.h);
      desenharCampo(c); desenharSelecao(); mudou();
    }
  }
  document.addEventListener('keydown', aoTeclar);

  // ------------------------------------------------------------------ API
  function definirFerramenta(f: FerramentaForm) {
    ferramenta = f;
    if (f !== 'mover') selecionar(null);
    camadas.forEach((c) => {
      c.classList.toggle('ep-desenhando', f !== 'mover');
      c.dataset.ferramenta = f;
    });
  }

  /** Acrescenta uma página em branco no fim. */
  function adicionarPagina(t: { largura: number; altura: number }): number {
    paginas.push({ ...t });
    criarPagina(paginas.length - 1);
    rotularPaginas();
    mudou();
    return paginas.length - 1;
  }

  /** Tira a última página, se ela estiver vazia. */
  function removerUltimaPagina(): boolean {
    const i = paginas.length - 1;
    if (i < 1 || campos.some((c) => c.pagina === i)) return false;
    observador.unobserve(camadas[i].parentElement!);
    redim.unobserve(camadas[i]);
    fundos[i].querySelector('canvas')?.remove();
    camadas[i].closest('.ep-caixa')?.remove();
    paginas.pop(); camadas.pop(); fundos.pop(); desenhadas.pop();
    rotularPaginas();
    mudou();
    return true;
  }

  function destruir() {
    vivo = false;
    observador.disconnect();
    redim.disconnect();
    document.removeEventListener('keydown', aoTeclar);
    fundos.forEach((f) => f.querySelectorAll('canvas').forEach((c) => { c.width = 0; c.height = 0; }));
    op.raiz.innerHTML = '';
  }

  paginas.forEach((_, i) => criarPagina(i));
  rotularPaginas();
  definirFerramenta('mover');

  return {
    get ferramenta() { return ferramenta; },
    get selecionado() { return selecionado; },
    get podeDesfazer() { return historico.length > 0; },
    get totalPaginas() { return paginas.length; },
    tamanhos: () => paginas.map((p) => ({ ...p })),
    /** Os campos na ordem em que foram criados. */
    campos: () => campos,
    /** Opções do mesmo grupo do campo. */
    grupo: (c: Campo) => campos.filter((o) => o.tipo === 'opcao' && o.grupo === c.grupo),
    definirFerramenta,
    criar: (f: FerramentaForm, pagina: number, x: number, y: number, w = 0, h = 0) => criar(f, pagina, x, y, w, h, w > 0 && h > 0),
    atualizar,
    duplicar,
    adicionarOpcao,
    remover: (c: Campo) => remover(c),
    apagarSelecionado: () => { if (selecionado) remover(selecionado); },
    selecionar,
    desfazer,
    adicionarPagina,
    removerUltimaPagina,
    /** Elemento da página (para rolar até ela). */
    pagina: (i: number) => camadas[i]?.parentElement ?? null,
    elemento: (c: Campo) => elementos.get(c.id) ?? null,
    destruir,
  };
}

export type Criador = ReturnType<typeof criarCriador>;
