// SELIC-15 · relatório diário por e-mail: monta a planilha completa e envia pelo Brevo.
import ExcelJS from './vendor/exceljs.cjs';

const URG = { urgente: 'Urgente', media: 'Média', baixa: 'Baixa' };
const NIVEL = { admin: 'Administrador', editor: 'Editor', leitor: 'Leitor', pendente: 'Aguardando aprovação', bloqueado: 'Acesso recusado' };
const COLUNAS_PADRAO = [
  { id: 'previsto', nome: 'Previsto no PCA' }, { id: 'planejamento', nome: 'Planejamento (DFD, ETP, TR)' }, { id: 'juridico', nome: 'Jurídico (PROJUR)' },
  { id: 'selecao', nome: 'Seleção do fornecedor' }, { id: 'contratacao', nome: 'Contratação / assinatura' }, { id: 'execucao', nome: 'Em execução' },
  { id: 'finalizado', nome: 'Finalizado' }, { id: 'encerrado', nome: 'Deserto, fracassado ou cancelado' }];

const brDia = iso => iso ? iso.split('-').reverse().join('/') : '';
const dataCel = s => { if (!s) return null; const p = String(s).split('-'); return p.length === 3 ? new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])) : null; };

/** Monta as abas da planilha a partir de todos os dados do sistema. */
export function montarAbas(d) {
  const C = d.colecoes || {}, lista = k => C[k] || [];
  const quadro = (lista('config').find(c => c.id === 'quadro') || {}).colunas || COLUNAS_PADRAO;
  const fase = f => (quadro.find(c => c.id === f) || quadro[0]).nome;
  const nomes = {}; (d.usuarios || []).forEach(u => { if (u.nome) nomes[u.email] = u.nome; });
  const quem = e => nomes[e] || (e && e.includes('@') ? e.split('@')[0] : e || '');
  const sim = v => v === true ? 'Sim' : v === false ? 'Não' : '';
  const proc = Object.fromEntries(lista('processos').map(p => [p.id, p]));
  const papel = (p, x) => (p.equipe || []).filter(e => e.papel === x && e.nome).map(e => e.nome).join(', ');
  const ord = k => (a, b) => String(a[k] || '').localeCompare(String(b[k] || ''), 'pt-BR');
  const hist = [];
  [['Processo', 'processos', 'objeto'], ['Tarefa', 'tarefas', 'titulo']].forEach(([tipo, col, campo]) =>
    lista(col).forEach(x => (x.historico || []).forEach(h => hist.push([new Date(Date.parse(h.em) - 3 * 3600e3), quem(h.por), tipo, x[campo] || '', x.sei || '', h.texto]))));
  hist.sort((a, b) => b[0] - a[0]);
  return [
    { nome: 'Processos', larguras: [48, 24, 24, 10, 13, 7, 18, 26, 26, 44, 9, 60],
      colunas: ['Objeto', 'SEI', 'Fase', 'Urgência', 'Setor', 'PCA', 'Tipo', 'Gestor', 'Fiscal', 'Pendências', 'COFFITO', 'Observações'],
      linhas: lista('processos').sort(ord('objeto')).map(p => [p.objeto, p.sei, fase(p.fase), URG[p.urgencia] || '', p.setor, sim(p.pca), p.tipo,
        papel(p, 'Gestor'), papel(p, 'Fiscal'), (p.alertas || []).join('\n'), p.coffito ? 'Sim' : '', p.obs]) },
    { nome: 'Contratos', larguras: [42, 40, 36, 24, 16, 14, 14, 60],
      colunas: ['Objeto', 'Processo', 'Empresa', 'SEI', 'Vigência até', 'Estado atual', 'Data do estado', 'Situação'],
      linhas: lista('contratos').sort(ord('vigencia')).map(c => [c.objeto, (proc[c.processo] || {}).objeto || '', c.empresa, c.sei,
        c.indeterminado ? 'Prazo indeterminado' : dataCel(c.vigencia), c.continuidade, dataCel(c.estadoData), c.situacao]) },
    { nome: 'Tarefas', larguras: [16, 44, 44, 12, 12, 24, 60],
      colunas: ['Responsável', 'Tarefa', 'Ação', 'Prazo', 'Situação', 'Processo (SEI)', 'Anotações'],
      linhas: lista('tarefas').sort(ord('responsavel')).map(t => [t.responsavel, t.titulo, t.acao, dataCel(t.prazo),
        { andamento: 'Em andamento', feito: 'Concluída', encerrado: 'Encerrada' }[t.status] || t.status, t.sei || (proc[t.processo] || {}).sei || '', t.notas]) },
    { nome: 'Designações', larguras: [30, 9, 44, 24, 22, 50],
      colunas: ['Nome', 'Papel', 'Objeto', 'SEI', 'Fase', 'Observação'],
      linhas: lista('processos').flatMap(p => (p.equipe || []).map(e => [e.nome || '(pendente)', e.papel, p.objeto, p.sei, fase(p.fase), e.obs || '']))
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'pt-BR')) },
    { nome: 'Parcerias', larguras: [40, 20, 18, 50, 24, 14, 12, 12, 36],
      colunas: ['Parceiro', 'CNPJ', 'Tipo', 'Objeto ou benefício', 'SEI', 'Situação', 'Início', 'Fim', 'Contato'],
      linhas: lista('parcerias').sort(ord('nome')).map(x => [x.nome, x.cnpj, x.tipo, x.objeto, x.sei, x.situacao, dataCel(x.inicio), dataCel(x.fim), x.contato]) },
    { nome: 'Agenda', larguras: [12, 8, 44, 18, 40, 50],
      colunas: ['Data', 'Hora', 'Título', 'Tipo', 'Processo', 'Anotações'],
      linhas: lista('agenda').sort(ord('data')).map(e => [dataCel(e.data), e.hora, e.titulo, e.tipo, (proc[e.processo] || {}).objeto || '', e.notas]) },
    { nome: 'Equipe', larguras: [36, 24, 16, 32],
      colunas: ['Nome', 'Função', 'Setor', 'E-mail'],
      linhas: lista('pessoas').sort(ord('nome')).map(x => [x.nome, x.funcao, x.setor, x.email]) },
    { nome: 'Histórico', larguras: [18, 22, 10, 46, 24, 70], dataHora: true,
      colunas: ['Data e hora', 'Quem', 'Tipo', 'Item', 'SEI', 'Registro'], linhas: hist },
    { nome: 'Usuários', larguras: [30, 32, 20],
      colunas: ['Nome', 'E-mail', 'Nível'], linhas: (d.usuarios || []).map(u => [u.nome, u.email, NIVEL[u.nivel] || u.nivel]) },
  ];
}

