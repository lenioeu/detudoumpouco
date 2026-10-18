// Worker do site. Os arquivos de dist/ são servidos direto pelo Cloudflare;
// este código só roda nos caminhos /api/* (ver run_worker_first no wrangler.jsonc).
//
// /api/visitas  GET: devolve o total de visitas
//               POST: soma 1 visita e devolve o novo total
// Nenhum dado da pessoa é guardado: só um número no banco D1 "quebragalho-visitas".

const ROBO = /bot|crawl|spider|slurp|preview|headless|lighthouse|pagespeed/i;

function json(dados, status = 200) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/visitas') return json({ erro: 'não encontrado' }, 404);

    try {
      if (request.method === 'POST' && !ROBO.test(request.headers.get('user-agent') || '')) {
        const linha = await env.VISITAS.prepare(
          'UPDATE contador SET total = total + 1 WHERE id = 1 RETURNING total',
        ).first();
        return json({ total: linha?.total ?? 0 });
      }
      if (request.method === 'GET' || request.method === 'POST') {
        const linha = await env.VISITAS.prepare('SELECT total FROM contador WHERE id = 1').first();
        return json({ total: linha?.total ?? 0 });
      }
      return json({ erro: 'método não permitido' }, 405);
    } catch {
      return json({ erro: 'contador indisponível' }, 503);
    }
  },
};
