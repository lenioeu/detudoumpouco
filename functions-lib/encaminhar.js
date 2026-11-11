// Cloudflare Pages Functions: o site (estático) fica no Pages, e as páginas de verificação, que
// dependem do banco de documentos, são repassadas ao servidor do bot.
//
// Variáveis do projeto no Cloudflare Pages (Settings → Variables):
//   BOT_ORIGEM     endereço do bot, ex.: https://app.deacordo.app  (sem ela, nada é repassado)
//   PROXY_SEGREDO  a mesma senha do PROXY_SECRET do .env do bot (para o bot confiar no IP repassado)

const INDISPONIVEL = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Verificação indisponível · DeAcordo</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b141a;color:#e9edef;font:17px/1.5 Georgia,serif;padding:24px}
main{max-width:520px}h1{font-weight:500;font-size:30px;margin:0 0 12px}a{color:#25d366}</style></head>
<body><main><h1>A verificação está fora do ar por alguns instantes</h1>
<p>Tente de novo em alguns minutos. O documento e as assinaturas continuam guardados.</p>
<p><a href="/">Voltar ao DeAcordo</a></p></main></body></html>`;

export async function encaminhar({ request, env, next }) {
  if (!env.BOT_ORIGEM) return next();
  const url = new URL(request.url);
  const destino = new URL(url.pathname + url.search, env.BOT_ORIGEM);
  const cabecalhos = new Headers(request.headers);
  cabecalhos.delete("host");
  cabecalhos.set("x-deacordo-ip", request.headers.get("cf-connecting-ip") ?? "");
  if (env.PROXY_SEGREDO) cabecalhos.set("x-deacordo-proxy", env.PROXY_SEGREDO);
  try {
    return await fetch(destino, {
      method: request.method,
      headers: cabecalhos,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
  } catch {
    return new Response(INDISPONIVEL, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": "60", "Cache-Control": "no-store" },
    });
  }
}
