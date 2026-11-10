// Tema do site: segue o do aparelho até a pessoa escolher pelo botão; a escolha fica guardada neste navegador.
// A primeira linha (aplicar o tema) também roda inline no <head> de cada página, para não piscar ao carregar.
(() => {
  const CHAVE = "deacordo-tema";
  const raiz = document.documentElement;

  const botao = document.querySelector(".tema");
  botao?.addEventListener("click", () => {
    const novo = raiz.dataset.theme === "escuro" ? "claro" : "escuro";
    raiz.dataset.theme = novo;
    try {
      localStorage.setItem(CHAVE, novo);
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  });

  // Cabeçalho inteligente: some ao descer, volta no primeiro gesto para cima; menu do celular no botão ☰.
  // Na seção "Como funciona" presa na tela, fica escondido para não cobrir os passos.
  const topo = document.querySelector(".topo");
  const botaoMenu = document.querySelector(".botao-menu");
  const menu = document.getElementById("menu-celular");
  const abrirMenu = (abrir) => {
    if (!botaoMenu || !menu) return;
    botaoMenu.setAttribute("aria-expanded", String(abrir));
    botaoMenu.setAttribute("aria-label", abrir ? "Fechar menu" : "Abrir menu");
    menu.hidden = !abrir;
  };
  botaoMenu?.addEventListener("click", () => abrirMenu(menu.hidden));
  menu?.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => abrirMenu(false)));
  addEventListener("keydown", (e) => e.key === "Escape" && abrirMenu(false));
  if (topo) {
    let ultimoY = scrollY;
    let pedidoTopo = 0;
    const presa = () => {
      const secao = document.querySelector(".como.lateral, .como.interativo:not(.sem-movimento)");
      if (!secao) return false;
      const inicio = secao.offsetTop;
      return scrollY >= inicio - 1 && scrollY <= inicio + secao.offsetHeight - innerHeight;
    };
    const aoRolarTopo = () => {
      pedidoTopo = 0;
      const y = scrollY;
      const passo = y - ultimoY;
      if (Math.abs(passo) < 6 && y > 80) return;
      if (y <= 80) topo.classList.remove("escondido");
      else if (passo > 0) {
        topo.classList.add("escondido");
        abrirMenu(false);
      } else topo.classList.toggle("escondido", presa());
      ultimoY = y;
    };
    addEventListener("scroll", () => (pedidoTopo ||= requestAnimationFrame(aoRolarTopo)), { passive: true });
  }

  // Sem escolha guardada, acompanha a troca de tema do aparelho
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", (e) => {
    let guardado = null;
    try {
      guardado = localStorage.getItem(CHAVE);
    } catch {}
    if (!guardado) raiz.dataset.theme = e.matches ? "claro" : "escuro";
  });

  // De "Provas que se sustentam" em diante, os blocos aparecem conforme a página desce
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
    raiz.classList.add("animar");
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("visivel");
          observador.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    for (const el of document.querySelectorAll(".revelar, .em-sequencia")) observador.observe(el);

    // Cards de provas: um por vez, conforme a página desce. O card N só aparece depois de rolar
    // N × PASSO pixels a partir do topo da grade (e quando ele mesmo já está à vista).
    const PASSO = 140;
    for (const grade of document.querySelectorAll(".cards-um-a-um")) {
      const cards = [...grade.children];
      let pedido = 0;
      const revelar = () => {
        pedido = 0;
        const fundoDaTela = innerHeight * 0.88;
        const topoDaGrade = grade.getBoundingClientRect().top;
        cards.forEach((card, i) => {
          if (card.classList.contains("visivel")) return;
          const alcancado = fundoDaTela - topoDaGrade > i * PASSO + 40;
          const aVista = card.getBoundingClientRect().top < fundoDaTela;
          if (alcancado && aVista) card.classList.add("visivel");
        });
      };
      addEventListener("scroll", () => (pedido ||= requestAnimationFrame(revelar)), { passive: true });
      revelar();
    }
  }

  // Cenas dos passos: desenhadas num quadro fixo (250×190, com folga) e ampliadas para ocupar o espaço disponível
  const ajustarCena = (visual) => {
    const escala = Math.min(visual.clientWidth / 270, visual.clientHeight / 210);
    visual.style.setProperty("--escala", String(Math.max(0.8, Math.min(escala, 2))));
  };
  const visuais = [...document.querySelectorAll(".passo .area-cena")];
  if ("ResizeObserver" in window) {
    const observadorDeTamanho = new ResizeObserver((entradas) => entradas.forEach((e) => ajustarCena(e.target)));
    visuais.forEach((v) => observadorDeTamanho.observe(v));
  } else {
    visuais.forEach(ajustarCena);
  }

  // "Como funciona" no computador: lista de passos à esquerda e a cena do passo ativo à direita.
  // Com movimento permitido, a seção fica presa na tela e o passo avança conforme a página desce
  // (só troca classes, sem animar a cada pixel).
  const secao = document.querySelector(".como");
  if (!secao) return;
  const passos = [...secao.querySelectorAll(".passo")];
  const telaGrande = matchMedia("(min-width: 960px)");
  const semMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ativo = -1;
  const ativar = (i) => {
    if (i === ativo) return;
    ativo = i;
    passos.forEach((p, j) => p.classList.toggle("ativo", j === i));
  };
  const progresso = () => {
    const percurso = secao.offsetHeight - innerHeight;
    return percurso > 0 ? Math.min(1, Math.max(0, -secao.getBoundingClientRect().top / percurso)) : 0;
  };
  let pedido = 0;
  const aoRolar = () => {
    pedido = 0;
    if (secao.classList.contains("interativo") && !semMovimento) {
      ativar(Math.min(passos.length - 1, Math.floor(progresso() * passos.length)));
    }
  };
  const configurar = () => {
    secao.classList.toggle("interativo", telaGrande.matches);
    secao.classList.toggle("sem-movimento", semMovimento);
    secao.classList.toggle("lateral", !telaGrande.matches && !semMovimento);
    secao.classList.toggle("linha-do-tempo", !telaGrande.matches && !semMovimento && linhaDoTempo);
    if (!secao.classList.contains("lateral")) lista.style.transform = "";
    if (ativo < 0) ativar(0);
    visuais.forEach(ajustarCena);
    medir();
    aoRolarLateral();
    aoRolar();
  };
  passos.forEach((p, i) =>
    p.addEventListener("click", () => {
      if (!secao.classList.contains("interativo")) return;
      if (semMovimento) return ativar(i);
      const percurso = secao.offsetHeight - innerHeight;
      scrollTo({ top: secao.offsetTop + ((i + 0.5) / passos.length) * percurso, behavior: "smooth" });
    }),
  );
  // Celular: rolagem horizontal fixa. A seção fica presa na tela e os cartões andam para o lado conforme a
  // página desce, sem barra de rolagem. Onde o navegador anima ligado à rolagem (CSS animation-timeline),
  // o movimento é todo dele; senão, este script move a faixa usando só a posição da rolagem e medidas
  // guardadas (nada é medido durante o movimento, para não travar).
  const lista = secao.querySelector(".passos");
  const pontos = [...secao.querySelectorAll(".pontos-passos span")];
  const linhaDoTempo = typeof CSS !== "undefined" && CSS.supports?.("animation-timeline: view()");
  let medidas = null;
  const marcarPonto = (i) => pontos.forEach((ponto, j) => ponto.classList.toggle("ativo", j === i));
  const medir = () => {
    if (!secao.classList.contains("lateral")) {
      medidas = null;
      return;
    }
    const ultimo = passos[passos.length - 1];
    const folga = parseFloat(getComputedStyle(lista).paddingLeft) || 16;
    const deslize = Math.min(0, innerWidth - (ultimo.offsetLeft + ultimo.offsetWidth + folga));
    secao.style.setProperty("--deslize", `${deslize}px`);
    medidas = { topo: secao.getBoundingClientRect().top + scrollY, percurso: Math.max(1, secao.offsetHeight - innerHeight), deslize };
  };
  let pedidoLateral = 0;
  const aoRolarLateral = () => {
    pedidoLateral = 0;
    if (!medidas) return;
    const p = Math.min(1, Math.max(0, (scrollY - medidas.topo) / medidas.percurso));
    if (!linhaDoTempo) lista.style.transform = `translate3d(${p * medidas.deslize}px, 0, 0)`;
    marcarPonto(Math.round(p * (passos.length - 1)));
  };
  addEventListener("scroll", () => (pedidoLateral ||= requestAnimationFrame(aoRolarLateral)), { passive: true });
  let pedidoMedida = 0;
  addEventListener("resize", () => (pedidoMedida ||= requestAnimationFrame(() => ((pedidoMedida = 0), medir(), aoRolarLateral()))));
  addEventListener("load", () => (medir(), aoRolarLateral()));

  // Sem a rolagem fixa (movimento reduzido), os cartões ficam num carrossel de arrastar
  let pedidoPontos = 0;
  lista?.addEventListener(
    "scroll",
    () =>
      (pedidoPontos ||= requestAnimationFrame(() => {
        pedidoPontos = 0;
        const centro = lista.scrollLeft + lista.clientWidth / 2;
        let atual = 0;
        passos.forEach((p, i) => {
          if (Math.abs(p.offsetLeft + p.offsetWidth / 2 - centro) < Math.abs(passos[atual].offsetLeft + passos[atual].offsetWidth / 2 - centro)) atual = i;
        });
        marcarPonto(atual);
      })),
    { passive: true },
  );

  telaGrande.addEventListener("change", configurar);
  addEventListener("scroll", () => (pedido ||= requestAnimationFrame(aoRolar)), { passive: true });
  configurar();
})();
