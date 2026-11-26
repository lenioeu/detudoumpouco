// SELIC-15 · Worker: autenticação (Cloudflare Access), API de dados e painel.
// Os arquivos da página vão embutidos no próprio Worker (regras em wrangler.jsonc).
import INDEX from '../public/index.html';
import { enviarRelatorio } from './relatorio.js';
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
const COLECOES = new Set(['processos', 'contratos', 'tarefas', 'agenda', 'metas', 'parcerias', 'pessoas', 'config']);
const NIVEIS = new Set(['admin', 'editor', 'leitor', 'pendente', 'bloqueado']);
const COM_ACESSO = new Set(['admin', 'editor', 'leitor']);
const COM_HISTORICO = new Set(['processos', 'tarefas']);
const ORDEM_FASE = ['previsto', 'planejamento', 'juridico', 'selecao', 'contratacao', 'execucao', 'finalizado'];
// Colunas que exigem gestor e fiscal, quando o quadro ainda não foi configurado.
const ATIVAS_PADRAO = ['selecao', 'contratacao', 'execucao'];


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
  async scheduled(evt, env, ctx) {
    // 23:00 UTC = 20h em Brasília: relatório diário por e-mail. Os demais horários: fotografia dos indicadores.
    if (evt.cron === '0 23 * * *') ctx.waitUntil(rodarRelatorio(env, 'envio automático', true).catch(() => {}));
    else ctx.waitUntil(painel(env, true));
  },
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
    // Só no ambiente local de desenvolvimento (nunca configurado na versão publicada).
    if (env.DEV_SEM_LOGIN === '1') return { ok: true, email: (req.headers.get('X-Dev-Email') || 'dev@local').toLowerCase() };
    return { ok: false, resp: bloqueado() };
  }
  const token = req.headers.get('Cf-Access-Jwt-Assertion') || cookie(req, 'CF_Authorization');
  if (!token) return { ok: false, resp: semAcesso() };
  try {
    const p = await verificarJWT(token, team, aud);
    if (!p.email) throw new Error('sem e-mail');
    return { ok: true, email: String(p.email).toLowerCase() };
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
  const eu = await usuario(env, email);
  if (p[0] === 'me') {
    if (m === 'PUT') {
      const { nome } = await req.json();
      await env.DB.prepare('UPDATE usuarios SET nome=? WHERE email=?').bind(String(nome || '').slice(0, 80), email).run();
      eu.nome = String(nome || '').slice(0, 80);
    }
    return json(eu);
  }
  // Quem ainda não foi aprovado (ou foi recusado) só consegue ver o próprio cadastro.
  if (!COM_ACESSO.has(eu.nivel)) return json({ erro: eu.nivel === 'bloqueado' ? 'Acesso não autorizado.' : 'Seu acesso está aguardando aprovação.', nivel: eu.nivel }, 403);
  if (p[0] === 'usuarios') {
    if (m === 'GET') return json((await env.DB.prepare('SELECT email,nome,nivel,criado_em FROM usuarios ORDER BY nome,email').all()).results);
    if (eu.nivel !== 'admin') return json({ erro: 'Só administradores podem gerenciar usuários.' }, 403);
    const alvo = decodeURIComponent(p[1] || '').toLowerCase().trim();
    if (m === 'DELETE') {
      if (alvo === email) return json({ erro: 'Você não pode remover a si mesmo.' }, 400);
      await env.DB.prepare('DELETE FROM usuarios WHERE email=?').bind(alvo).run();
      return json({ ok: true });
    }
    const b = await req.json().catch(() => ({}));
    const em = (alvo || String(b.email || '')).toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return json({ erro: 'E-mail inválido.' }, 400);
    const nivel = NIVEIS.has(b.nivel) ? b.nivel : 'leitor';
    if (em === email && nivel !== 'admin') {
      const n = (await env.DB.prepare("SELECT COUNT(*) n FROM usuarios WHERE nivel='admin' AND email<>?").bind(email).first()).n;
      if (!n) return json({ erro: 'O sistema precisa de pelo menos um administrador.' }, 400);
    }
    await env.DB.prepare('INSERT INTO usuarios(email,nome,nivel,criado_em) VALUES(?,?,?,?) ON CONFLICT(email) DO UPDATE SET nome=excluded.nome, nivel=excluded.nivel')
      .bind(em, String(b.nome || '').slice(0, 80), nivel, agoraISO()).run();
    return json(await env.DB.prepare('SELECT email,nome,nivel,criado_em FROM usuarios WHERE email=?').bind(em).first());
  }
  if (p[0] === 'painel' && m === 'GET') return json(await painel(env, false));
  if (p[0] === 'backup' && m === 'GET') {
    if (eu.nivel !== 'admin') return json({ erro: 'Só administradores baixam o backup completo.' }, 403);
    return json(await backup(env, email, true));
  }
  if (p[0] === 'relatorio') {
    if (eu.nivel !== 'admin') return json({ erro: 'Só administradores configuram o relatório.' }, 403);
    if (m === 'GET') {
      const ult = await env.DB.prepare("SELECT em,email,tipo,texto FROM eventos WHERE tipo IN ('relatorio','relatorio_erro') ORDER BY id DESC LIMIT 1").first();
      return json({ chave: !!env.BREVO_API_KEY, ultimo: ult || null });
    }
    if (m === 'POST') {
      try { return json({ ok: true, ...(await rodarRelatorio(env, email, false)) }); }
      catch (e) { return json({ erro: e.message || String(e) }, 400); }
    }
  }
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
  if (eu.nivel !== 'admin' && eu.nivel !== 'editor') return json({ erro: 'Seu acesso é só de leitura.' }, 403);
  if (col === 'config' && eu.nivel !== 'admin') return json({ erro: 'Só administradores alteram as configurações.' }, 403);
  const corpo = m === 'DELETE' ? {} : await req.json().catch(() => ({}));
  if (JSON.stringify(corpo).length > 200000) return json({ erro: 'Conteúdo grande demais' }, 413);
  const t = agoraISO();

  if (col === 'contratos' && (m === 'POST' || m === 'PATCH') && !p[3]) {
    const proc = m === 'POST' ? corpo.data?.processo : corpo.patch?.processo;
    if ((m === 'POST' || proc !== undefined) && !(await processoExiste(env, proc)))
      return json({ erro: 'Todo contrato precisa estar vinculado a um processo.' }, 400);
  }
  if (m === 'POST' && !p[2]) {
    const id = crypto.randomUUID().slice(0, 13);
    const data = { ...(corpo.data || {}) };
    if (COM_HISTORICO.has(col)) data.historico = [{ em: t, por: email, texto: col === 'processos' ? 'Processo cadastrado' : 'Tarefa criada' }];
    if (col === 'agenda' || col === 'metas') { data.criadoPor = email; data.criadoEm = t; }
    await env.DB.prepare('INSERT INTO docs(col,id,data,version,updated_at,updated_by) VALUES(?,?,?,?,?,?)').bind(col, id, JSON.stringify(data), 1, t, email).run();
    const tipo = { processos: 'novo_processo', tarefas: 'nova_tarefa', agenda: 'agenda', metas: 'nova_meta', parcerias: 'nova_parceria', pessoas: 'nova_pessoa' }[col] || 'novo_registro';
    await evento(env, t, email, col, id, tipo, String(data.titulo || data.objeto || data.nome || '').slice(0, 140));
    const extras = [];
    if (col === 'processos' && (await emExecucao(env, data.fase))) { const c = await contratoAutomatico(env, id, data, email, t); if (c) extras.push(c); }
    return json({ doc: { col, id, data, version: 1, updated_at: t, deleted: false }, extras });
  }
  const id = decodeURIComponent(p[2] || '');
  if (m === 'PUT' && id) {
    const data = corpo.data || {};
    await env.DB.prepare('INSERT INTO docs(col,id,data,version,updated_at,updated_by,deleted) VALUES(?,?,?,1,?,?,0) ON CONFLICT(col,id) DO UPDATE SET data=excluded.data, version=version+1, updated_at=excluded.updated_at, updated_by=excluded.updated_by, deleted=0')
      .bind(col, id, JSON.stringify(data), t, email).run();
    await evento(env, t, email, col, id, 'configuracao', String(corpo.texto || 'Configuração alterada').slice(0, 300));
    return json({ doc: { col, id, data, version: 1, updated_at: t, deleted: false } });
  }
  const atual = await env.DB.prepare('SELECT * FROM docs WHERE col=? AND id=?').bind(col, id).first();
  // Desfazer uma exclusão: o registro nunca é apagado de fato, só marcado como excluído.
  if (m === 'POST' && p[3] === 'restaurar') {
    if (!atual) return json({ erro: 'Registro não encontrado' }, 404);
    await env.DB.prepare('UPDATE docs SET deleted=0, version=version+1, updated_at=?, updated_by=? WHERE col=? AND id=?').bind(t, email, col, id).run();
    const d = JSON.parse(atual.data);
    await evento(env, t, email, col, id, 'restauracao', String(d.titulo || d.objeto || d.nome || '').slice(0, 140));
    return json({ doc: { col, id, data: d, version: atual.version + 1, updated_at: t, deleted: false } });
  }
  if (!atual || atual.deleted) return json({ erro: 'Registro não encontrado' }, 404);
  const antes = JSON.parse(atual.data);

  if (m === 'DELETE') {
    await env.DB.prepare('UPDATE docs SET deleted=1, version=version+1, updated_at=?, updated_by=? WHERE col=? AND id=?').bind(t, email, col, id).run();
    await evento(env, t, email, col, id, 'exclusao', String(antes.titulo || antes.objeto || antes.nome || '').slice(0, 140));
    return json({ doc: { col, id, data: antes, version: atual.version + 1, updated_at: t, deleted: true } });
  }
  if (m === 'PATCH') {
    const patch = corpo.patch || {};
    delete patch.historico;
    const depois = { ...antes, ...patch };
    if (corpo.texto && COM_HISTORICO.has(col)) depois.historico = [...(antes.historico || []), { em: t, por: email, texto: String(corpo.texto).slice(0, 500) }];
    // Desfazer: retira do histórico o registro da ação desfeita (só o da própria pessoa).
    if (corpo.removerHistorico && COM_HISTORICO.has(col)) depois.historico = (depois.historico || []).filter(h => !(h.em === corpo.removerHistorico && h.por === email));
    await env.DB.prepare('UPDATE docs SET data=?, version=version+1, updated_at=?, updated_by=? WHERE col=? AND id=?').bind(JSON.stringify(depois), t, email, col, id).run();
    if (corpo.acao) await evento(env, t, email, col, id, tipoAcao(corpo.acao, antes, depois), String(corpo.texto || '').slice(0, 300));
    // Processo que passa a estar em execução ganha o contrato na aba Contratos, se ainda não tiver.
    const extras = [];
    if (col === 'processos' && antes.fase !== depois.fase && (await emExecucao(env, depois.fase)) && !(await emExecucao(env, antes.fase))) {
      const c = await contratoAutomatico(env, id, depois, email, t); if (c) extras.push(c);
    }
    return json({ doc: { col, id, data: depois, version: atual.version + 1, updated_at: t, deleted: false }, extras });
  }
  return json({ erro: 'Método não suportado' }, 405);
}

