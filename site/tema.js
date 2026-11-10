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
  const visuais = [...document.querySelectorAll(".passo .visual")];
  if ("ResizeObserver" in window) {
    const observadorDeTamanho = new ResizeObserver((entradas) => entradas.forEach((e) => ajustarCena(e.target)));
    visuais.forEach((v) => observadorDeTamanho.observe(v));
  } else {
    visuais.forEach(ajustarCena);
  }

  // "Como funciona" no computador: lista de passos à esquerda e a cena do passo ativo à direita.
  // Com movimento permitido, a seção fica presa na tela e o passo avança conforme a página desce
  // (só troca classes, sem animar a cada pixel). No celular, os cartões se empilham só com CSS.
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
    if (ativo < 0) ativar(0);
    visuais.forEach(ajustarCena);
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
  telaGrande.addEventListener("change", configurar);
  addEventListener("scroll", () => (pedido ||= requestAnimationFrame(aoRolar)), { passive: true });
  configurar();
})();