/** Gera o arquivo .xlsx (Palatino Linotype, cabeçalho fixo e filtro em todas as abas). */
export async function gerarXlsx(abas, geradoEm) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Lenio Goularte'; wb.lastModifiedBy = 'Lenio Goularte'; wb.created = new Date(); wb.title = 'SELIC-15 – CREFITO-15';
  const F = { name: 'Palatino Linotype', size: 10 };
  for (const a of [...abas, { nome: 'Sobre', larguras: [26, 70], colunas: ['Item', 'Valor'],
    linhas: [['Gerado em', geradoEm], ['Origem', 'SELIC-15 – Setor de Licitações e Contratos do CREFITO-15'], ['Envio', 'Relatório diário automático']] }]) {
    const ws = wb.addWorksheet(a.nome, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = a.colunas.map((h, i) => ({ header: h, width: a.larguras[i] || 20 }));
    a.linhas.forEach(l => ws.addRow(a.colunas.map((_, i) => l[i] ?? '')));
    ws.eachRow((r, i) => r.eachCell({ includeEmpty: true }, c => {
      c.font = i === 1 ? { ...F, bold: true, color: { argb: 'FFFFFFFF' } } : F;
      c.alignment = { vertical: 'top', wrapText: true };
      if (i === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132717' } };
      if (c.value instanceof Date) c.numFmt = a.dataHora ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy';
    }));
    if (a.linhas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: a.colunas.length } };
  }
  return wb.xlsx.writeBuffer();
}

function base64(buf) {
  const b = new Uint8Array(buf); let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
const escH = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Monta e envia o relatório. `cfg` = { remetente, destinatarios[] }. */
export async function enviarRelatorio(env, dados, resumo, cfg, url) {
  if (!env.BREVO_API_KEY) throw new Error('A chave do Brevo (BREVO_API_KEY) ainda não foi cadastrada na Cloudflare.');
  const para = (cfg.destinatarios || []).filter(e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (!para.length) throw new Error('Nenhum destinatário cadastrado em Configurações.');
  if (!cfg.remetente) throw new Error('Informe o e-mail remetente (o mesmo verificado no Brevo) em Configurações.');
  const agora = new Date(Date.now() - 3 * 3600e3), dia = agora.toISOString().slice(0, 10);
  const geradoEm = brDia(dia) + ' ' + agora.toISOString().slice(11, 16);
  const xlsx = await gerarXlsx(montarAbas(dados), geradoEm);
  const k = resumo.contagens, linha = (n, v, cor) => `<tr><td style="padding:6px 12px;border-bottom:1px solid #e3e9e4">${n}</td><td style="padding:6px 12px;border-bottom:1px solid #e3e9e4;font-weight:700;color:${cor || '#132717'};text-align:right">${v}</td></tr>`;
  const html = `<div style="font-family:Arial,sans-serif;color:#132717;max-width:560px">
    <div style="border-top:4px solid #48AE75;padding:16px 0 4px"><b style="font-size:20px">SELIC-15</b><br><span style="color:#55625a">Setor de Licitações e Contratos · CREFITO-15</span></div>
    <p>Segue em anexo a planilha completa do SELIC-15 de <b>${brDia(dia)}</b>.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      ${linha('Índice de Saúde do setor', resumo.saude + ' de 100')}
      ${linha('Tarefas com prazo vencido', k.atrasadas, k.atrasadas ? '#b3261e' : '')}
      ${linha('Contratos com vigência vencida', k.vencidos, k.vencidos ? '#b3261e' : '')}
      ${linha('Contratos que vencem em até 30 dias', k.v30, k.v30 ? '#9a5b00' : '')}
      ${linha('Pendências abertas nas fichas', k.pendAbertas)}
    </table>
    <p style="margin-top:16px"><a href="${escH(url)}" style="color:#237047;font-weight:700">Abrir o SELIC-15</a></p>
    <p style="color:#808285;font-size:12px">Mensagem automática enviada todo dia às 20h. Para mudar quem recebe, um administrador ajusta em Configurações → Relatório diário.</p></div>`;
  const r = await fetch(env.BREVO_URL || 'https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'SELIC-15', email: cfg.remetente },
      to: para.map(email => ({ email })),
      subject: `SELIC-15 · Relatório diário de ${brDia(dia)}`,
      htmlContent: html,
      attachment: [{ name: `selic-15-${dia}.xlsx`, content: base64(xlsx) }],
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`O Brevo recusou o envio (${r.status}): ${t.slice(0, 200)}`);
  }
  return { para: para.length, tamanho: xlsx.byteLength };
}
