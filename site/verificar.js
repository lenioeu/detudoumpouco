// Página de verificação: conferir um PDF pelo SHA-256 calculado no navegador (o arquivo não é enviado)
// e copiar os hashes. Na tela inicial, só o hash vai ao servidor; na página de um documento, nem ele.
(() => {
  const paraHex = (buffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const hashDe = async (arquivo) => paraHex(await crypto.subtle.digest("SHA-256", await arquivo.arrayBuffer()));

  for (const botao of document.querySelectorAll("[data-copiar]")) {
    botao.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(botao.dataset.copiar);
        botao.textContent = "Copiado";
        setTimeout(() => (botao.textContent = "Copiar"), 1800);
      } catch {
        /* sem acesso à área de transferência: o hash continua selecionável na tela */
      }
    });
  }

  const mostrar = (saida, classe, titulo, texto, link) => {
    saida.className = `resultado ${classe}`;
    saida.replaceChildren();
    const t = document.createElement("strong");
    t.textContent = titulo;
    const p = document.createElement("p");
    p.textContent = texto;
    saida.append(t, p);
    if (link) {
      const a = document.createElement("a");
      a.href = link;
      a.className = "botao secundario pequeno";
      a.textContent = "Ver a verificação completa";
      saida.append(a);
    }
  };
  const ALTERADO =
    "Pode ser outro documento ou uma cópia alterada. Salvar de novo, imprimir em PDF ou editar o arquivo já muda a impressão digital.";

  for (const zona of document.querySelectorAll(".soltar")) {
    const entrada = zona.querySelector("input[type=file]");
    const saida = zona.parentElement.querySelector(".resultado");
    const conferir = async (arquivo) => {
      if (!arquivo) return;
      mostrar(saida, "espera", "Conferindo…", arquivo.name);
      let hash;
      try {
        hash = await hashDe(arquivo);
      } catch {
        return mostrar(saida, "erro", "Não foi possível ler o arquivo", "Tente escolher o PDF de novo.");
      }
      if (zona.dataset.modo === "local") {
        if (hash === zona.dataset.final) return mostrar(saida, "ok", "É a via final assinada, sem nenhuma alteração.", `SHA-256 ${hash}`);
        if (hash === zona.dataset.original)
          return mostrar(saida, "espera", "É o documento original, antes das assinaturas.", "A via assinada é outro arquivo, enviado a todos no WhatsApp ao final.");
        return mostrar(saida, "erro", "Este arquivo não é a via deste documento.", ALTERADO);
      }
      try {
        const r = await fetch("/api/verificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hash }),
        });
        if (r.status === 429) return mostrar(saida, "erro", "Muitas consultas seguidas", "Espere um instante e tente de novo.");
        const d = await r.json();
        if (!d.encontrado) return mostrar(saida, "erro", "Nenhum documento do DeAcordo tem este arquivo.", ALTERADO);
        if (d.arquivo === "final")
          return mostrar(saida, "ok", "É a via final assinada, sem nenhuma alteração.", `Documento: ${d.titulo}`, d.endereco);
        return mostrar(
          saida,
          "espera",
          "É o documento original, antes das assinaturas.",
          `Documento: ${d.titulo}. A via assinada é outro arquivo, enviado a todos no WhatsApp ao final.`,
          d.endereco,
        );
      } catch {
        mostrar(saida, "erro", "Não foi possível consultar agora", "Verifique a conexão e tente de novo.");
      }
    };
    entrada.addEventListener("change", () => conferir(entrada.files[0]));
    zona.addEventListener("dragover", (e) => (e.preventDefault(), zona.classList.add("sobre")));
    zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
    zona.addEventListener("drop", (e) => {
      e.preventDefault();
      zona.classList.remove("sobre");
      conferir(e.dataTransfer.files[0]);
    });
  }
})();
