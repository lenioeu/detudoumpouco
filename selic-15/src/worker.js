// SELIC-15 · Worker: autenticação (Cloudflare Access), API de dados e painel.
// Os arquivos da página vão embutidos no próprio Worker (regras em wrangler.jsonc).
import INDEX from '../public/index.html';
import EXCELJS from '../public/vendor/exceljs.min.js';
import LOGO_H from '../public/img/crefito15-horizontal.png';
import LOGO_R from '../public/img/crefito15-horizontal-reduzida.png';
import G32 from '../public/img/globo-32.png';
import G180 from '../public/img/globo-180.png';
import G512 from '../public/img/globo-512.png';
const ESTATICOS = {
  '/': [INDEX, 'text/html; charset=utf-8', 'no-cache'],
  '/index.html': [INDEX, 'text/html; charset=utf-8', 'no-cache'],
  '/vendor/exceljs.min.js': [EXCELJS, 'text/javascript; charset=utf-8', 'public, max-age=604800'],
  '/img/crefito15-horizontal.png': [LOGO_H, 'image/png', 'public, max-age=604800'],
  '/img/crefito15-horizontal-reduzida.png': [LOGO_R, 'image/png', 'public, max-age=604800'],
  '/img/globo-32.png': [G32, 'image/png', 'public, max-age=604800'],
  '/img/globo-180.png': [G180, 'image/png', 'public, max-age=604800'],
  '/img/globo-512.png': [G512, 'image/png', 'public, max-age=604800'],
};
const PUBLICOS = new Set(['/img/crefito15-horizontal.png', '/img/globo-32.png']);
const seguranca = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'x-frame-options': 'DENY' };
const COLECOES = new Set(['processos', 'contratos', 'tarefas', 'agenda']);
const COM_HISTORICO = new Set(['processos', 'tarefas']);
const ORDEM_FASE = ['previsto', 'planejamento', 'juridico', 'selecao', 'contratacao', 'execucao', 'finalizado'];
const ATIVAS = new Set(['selecao', 'contratacao', 'execucao']);

// Pontuação da equipe por tipo de ação (calculada no servidor).
const PONTOS = {
  novo_processo: 3, nova_tarefa: 1, agenda: 2, andamento: 2, pendencia: 8,
  contrato: 5, edicao: 1, fase: 3, tarefa_no_prazo: 10, tarefa_atrasada: 4,
};
const NIVEIS = [0, 100, 250, 500, 1000, 2000, 4000, 8000];

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    // Logo e ícone ficam liberados para a própria tela de bloqueio conseguir exibi-los.
    if (PUBLICOS.has(url.pathname)) return estatico(url.pathname);
    const auth = await autenticar(req, env);
    if (!auth.ok) return auth.resp;
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url, auth.email); }
      catch (e) { return json({ erro: 'Erro interno: ' + (e.message || e) }, 500); }
    }
    return estatico(url.pathname) || new Response('Página não encontrada', { status: 404 });
  },
  async scheduled(_evt, env, ctx) { ctx.waitUntil(painel(env, true)); },
};

function estatico(path) {
  const a = ESTATICOS[path];
  return a ? new Response(a[0], { headers: { 'content-type': a[1], 'cache-control': a[2], ...seguranca } }) : null;
}

