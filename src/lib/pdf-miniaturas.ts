// Grade de miniaturas das páginas de UM PDF (componente PaginasPdf.astro).
// Cada ferramenta liga só o que precisa: arrastar para mudar a ordem, girar, tirar da lista
// ou marcar com um clique (para remover ou para escolher). As miniaturas são desenhadas
// aos poucos, só quando aparecem na tela, uma de cada vez (fila), para não travar o celular.
import { abrirParaVer, fecharPdf, filaDeTrabalho, miniatura, type DocumentoPdfJs } from './pdf-navegador';
import { animarTroca, mover, ordenavel } from './ordenavel';
import { escalaGirada, normalizarGiro, type PaginaEscolhida } from './paginas-pdf';

export interface Pagina {
  id: string;
  /** Posição da página no PDF original, começando em 0. */
  indice: number;
  /** Giro extra pedido pela pessoa. Acumula (450 = 90) para a animação sempre ir no sentido certo. */
  giro: number;
  marcada: boolean;
  li: HTMLLIElement;
  /** Largura / altura da página, depois que a miniatura é desenhada. */
  aspecto?: number;
}

export interface OpcoesGrade {
  /** Arrastar, botões de antes e depois. */
  ordenar?: boolean;
  /** Botões de girar no canto da miniatura. */
  girar?: boolean;
  /** Botão de tirar a página da lista (some da grade). */
  excluir?: boolean;
  /** O que o clique na miniatura faz. */
  clique?: 'remover' | 'escolher' | 'girar';
  /** Chamado a cada mudança feita pela pessoa. */
  aoMudar: () => void;
}

const ICONES = {
  alca: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  antes: '<path d="m15 18-6-6 6-6"/>',
  depois: '<path d="m9 18 6-6-6-6"/>',
  esquerda: '<path d="M4 11a8 8 0 1 1 2.3 5.7"/><path d="M4 4v7h7"/>',
  direita: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  excluir: '<path d="M18 6 6 18M6 6l12 12"/>',
};
const SELO = {
  remover: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M17 7 7 17M7 7l10 10"/></svg>',
  escolher: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
};