function tipoAcao(acao, antes, depois) {
  if (acao === 'tarefa_concluida') return !depois.prazo || depois.prazo >= hojeBR() ? 'tarefa_no_prazo' : 'tarefa_atrasada';
  if (acao === 'edicao' && antes.fase !== depois.fase) return 'fase';
  return acao;
}
const evento = (env, em, email, col, doc, tipo, texto) =>
  env.DB.prepare('INSERT INTO eventos(em,email,col,doc,tipo,pontos,texto) VALUES(?,?,?,?,?,0,?)').bind(em, email, col, doc, tipo, texto).run();

async function processoExiste(env, id) {
  if (!id) return false;
  return !!(await env.DB.prepare("SELECT 1 FROM docs WHERE col='processos' AND id=? AND deleted=0").bind(String(id)).first());
}
async function emExecucao(env, fase) {
  const cfg = await env.DB.prepare("SELECT data FROM docs WHERE col='config' AND id='quadro' AND deleted=0").first();
  const cols = cfg ? JSON.parse(cfg.data).colunas : null;
  if (cols?.length) return cols.some(c => c.id === fase && c.etapa === 'execucao');
  return fase === 'execucao';
}
async function contratoAutomatico(env, procId, proc, email, t) {
  const ja = await env.DB.prepare("SELECT 1 FROM docs WHERE col='contratos' AND deleted=0 AND json_extract(data,'$.processo')=?").bind(procId).first();
  if (ja) return null;
  const id = 'ct-' + crypto.randomUUID().slice(0, 10);
  const data = { processo: procId, sei: proc.sei || '', objeto: proc.objeto || '', empresa: '', vigencia: null, indeterminado: false, continuidade: 'Em execução', estadoData: hojeBR(),
    situacao: 'Contrato criado automaticamente quando o processo entrou em execução. Complete a empresa contratada e a vigência.', automatico: true };
  await env.DB.prepare('INSERT INTO docs(col,id,data,version,updated_at,updated_by) VALUES(?,?,?,?,?,?)').bind('contratos', id, JSON.stringify(data), 1, t, email).run();
  await evento(env, t, email, 'contratos', id, 'contrato_auto', String(data.objeto).slice(0, 140));
  return { col: 'contratos', id, data, version: 1, updated_at: t, deleted: false };
}