/* ---------------- autenticação ---------------- */
let certsCache = { at: 0, keys: [] };
async function autenticar(req, env) {
  const team = (env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const aud = env.ACCESS_AUD || '';
  if (!team || !aud) {
    if (env.DEV_SEM_LOGIN === '1') return { ok: true, email: 'dev@local' };
    return { ok: false, resp: bloqueado() };
  }
  const token = req.headers.get('Cf-Access-Jwt-Assertion') || cookie(req, 'CF_Authorization');
  if (!token) return { ok: false, resp: semAcesso() };
  try {
    const p = await verificarJWT(token, team, aud);
    return { ok: true, email: String(p.email || '').toLowerCase() };
  } catch { return { ok: false, resp: semAcesso() }; }
}
function cookie(req, nome) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + nome + '=([^;]+)'));
  return m ? m[1] : '';
}
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function verificarJWT(token, team, aud) {
  const [h, p, s] = token.split('.');
  const head = JSON.parse(new TextDecoder().decode(b64u(h)));
  const pay = JSON.parse(new TextDecoder().decode(b64u(p)));
  if (Date.now() - certsCache.at > 3600e3 || !certsCache.keys.find(k => k.kid === head.kid)) {
    const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
    certsCache = { at: Date.now(), keys: (await r.json()).keys || [] };
  }
  const jwk = certsCache.keys.find(k => k.kid === head.kid);
  if (!jwk) throw new Error('chave');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(h + '.' + p));
  const auds = Array.isArray(pay.aud) ? pay.aud : [pay.aud];
  if (!ok || !auds.includes(aud) || pay.exp * 1000 < Date.now() || pay.iss !== `https://${team}`) throw new Error('token');
  return pay;
}
const pagina = (titulo, texto, status) => new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SELIC-15</title><link rel="icon" href="/img/globo-32.png">
<body style="margin:0;font:16px/1.5 Archivo,'Segoe UI',system-ui,sans-serif;color:#132717;background:#fff;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box">
<main style="max-width:520px"><img src="/img/crefito15-horizontal.png" alt="CREFITO-15" style="width:280px;max-width:100%"><h1 style="font-size:24px;margin:24px 0 8px">${titulo}</h1><p style="color:#4b5a50">${texto}</p></main></body></html>`,
  { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
const bloqueado = () => pagina('SELIC-15 em configuração', 'O acesso ao sistema ainda está sendo liberado. Assim que o login institucional for ativado, esta página passa a pedir seu e-mail.', 503);
const semAcesso = () => pagina('Acesso restrito', 'Entre com o e-mail autorizado pelo setor de licitações. Se você deveria ter acesso, fale com o responsável pelo SELIC-15.', 403);

/* ---------------- API ---------------- */
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const agoraISO = () => new Date().toISOString();
const hojeBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const linhaDoc = r => ({ col: r.col, id: r.id, data: JSON.parse(r.data), version: r.version, updated_at: r.updated_at, deleted: !!r.deleted });

async function api(req, env, url, email) {
  const m = req.method, p = url.pathname.replace(/^\/api/, '').split('/').filter(Boolean);
  if (p[0] === 'me') {
    if (m === 'PUT') {
      const { nome } = await req.json();
      await env.DB.prepare('INSERT INTO usuarios(email,nome,criado_em) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET nome=excluded.nome').bind(email, String(nome || '').slice(0, 80), agoraISO()).run();
    } else {
      await env.DB.prepare('INSERT OR IGNORE INTO usuarios(email,nome,criado_em) VALUES(?,?,?)').bind(email, '', agoraISO()).run();
    }
    const u = await env.DB.prepare('SELECT email,nome FROM usuarios WHERE email=?').bind(email).first();
    return json(u);
  }
  if (p[0] === 'usuarios' && m === 'GET') {
    const r = await env.DB.prepare('SELECT email,nome FROM usuarios').all();
    return json(r.results);
  }
  if (p[0] === 'painel' && m === 'GET') return json(await painel(env, false));
  if (p[0] !== 'docs') return json({ erro: 'Rota inexistente' }, 404);

  if (m === 'GET' && !p[1]) {
    const agora = agoraISO(), since = url.searchParams.get('since');
    const r = since
      ? await env.DB.prepare('SELECT * FROM docs WHERE updated_at > ?').bind(since).all()
      : await env.DB.prepare('SELECT * FROM docs WHERE deleted = 0').all();
    return json({ agora, docs: r.results.map(linhaDoc) });
  }
  const col = p[1];
  if (!COLECOES.has(col)) return json({ erro: 'Coleção inválida' }, 400);
  const corpo = m === 'DELETE' ? {} : await req.json().catch(() => ({}));
  if (JSON.stringify(corpo).length > 200000) return json({ erro: 'Conteúdo grande demais' }, 413);
  const t = agoraISO();

  if (m === 'POST' && !p[2]) {
    const id = crypto.randomUUID().slice(0, 13);
    const data = { ...(corpo.data || {}) };
    if (COM_HISTORICO.has(col)) data.historico = [{ em: t, por: email, texto: col === 'processos' ? 'Processo cadastrado' : 'Tarefa criada' }];
    if (col === 'agenda') { data.criadoPor = email; data.criadoEm = t; }
    await env.DB.prepare('INSERT INTO docs(col,id,data,version,updated_at,updated_by) VALUES(?,?,?,?,?,?)').bind(col, id, JSON.stringify(data), 1, t, email).run();
    const tipo = { processos: 'novo_processo', tarefas: 'nova_tarefa', agenda: 'agenda' }[col];
    await evento(env, t, email, col, id, tipo, PONTOS[tipo] || 0, (data.titulo || data.objeto || '').slice(0, 140));
    return json({ doc: { col, id, data, version: 1, updated_at: t, deleted: false } });
  }
  const id = decodeURIComponent(p[2] || '');
  const atual = await env.DB.prepare('SELECT * FROM docs WHERE col=? AND id=?').bind(col, id).first();
  if (!atual || atual.deleted) return json({ erro: 'Registro não encontrado' }, 404);
  const antes = JSON.parse(atual.data);

  if (m === 'DELETE') {
    await env.DB.prepare('UPDATE docs SET deleted=1, version=version+1, updated_at=?, updated_by=? WHERE col=? AND id=?').bind(t, email, col, id).run();
    await evento(env, t, email, col, id, 'exclusao', 0, (antes.titulo || antes.objeto || '').slice(0, 140));
    return json({ doc: { col, id, data: antes, version: atual.version + 1, updated_at: t, deleted: true } });
  }
  if (m === 'PATCH') {
    const patch = corpo.patch || {};
    delete patch.historico;
    const depois = { ...antes, ...patch };
    if (corpo.texto && COM_HISTORICO.has(col)) depois.historico = [...(antes.historico || []), { em: t, por: email, texto: String(corpo.texto).slice(0, 500) }];
    const pts = pontuar(col, corpo.acao, antes, depois);
    if (corpo.acao === 'tarefa_concluida') {
      const ja = await env.DB.prepare("SELECT 1 FROM eventos WHERE col=? AND doc=? AND tipo IN ('tarefa_no_prazo','tarefa_atrasada') AND pontos>0").bind(col, id).first();
      if (ja || antes.status === 'feito') pts.pontos = 0;
    }
    if (pts.pontos && (pts.tipo === 'edicao' || pts.tipo === 'andamento')) {
      const n = (await env.DB.prepare('SELECT COUNT(*) n FROM eventos WHERE email=? AND tipo=? AND pontos>0 AND em>=?').bind(email, pts.tipo, hojeBR() + 'T03:00:00Z').first()).n;
      if (n >= 15) pts.pontos = 0;
    }
    await env.DB.prepare('UPDATE docs SET data=?, version=version+1, updated_at=?, updated_by=? WHERE col=? AND id=?').bind(JSON.stringify(depois), t, email, col, id).run();
    if (corpo.acao) await evento(env, t, email, col, id, pts.tipo, pts.pontos, String(corpo.texto || '').slice(0, 300));
    return json({ doc: { col, id, data: depois, version: atual.version + 1, updated_at: t, deleted: false }, pontos: pts.pontos });
  }
  return json({ erro: 'Método não suportado' }, 405);
}

function pontuar(col, acao, antes, depois) {
  if (acao === 'tarefa_concluida') {
    const noPrazo = !depois.prazo || depois.prazo >= hojeBR();
    const tipo = noPrazo ? 'tarefa_no_prazo' : 'tarefa_atrasada';
    return { tipo, pontos: PONTOS[tipo] };
  }
  if (acao === 'fase' || (acao === 'edicao' && antes.fase !== depois.fase)) {
    const a = ORDEM_FASE.indexOf(antes.fase), d = ORDEM_FASE.indexOf(depois.fase);
    return { tipo: 'fase', pontos: d > a && a >= 0 ? PONTOS.fase : 0 };
  }
  return { tipo: acao || 'edicao', pontos: PONTOS[acao] ?? 0 };
}
const evento = (env, em, email, col, doc, tipo, pontos, texto) =>
  env.DB.prepare('INSERT INTO eventos(em,email,col,doc,tipo,pontos,texto) VALUES(?,?,?,?,?,?,?)').bind(em, email, col, doc, tipo, pontos, texto).run();

/* ---------------- painel e gamificação ---------------- */
const diasAte = (iso, hoje) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(hoje + 'T00:00:00Z')) / 864e5);
const razao = (a, b) => (b ? a / b : 1);

async function painel(env, soFotografar) {
  const hoje = hojeBR(), mes = hoje.slice(0, 7);
  const rows = (await env.DB.prepare('SELECT col,id,data FROM docs WHERE deleted=0').all()).results;
  const D = { processos: [], contratos: [], tarefas: [], agenda: [] };
  for (const r of rows) D[r.col]?.push({ id: r.id, ...JSON.parse(r.data) });

  const comVig = D.contratos.filter(c => c.vigencia);
  const vencidos = comVig.filter(c => diasAte(c.vigencia, hoje) < 0);
  const v30 = comVig.filter(c => { const d = diasAte(c.vigencia, hoje); return d >= 0 && d <= 30; });
  const v120 = comVig.filter(c => { const d = diasAte(c.vigencia, hoje); return d >= 0 && d <= 120; });
  const abertas = D.tarefas.filter(t => t.status === 'andamento');
  const atrasadas = abertas.filter(t => t.prazo && t.prazo < hoje);
  const pendAbertas = D.processos.reduce((s, p) => s + (p.alertas || []).length, 0);
  const resolvidasTot = (await env.DB.prepare("SELECT COUNT(*) n FROM eventos WHERE tipo='pendencia'").first()).n;
  const ativos = D.processos.filter(p => ATIVAS.has(p.fase));
  const nomeado = (p, papel) => (p.equipe || []).some(e => e.papel === papel && e.nome);
  const designados = ativos.filter(p => nomeado(p, 'Gestor') && nomeado(p, 'Fiscal'));
  const pca = D.processos.filter(p => p.pca === true), pcaSetor = pca.filter(p => p.setor);
  const tarefasPorProc = new Set(abertas.map(t => t.processo).filter(Boolean));
  const renovComPlano = v120.filter(c => c.processo && tarefasPorProc.has(c.processo));

  const comp = {
    contratos: razao(comVig.length - vencidos.length, comVig.length),
    tarefas: razao(abertas.length - atrasadas.length, abertas.length),
    pendencias: razao(resolvidasTot, resolvidasTot + pendAbertas),
    designacoes: razao(designados.length, ativos.length),
  };
  const saude = Math.round(30 * comp.contratos + 30 * comp.tarefas + 20 * comp.pendencias + 20 * comp.designacoes);
  const foto = { saude, atrasadas: atrasadas.length, vencidos: vencidos.length, pendAbertas };
  await env.DB.prepare('INSERT INTO metricas(dia,data) VALUES(?,?) ON CONFLICT(dia) DO UPDATE SET data=excluded.data').bind(hoje, JSON.stringify(foto)).run();
  if (soFotografar) return foto;

  const hist = (await env.DB.prepare('SELECT dia,data FROM metricas ORDER BY dia DESC LIMIT 60').all()).results.map(r => ({ dia: r.dia, ...JSON.parse(r.data) }));
  let sequencia = 0;
  for (let i = 0, d = hoje; i < hist.length; i++) {
    if (hist[i].dia !== d || hist[i].atrasadas > 0) break;
    sequencia++; const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() - 1); d = x.toISOString().slice(0, 10);
  }
  const inicioMes = hist.filter(h => h.dia.startsWith(mes)).pop();
  const evMes = (await env.DB.prepare('SELECT email,tipo,pontos FROM eventos WHERE em >= ?').bind(mes + '-01T03:00:00Z').all()).results;
  const ptsTot = (await env.DB.prepare('SELECT COALESCE(SUM(pontos),0) n, COUNT(*) c FROM eventos').first());
  const recentes = (await env.DB.prepare('SELECT em,email,col,doc,tipo,pontos,texto FROM eventos ORDER BY id DESC LIMIT 12').all()).results;
  const porPessoa = {};
  for (const e of evMes) if (e.email) porPessoa[e.email] = (porPessoa[e.email] || 0) + e.pontos;
  const resolvidasMes = evMes.filter(e => e.tipo === 'pendencia').length;
  const nivelIdx = NIVEIS.filter(n => ptsTot.n >= n).length - 1;

  const base = Math.max(inicioMes?.atrasadas ?? atrasadas.length, atrasadas.length);
  const metas = [
    { id: 'atrasos', titulo: 'Zerar as tarefas atrasadas', atual: base - atrasadas.length, alvo: base, texto: atrasadas.length ? `${atrasadas.length} ainda atrasada(s)` : 'Nenhuma tarefa atrasada' },
    { id: 'pendencias', titulo: 'Resolver 20 pendências no mês', atual: Math.min(resolvidasMes, 20), alvo: 20, texto: `${resolvidasMes} resolvida(s) neste mês` },
    { id: 'pca', titulo: 'Informar o setor de todo o PCA', atual: pcaSetor.length, alvo: pca.length, texto: `${pcaSetor.length} de ${pca.length} itens` },
    { id: 'renov', titulo: 'Plano para cada contrato que vence em 120 dias', atual: renovComPlano.length, alvo: v120.length, texto: v120.length ? `${renovComPlano.length} de ${v120.length} com tarefa aberta` : 'Nenhum contrato nessa janela' },
  ];
  const conquistas = [
    { id: 'prazo', nome: 'Prazo em dia', desc: 'Nenhuma tarefa atrasada', ok: atrasadas.length === 0, prog: `${atrasadas.length} atrasada(s)` },
    { id: 'surpresa', nome: 'Sem surpresas', desc: 'Nenhum contrato com vigência vencida', ok: vencidos.length === 0, prog: `${vencidos.length} vencido(s)` },
    { id: 'casa', nome: 'Casa arrumada', desc: 'Nenhuma pendência aberta nas fichas', ok: pendAbertas === 0, prog: `${pendAbertas} aberta(s)` },
    { id: 'designados', nome: 'Todos designados', desc: 'Gestor e fiscal em todo processo ativo', ok: ativos.length > 0 && designados.length === ativos.length, prog: `${designados.length} de ${ativos.length}` },
    { id: 'pca', nome: 'PCA mapeado', desc: 'Setor demandante em todos os itens do PCA', ok: pca.length > 0 && pcaSetor.length === pca.length, prog: `${pcaSetor.length} de ${pca.length}` },
    { id: 'seq7', nome: 'Semana impecável', desc: '7 dias seguidos sem tarefa atrasada', ok: sequencia >= 7, prog: `${Math.min(sequencia, 7)} de 7 dias` },
    { id: 'seq30', nome: 'Mês impecável', desc: '30 dias seguidos sem tarefa atrasada', ok: sequencia >= 30, prog: `${Math.min(sequencia, 30)} de 30 dias` },
    { id: 'acoes', nome: 'Equipe engajada', desc: '200 ações registradas no sistema', ok: ptsTot.c >= 200, prog: `${Math.min(ptsTot.c, 200)} de 200` },
  ];
  return {
    hoje, saude, comp, foto,
    contagens: { vencidos: vencidos.length, v30: v30.length, v120: v120.length, atrasadas: atrasadas.length, pendAbertas, abertas: abertas.length },
    historico: hist.slice(0, 30).reverse(), sequencia, metas, conquistas,
    pontos: { total: ptsTot.n, mes: evMes.reduce((s, e) => s + e.pontos, 0), nivel: nivelIdx + 1, nivelBase: NIVEIS[nivelIdx], proximo: NIVEIS[nivelIdx + 1] ?? null, porPessoa },
    recentes,
  };
}