function botao(acao: keyof typeof ICONES, rotulo: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'acao';
  b.setAttribute('aria-label', rotulo);
  b.title = rotulo;
  if (acao === 'alca') b.dataset.alca = '';
  else b.dataset.acao = acao;
  b.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${acao === 'alca' ? 3.2 : 2.4}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[acao]}</svg>`;
  return b;
}

export class GradePaginas {
  /** Páginas na ordem atual (sem as que foram tiradas com o botão de excluir). */
  paginas: Pagina[] = [];
  /** Todas as páginas do PDF, na ordem original. */
  private todas: Pagina[] = [];
  private visor: DocumentoPdfJs | null = null;
  private observador: IntersectionObserver | null = null;
  private fila = filaDeTrabalho();
  private rodada = 0;

  constructor(private lista: HTMLElement, private op: OpcoesGrade) {
    lista.classList.toggle('ordenar', !!op.ordenar);
    lista.addEventListener('click', (e) => this.clicar(e));
    if (op.ordenar) {
      ordenavel(lista, (de, para) => {
        this.paginas = mover(this.paginas, de, para);
        this.atualizar();
        op.aoMudar();
      });
    }
  }

  get total(): number { return this.todas.length; }

  /** Monta a grade para um PDF com `total` páginas e começa a desenhar as miniaturas. */
  async abrir(dados: ArrayBuffer, total: number): Promise<void> {
    this.limpar();
    const minha = this.rodada;
    for (let i = 0; i < total; i++) this.todas.push(this.criar(i));
    this.paginas = [...this.todas];
    this.lista.replaceChildren(...this.paginas.map((p) => p.li));
    this.atualizar();
    this.observador = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        this.observador!.unobserve(e.target);
        const p = this.todas.find((x) => x.li === e.target);
        if (p) this.desenhar(p, minha);
      }
    }, { rootMargin: '400px 0px' });
    let visor: DocumentoPdfJs;
    try {
      visor = await abrirParaVer(dados);
    } catch {
      return; // Sem miniaturas: os números continuam na tela e a ferramenta funciona.
    }
    if (minha !== this.rodada) { fecharPdf(visor); return; }
    this.visor = visor;
    this.todas.forEach((p) => this.observador!.observe(p.li));
  }

  /** Esvazia a grade e libera a memória do PDF anterior. */
  limpar(): void {
    this.rodada++;
    this.observador?.disconnect();
    this.observador = null;
    fecharPdf(this.visor);
    this.visor = null;
    this.fila = filaDeTrabalho();
    this.todas = [];
    this.paginas = [];
    this.lista.replaceChildren();
  }

  /** As páginas do resultado, na ordem atual. `soMarcadas` filtra pelas marcadas (true) ou desmarcadas (false). */
  escolhidas(soMarcadas?: boolean): PaginaEscolhida[] {
    return this.paginas
      .filter((p) => soMarcadas === undefined || p.marcada === soMarcadas)
      .map((p) => ({ indice: p.indice, giro: normalizarGiro(p.giro) }));
  }

  /** Números (começando em 1) das páginas marcadas, em ordem crescente. */
  marcadas(): number[] {
    return this.todas.filter((p) => p.marcada).map((p) => p.indice + 1);
  }

  /** Marca exatamente estas páginas (números começando em 1). */
  marcar(numeros: Iterable<number>): void {
    const conjunto = new Set(numeros);
    this.todas.forEach((p) => { p.marcada = conjunto.has(p.indice + 1); });
    this.atualizar();
  }

  girar(p: Pagina, graus: number): void {
    p.giro += graus;
    this.aplicarGiro(p);
    this.atualizar();
  }

  girarTodas(graus: number): void {
    this.paginas.forEach((p) => { p.giro += graus; this.aplicarGiro(p); });
    this.atualizar();
  }

  /** Muda a ordem com animação. */
  reordenar(novas: Pagina[]): void {
    animarTroca(this.lista, () => {
      this.paginas = novas;
      this.lista.replaceChildren(...novas.map((p) => p.li));
    });
    this.atualizar();
  }

  /** Volta tudo como no arquivo: ordem original, sem giro, nada marcado, nenhuma página tirada. */
  restaurar(): void {
    this.todas.forEach((p) => {
      p.marcada = false;
      if (normalizarGiro(p.giro)) p.giro += 360 - normalizarGiro(p.giro);
      this.aplicarGiro(p);
    });
    this.reordenar([...this.todas]);
  }

  private criar(indice: number): Pagina {
    const n = indice + 1;
    const li = document.createElement('li');
    li.dataset.id = `p${n}`;
    const mini = document.createElement('div');
    mini.className = 'mini';
    if (this.op.clique) {
      const alvo = document.createElement('button');
      alvo.type = 'button';
      alvo.className = 'alvo';
      alvo.dataset.acao = this.op.clique === 'girar' ? 'direita' : 'marcar';
      alvo.setAttribute('aria-label',
        this.op.clique === 'remover' ? `Remover a página ${n}`
          : this.op.clique === 'escolher' ? `Escolher a página ${n}` : `Girar a página ${n} para a direita`);
      if (this.op.clique !== 'girar') alvo.setAttribute('aria-pressed', 'false');
      mini.append(alvo);
    }
    const giro = document.createElement('span');
    giro.className = 'giro';
    const numero = document.createElement('span');
    numero.className = 'numero';
    numero.textContent = String(n);
    mini.append(giro, numero);
    if (this.op.clique === 'remover' || this.op.clique === 'escolher') {
      const selo = document.createElement('span');
      selo.className = `selo ${this.op.clique}`;
      selo.innerHTML = SELO[this.op.clique];
      mini.append(selo);
    }
    if (this.op.girar || this.op.excluir) {
      const cantos = document.createElement('div');
      cantos.className = 'cantos';
      if (this.op.girar) {
        if (!this.op.ordenar) cantos.append(botao('esquerda', `Girar a página ${n} para a esquerda`));
        cantos.append(botao('direita', `Girar a página ${n} para a direita`));
      }
      if (this.op.excluir) cantos.append(botao('excluir', `Tirar a página ${n}`));
      mini.append(cantos);
    }
    li.append(mini);
    if (this.op.ordenar) {
      const acoes = document.createElement('div');
      acoes.className = 'acoes';
      const origem = document.createElement('span');
      origem.className = 'origem';
      origem.textContent = `pág. ${n}`;
      acoes.append(botao('antes', `Mover a página ${n} para antes`), botao('alca', `Arrastar a página ${n}`), origem, botao('depois', `Mover a página ${n} para depois`));
      li.append(acoes);
    } else {
      const legenda = document.createElement('span');
      legenda.className = 'legenda';
      legenda.textContent = `Página ${n}`;
      li.append(legenda);
    }
    return { id: li.dataset.id, indice, giro: 0, marcada: false, li };
  }

  private desenhar(p: Pagina, minha: number): void {
    this.fila(async () => {
      if (minha !== this.rodada || !this.visor) return;
      const c = await miniatura(this.visor, p.indice + 1, 160);
      if (minha !== this.rodada) return;
      p.aspecto = c.width / c.height;
      p.li.querySelector('.giro')!.append(c);
      p.li.classList.add('desenhada');
      this.aplicarGiro(p);
    }).catch(() => { /* sem miniatura; o número continua na tela */ });
  }

  private aplicarGiro(p: Pagina): void {
    const el = p.li.querySelector<HTMLElement>('.giro')!;
    el.style.transform = `rotate(${p.giro}deg) scale(${escalaGirada(p.aspecto ?? 0.75, p.giro)})`;
  }

  private clicar(e: Event): void {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-acao]');
    if (!b) return;
    const p = this.paginas.find((x) => x.li.contains(b));
    if (!p) return;
    const i = this.paginas.indexOf(p);
    switch (b.dataset.acao) {
      case 'marcar': p.marcada = !p.marcada; this.atualizar(); break;
      case 'esquerda': this.girar(p, -90); break;
      case 'direita': this.girar(p, 90); break;
      case 'antes': if (i > 0) this.reordenar(mover(this.paginas, i, i - 1)); break;
      case 'depois': if (i < this.paginas.length - 1) this.reordenar(mover(this.paginas, i, i + 1)); break;
      case 'excluir': {
        // O foco vai para a próxima página, para quem usa teclado poder seguir tirando.
        const proxima = this.paginas[i + 1] ?? this.paginas[i - 1];
        this.reordenar(this.paginas.filter((x) => x !== p));
        proxima?.li.querySelector<HTMLButtonElement>('[data-acao="excluir"]')?.focus();
        break;
      }
      default: return;
    }
    this.op.aoMudar();
  }

  private atualizar(): void {
    this.paginas.forEach((p, i) => {
      if (this.op.ordenar) {
        p.li.querySelector('.numero')!.textContent = String(i + 1);
        p.li.querySelector<HTMLButtonElement>('[data-acao="antes"]')!.disabled = i === 0;
        p.li.querySelector<HTMLButtonElement>('[data-acao="depois"]')!.disabled = i === this.paginas.length - 1;
      }
      p.li.classList.toggle('marcada', p.marcada);
      p.li.classList.toggle('girada', normalizarGiro(p.giro) !== 0);
      p.li.querySelector('.alvo[aria-pressed]')?.setAttribute('aria-pressed', String(p.marcada));
    });
  }
}