async function rodarRelatorio(env, quem, automatico) {
  const cfg = ((await env.DB.prepare("SELECT data FROM docs WHERE col='config' AND id='relatorio' AND deleted=0").first()) || {}).data;
  const c = cfg ? JSON.parse(cfg) : {};
  if (automatico && !c.ativo) return { pulado: true };
  try {
    const dados = await backup(env, quem, false), resumo = await painel(env, false);
    const r = await enviarRelatorio(env, dados, resumo, c, env.SITE_URL || 'https://selic-15.leniogoularte.workers.dev');
    await evento(env, agoraISO(), quem, 'sistema', 'relatorio', 'relatorio', `Relatório enviado para ${r.para} destinatário(s)`);
    return r;
  } catch (e) {
    await evento(env, agoraISO(), quem, 'sistema', 'relatorio', 'relatorio_erro', String(e.message || e).slice(0, 300));
    throw e;
  }
}
async function backup(env, quem, registrar) {
  const t = agoraISO();
  const rows = (await env.DB.prepare('SELECT col,id,data,updated_at,updated_by FROM docs WHERE deleted=0').all()).results;
  const colecoes = {};
  for (const r of rows) (colecoes[r.col] ||= []).push({ id: r.id, ...JSON.parse(r.data), _atualizado_em: r.updated_at, _atualizado_por: r.updated_by });
  const usuarios = (await env.DB.prepare('SELECT email,nome,nivel,criado_em FROM usuarios').all()).results;
  const metricas = (await env.DB.prepare('SELECT dia,data FROM metricas ORDER BY dia').all()).results.map(m => ({ dia: m.dia, ...JSON.parse(m.data) }));
  if (registrar) await evento(env, t, quem, 'sistema', 'backup', 'backup', 'Backup completo baixado');
  return { sistema: 'SELIC-15', versao: 1, gerado_em: t, colecoes, usuarios, metricas };
}

