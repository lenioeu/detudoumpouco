// Gráfico de linhas em SVG, leve e sem biblioteca. Usado nas calculadoras que mostram evolução no tempo.
// - Eixo y começa em zero (não exagera o crescimento).
// - Linha fina (2px), grade discreta, legenda sempre visível.
// - Passar o mouse/dedo ou usar as setas do teclado mostra os valores daquele ponto.

export interface Serie {
  nome: string;
  /** Cor da linha (use uma variável CSS, ex.: "var(--serie-1)"). */
  cor: string;
  valores: number[];
  tracejada?: boolean;
}

export interface OpcoesGrafico {
  /** Texto do ponto x no tooltip, ex.: "Mês 12 (1 ano)". */
  rotuloPonto: (i: number) => string;
  /** Rótulo curto do eixo x, ou null para não marcar esse ponto. */
  marcaX: (i: number, total: number) => string | null;
  /** Rótulo do eixo y, ex.: "R$ 10 mil". */
  formatarEixo: (v: number) => string;
  /** Valor no tooltip, ex.: "R$ 10.834,10". */
  formatarValor: (v: number) => string;
  altura?: number;
}

const NS = 'http://www.w3.org/2000/svg';

function passoBonito(bruto: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  const f = bruto / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** "R$ 850", "R$ 12 mil", "R$ 1,2 mi" */
export function reaisCurto(v: number): string {
  const f = (n: number, c = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: c });
  if (Math.abs(v) >= 1e6) return `R$ ${f(v / 1e6)} mi`;
  if (Math.abs(v) >= 1e3) return `R$ ${f(v / 1e3)} mil`;
  return `R$ ${f(v, 0)}`;
}

