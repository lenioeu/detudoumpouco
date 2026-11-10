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

  // "Como funciona": a página desce e a faixa de passos anda para o lado (desligado com movimento reduzido)
  const secao = document.querySelector(".como");
  if (!secao || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const faixa = secao.querySelector(".faixa");
  const barras = [...secao.querySelectorAll(".barra span")];
  const contador = secao.querySelector(".contador");
  secao.classList.add("lateral");

  let pedido = 0;
  const atualizar = () => {
    pedido = 0;
    const caixa = secao.getBoundingClientRect();
    const percurso = secao.offsetHeight - innerHeight;
    const progresso = Math.min(1, Math.max(0, -caixa.top / percurso));
    const sobra = Math.max(0, faixa.scrollWidth - innerWidth);
    faixa.style.transform = `translateX(${-progresso * sobra}px)`;
    const atual = Math.min(barras.length, Math.floor(progresso * barras.length) + 1);
    barras.forEach((b, i) => b.classList.toggle("vista", i < atual));
    if (contador) contador.textContent = `passo ${atual} de ${barras.length}`;
  };
  addEventListener("scroll", () => (pedido ||= requestAnimationFrame(atualizar)), { passive: true });
  addEventListener("resize", atualizar);
  atualizar();
})();
