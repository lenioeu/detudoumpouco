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

async function carregarFeed(container, apiUrl, { category, minDiscount } = {}) {
  try {
    const url = new URL(apiUrl, location.origin);
    url.searchParams.set('limit', '12');
    if (category) url.searchParams.set('category', category);
    if (minDiscount) url.searchParams.set('minDiscount', minDiscount);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { achados } = await res.json();

    if (!achados?.length) {
      container.innerHTML = '<p class="muted">Nenhum achado com esse filtro ainda.</p>';
      return;
    }

    container.innerHTML = achados.map(cardHtml).join('');
  } catch {
    container.innerHTML = '<p class="muted">Não foi possível carregar os achados agora.</p>';
  }
}

async function carregarCategorias(select, apiUrl) {
  try {
    const url = new URL(`${apiUrl}/categorias`, location.origin);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { categorias } = await res.json();

    for (const categoria of categorias ?? []) {
      const option = document.createElement('option');
      option.value = categoria;
      option.textContent = categoria;
      select.appendChild(option);
    }
  } catch {
    // sem categorias, o filtro fica só com "Todas"
  }
}

export async function initFeed({ container, categorySelect, discountSelect, apiUrl }) {
  const filtrosAtuais = () => ({
    category: categorySelect?.value || undefined,
    minDiscount: discountSelect?.value || undefined
  });

  const recarregar = () => {
    container.innerHTML = '<p class="muted">Carregando achados…</p>';
    carregarFeed(container, apiUrl, filtrosAtuais());
  };

  await carregarFeed(container, apiUrl, filtrosAtuais());

  if (categorySelect) {
    await carregarCategorias(categorySelect, apiUrl);
    categorySelect.addEventListener('change', recarregar);
  }
  if (discountSelect) {
    discountSelect.addEventListener('change', recarregar);
  }
}