export function desenharGrafico(alvo: HTMLElement, series: Serie[], o: OpcoesGrafico) {
  alvo.innerHTML = '';
  alvo.classList.add('grafico-linhas');
  const n = Math.max(...series.map((s) => s.valores.length)) - 1;
  if (n < 1) return;

  // Legenda
  const legenda = document.createElement('ul');
  legenda.className = 'gl-legenda';
  legenda.innerHTML = series.map((s) =>
    `<li><span class="gl-amostra${s.tracejada ? ' tracejada' : ''}" style="--c:${s.cor}"></span>${s.nome}</li>`).join('');
  alvo.append(legenda);

  const caixa = document.createElement('div');
  caixa.className = 'gl-caixa';
  alvo.append(caixa);
  const dica = document.createElement('div');
  dica.className = 'gl-dica';
  dica.hidden = true;
  caixa.append(dica);

  const L = Math.max(320, Math.round(caixa.clientWidth || alvo.clientWidth || 640));
  const H = o.altura ?? 280;
  const m = { t: 12, r: 14, b: 28, l: 64 };
  const w = L - m.l - m.r, h = H - m.t - m.b;
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const passo = passoBonito(max / 4);
  const topo = Math.ceil(max / passo) * passo;
  const x = (i: number) => m.l + (i / n) * w;
  const y = (v: number) => m.t + h - (v / topo) * h;

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${L} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', String(H));
  svg.setAttribute('role', 'img');
  svg.setAttribute('tabindex', '0');
  svg.setAttribute('aria-label', `Gráfico da evolução: ${series.map((s) => `${s.nome} termina em ${o.formatarValor(s.valores.at(-1) ?? 0)}`).join('; ')}. Use as setas para percorrer os meses.`);
  let html = '';
  for (let v = 0; v <= topo + 1e-9; v += passo) {
    html += `<line class="gl-grade" x1="${m.l}" x2="${L - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    html += `<text class="gl-eixo" x="${m.l - 8}" y="${y(v)}" text-anchor="end" dominant-baseline="middle">${o.formatarEixo(v)}</text>`;
  }
  let ultimoX = -Infinity;
  for (let i = 0; i <= n; i++) {
    const r = o.marcaX(i, n);
    if (r === null || x(i) - ultimoX < 54) continue;
    ultimoX = x(i);
    html += `<text class="gl-eixo" x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n ? 'end' : 'middle'}">${r}</text>`;
  }
  html += `<line class="gl-base" x1="${m.l}" x2="${L - m.r}" y1="${y(0)}" y2="${y(0)}"/>`;
  for (const s of series) {
    const d = s.valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    html += `<path class="gl-linha${s.tracejada ? ' tracejada' : ''}" d="${d}" style="stroke:${s.cor}"/>`;
  }
  html += `<line class="gl-mira" y1="${m.t}" y2="${m.t + h}" visibility="hidden"/>`;
  html += series.map((s, k) => `<circle class="gl-ponto" data-k="${k}" r="4.5" style="fill:${s.cor}" visibility="hidden"/>`).join('');
  html += `<rect class="gl-alvo" x="${m.l}" y="${m.t}" width="${w}" height="${h}"/>`;
  svg.innerHTML = html;
  caixa.append(svg);
  // Em tela estreita o quadro de valores fica fixo acima do gráfico, já mostrando o último ponto.
  const compacta = caixa.clientWidth > 0 && caixa.clientWidth < 520;
  caixa.classList.toggle('compacta', compacta);

  const mira = svg.querySelector<SVGLineElement>('.gl-mira')!;
  const pontos = Array.from(svg.querySelectorAll<SVGCircleElement>('.gl-ponto'));
  let atual = -1;
  const mostrar = (i: number) => {
    atual = Math.max(0, Math.min(n, i));
    const px = x(atual);
    mira.setAttribute('x1', String(px)); mira.setAttribute('x2', String(px)); mira.setAttribute('visibility', 'visible');
    pontos.forEach((c, k) => {
      const v = series[k].valores[atual];
      c.setAttribute('cx', String(px)); c.setAttribute('cy', String(y(v ?? 0)));
      c.setAttribute('visibility', v === undefined ? 'hidden' : 'visible');
    });
    const linhas = series
      .map((s) => ({ s, v: s.valores[atual] }))
      .filter((l) => l.v !== undefined)
      .sort((a, b) => b.v - a.v)
      .map(({ s, v }) => `<li><span class="gl-amostra${s.tracejada ? ' tracejada' : ''}" style="--c:${s.cor}"></span>${s.nome}<b>${o.formatarValor(v)}</b></li>`).join('');
    dica.innerHTML = `<strong>${o.rotuloPonto(atual)}</strong><ul>${linhas}</ul>`;
    dica.hidden = false;
    if (compacta) return;
    const largura = caixa.clientWidth, escala = largura / L, pos = px * escala;
    const lado = pos > largura / 2;
    dica.style.left = lado ? '' : `${pos + 12}px`;
    dica.style.right = lado ? `${largura - pos + 12}px` : '';
  };
  const esconder = () => {
    if (compacta) { mostrar(n); return; }
    atual = -1; dica.hidden = true; mira.setAttribute('visibility', 'hidden');
    pontos.forEach((c) => c.setAttribute('visibility', 'hidden'));
  };
  const indice = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    return Math.round((((ev.clientX - r.left) / r.width) * L - m.l) / w * n);
  };
  if (compacta) mostrar(n);
  svg.addEventListener('pointermove', (ev) => mostrar(indice(ev)));
  svg.addEventListener('pointerdown', (ev) => mostrar(indice(ev)));
  svg.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') esconder(); });
  svg.addEventListener('blur', esconder);
  svg.addEventListener('keydown', (ev) => {
    const passoTecla = ev.shiftKey ? 12 : 1;
    if (ev.key === 'ArrowRight') { mostrar((atual < 0 ? 0 : atual) + passoTecla); ev.preventDefault(); }
    else if (ev.key === 'ArrowLeft') { mostrar((atual < 0 ? n : atual) - passoTecla); ev.preventDefault(); }
    else if (ev.key === 'Home') { mostrar(0); ev.preventDefault(); }
    else if (ev.key === 'End') { mostrar(n); ev.preventDefault(); }
    else if (ev.key === 'Escape') esconder();
  });
}
