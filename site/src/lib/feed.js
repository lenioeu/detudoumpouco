function formatPrice(value) {
  return `R$ ${Number(value).toFixed(2).replace('.', ',')}`;
}

function cardHtml(achado) {
  const pct = Math.round(achado.discount_pct);
  const imagem = achado.image
    ? `<img src="${achado.image}" alt="" loading="lazy" class="achado-img" />`
    : '';

  return `
    <a class="card achado" href="${achado.url}" target="_blank" rel="noopener sponsored">
      ${imagem}
      <span class="badge">${pct}% OFF</span>
      <h3 class="achado-titulo">${achado.title}</h3>
      <p class="achado-preco">
        <span class="muted achado-preco-de">${formatPrice(achado.original_price)}</span>
        <strong>${formatPrice(achado.price)}</strong>
      </p>
      <p class="muted achado-loja">${achado.store}</p>
    </a>
  `;
}

export async function carregarFeed(container, apiUrl) {
  try {
    const res = await fetch(`${apiUrl}?limit=12`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { achados } = await res.json();

    if (!achados?.length) {
      container.innerHTML = '<p class="muted">Nenhum achado publicado ainda. Volte em breve!</p>';
      return;
    }

    container.innerHTML = achados.map(cardHtml).join('');
  } catch {
    container.innerHTML = '<p class="muted">Não foi possível carregar os achados agora.</p>';
  }
}
