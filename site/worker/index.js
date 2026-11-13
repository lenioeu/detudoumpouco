// Worker do site. Serve a página (gerada em worker/site.generated.js a partir do
// build do Astro) e a API em /api/*.
//
// /api/achados  GET:  lista os últimos achados publicados no canal (público)
//               POST: registra um achado publicado (o bot chama isso depois de postar no WhatsApp;
//                     exige o cabeçalho x-promozap-secret igual ao secret POST_SECRET do Worker)

import { SITE_HTML } from './site.generated.js';

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function listarAchados(env, url) {
  const limit = Math.min(Number(url.searchParams.get('limit')) || 12, 50);
  const category = url.searchParams.get('category');
  const minDiscount = Number(url.searchParams.get('minDiscount')) || 0;

  const where = [];
  const binds = [];
  if (category) {
    where.push('category = ?');
    binds.push(category);
  }
  if (minDiscount > 0) {
    where.push('discount_pct >= ?');
    binds.push(minDiscount);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { results } = await env.ACHADOS.prepare(
    `SELECT id, store, title, url, price, original_price, discount_pct, image, category, posted_at
     FROM achados ${whereSql} ORDER BY posted_at DESC LIMIT ?`,
  )
    .bind(...binds, limit)
    .all();

  return json({ achados: results ?? [] });
}

async function listarCategorias(env) {
  const { results } = await env.ACHADOS.prepare(
    'SELECT DISTINCT category FROM achados WHERE category IS NOT NULL ORDER BY category',
  ).all();
  return json({ categorias: results?.map((r) => r.category) ?? [] });
}

async function registrarAchado(env, request) {
  if (request.headers.get('x-promozap-secret') !== env.POST_SECRET) {
    return json({ erro: 'não autorizado' }, 401);
  }

  const dados = await request.json().catch(() => null);
  const obrigatorios = ['id', 'store', 'title', 'url', 'price', 'originalPrice', 'discountPct'];
  if (!dados || obrigatorios.some((campo) => dados[campo] == null)) {
    return json({ erro: 'dados incompletos' }, 400);
  }

  await env.ACHADOS.prepare(
    `INSERT INTO achados (id, store, title, url, price, original_price, discount_pct, image, category, posted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       price = excluded.price, original_price = excluded.original_price,
       discount_pct = excluded.discount_pct, posted_at = excluded.posted_at`,
  )
    .bind(
      dados.id,
      dados.store,
      dados.title,
      dados.url,
      dados.price,
      dados.originalPrice,
      dados.discountPct,
      dados.image ?? null,
      dados.category ?? null,
      dados.postedAt ?? new Date().toISOString(),
    )
    .run();

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(SITE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    try {
      if (url.pathname === '/api/achados/categorias' && request.method === 'GET') {
        return listarCategorias(env);
      }
      if (url.pathname === '/api/achados') {
        if (request.method === 'GET') return listarAchados(env, url);
        if (request.method === 'POST') return registrarAchado(env, request);
        return json({ erro: 'método não permitido' }, 405);
      }
      return json({ erro: 'não encontrado' }, 404);
    } catch {
      return json({ erro: 'indisponível' }, 503);
    }
  },
};