async function usuario(env, email) {
  let u = await env.DB.prepare('SELECT email,nome,nivel FROM usuarios WHERE email=?').bind(email).first();
  if (!u) {
    // Quem passa pelo login da Cloudflare e ainda não está cadastrado fica aguardando aprovação de um administrador.
    await env.DB.prepare('INSERT OR IGNORE INTO usuarios(email,nome,nivel,criado_em) VALUES(?,?,?,?)').bind(email, '', 'pendente', agoraISO()).run();
    u = { email, nome: '', nivel: 'pendente' };
  }
  if (!NIVEIS.has(u.nivel)) u.nivel = 'pendente';
  return u;
}

/* ---------------- painel e indicadores ---------------- */
const diasAte = (iso, hoje) => Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(hoje + 'T00:00:00Z')) / 864e5);
const razao = (a, b) => (b ? a / b : 1);

async function painel(env, soFotografar) {
  const hoje = hojeBR();
  const rows = (await env.DB.prepare('SELECT col,id,data FROM docs WHERE deleted=0').all()).results;
  const D = { processos: [], contratos: [], tarefas: [], agenda: [], metas: [], parcerias: [], pessoas: [], config: [] };
  for (const r of rows) D[r.col]?.push({ id: r.id, ...JSON.parse(r.data) });
  const cfg = id => D.config.find(c => c.id === id) || {};
  const colunas = cfg('quadro').colunas;
  const ATIVAS = new Set(colunas?.length ? colunas.filter(c => c.designacao).map(c => c.id) : ATIVAS_PADRAO);
  const JANELA = +cfg('parametros').janela || 120;

  // Contratos finalizados ou suspensos não geram alerta de vencimento; prazo indeterminado não tem data final.
  const comVig = D.contratos.filter(c => c.vigencia && !c.indeterminado && c.continuidade !== 'Finalizado' && c.continuidade !== 'Suspenso');
  const vencidos = comVig.filter(c => diasAte(c.vigencia, hoje) < 0);
  const v30 = comVig.filter(c => { const d = diasAte(c.vigencia, hoje); return d >= 0 && d <= 30; });
  const v120 = comVig.filter(c => { const d = diasAte(c.vigencia, hoje); return d >= 0 && d <= JANELA; });
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
  const recentes = (await env.DB.prepare('SELECT em,email,col,doc,tipo,texto FROM eventos ORDER BY id DESC LIMIT 12').all()).results;
  // Indicadores que as metas da equipe podem acompanhar.
  const indicadores = {
    atrasadas: { nome: 'Tarefas atrasadas', valor: atrasadas.length, sentido: 'reduzir' },
    pendencias: { nome: 'Pendências abertas nas fichas', valor: pendAbertas, sentido: 'reduzir' },
    vencidos: { nome: 'Contratos com vigência vencida', valor: vencidos.length, sentido: 'reduzir' },
    pcaSetor: { nome: 'Itens do PCA com setor informado', valor: pcaSetor.length, total: pca.length, sentido: 'aumentar' },
    designados: { nome: 'Processos ativos com gestor e fiscal', valor: designados.length, total: ativos.length, sentido: 'aumentar' },
    renovacao: { nome: `Contratos a vencer em ${JANELA} dias com tarefa aberta`, valor: renovComPlano.length, total: v120.length, sentido: 'aumentar' },
  };
  return {
    hoje, saude, comp, foto,
    contagens: { vencidos: vencidos.length, v30: v30.length, v120: v120.length, atrasadas: atrasadas.length, pendAbertas, abertas: abertas.length },
    historico: hist.slice(0, 30).reverse(), indicadores, recentes,
  };
}
