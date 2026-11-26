/**
 * SELIC-15 · Backup diário para o Google Drive do CREFITO-15
 *
 * Todo dia, por volta das 6h (horário de Brasília), este script:
 *   1. busca todos os dados do SELIC-15 (com a credencial de serviço do Cloudflare Access);
 *   2. salva na pasta do Drive uma planilha com as abas do sistema e um arquivo .json
 *      com os dados brutos (é o .json que permite restaurar o sistema);
 *   3. manda para a lixeira os backups com mais de MANTER_DIAS dias.
 *
 * Instalação: veja o LEIAME.md desta pasta.
 * As credenciais NÃO ficam neste código: vão em Configurações do projeto → Propriedades do script
 * (CF_CLIENT_ID e CF_CLIENT_SECRET).
 */
const SELIC_URL = 'https://selic-15.leniogoularte.workers.dev';
const PASTA_ID = 'COLE_AQUI_O_ID_DA_PASTA_DO_DRIVE';
const MANTER_DIAS = 90;
const FUSO = 'America/Sao_Paulo';
const PREFIXO = 'SELIC-15 backup ';

/** Rode uma vez: autoriza o script, agenda o backup diário e já faz o primeiro. */
function instalar() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'fazerBackup')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('fazerBackup').timeBased().everyDays(1).atHour(6).inTimezone(FUSO).create();
  fazerBackup();
}

function fazerBackup() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('CF_CLIENT_ID'), segredo = props.getProperty('CF_CLIENT_SECRET');
  if (!id || !segredo) throw new Error('Faltam CF_CLIENT_ID e CF_CLIENT_SECRET em Propriedades do script.');
  const r = UrlFetchApp.fetch(SELIC_URL + '/api/backup', {
    headers: { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': segredo },
    muteHttpExceptions: true, followRedirects: false,
  });
  const texto = r.getContentText();
  if (r.getResponseCode() !== 200 || texto.charAt(0) !== '{')
    throw new Error('O SELIC-15 não entregou o backup (código ' + r.getResponseCode() + '). Confira a credencial de serviço e a política "Service Auth" no Cloudflare.');
  const dados = JSON.parse(texto);
  const pasta = DriveApp.getFolderById(PASTA_ID);
  const dia = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');

  // 1) arquivo completo para restauração
  pasta.createFile(Utilities.newBlob(texto, 'application/json', PREFIXO + dia + '.json'));

  // 2) planilha para consulta
  const ss = SpreadsheetApp.create(PREFIXO + dia);
  DriveApp.getFileById(ss.getId()).moveTo(pasta);
  montarAbas(dados).forEach((a, i) => {
    const sh = i === 0 ? ss.getSheets()[0].setName(a.nome) : ss.insertSheet(a.nome);
    const valores = [a.colunas].concat(a.linhas).map(l => a.colunas.map((_, j) => l[j] == null ? '' : l[j]));
    sh.getRange(1, 1, valores.length, a.colunas.length).setValues(valores)
      .setFontFamily('Palatino Linotype').setFontSize(10).setVerticalAlignment('top').setWrap(true);
    sh.getRange(1, 1, 1, a.colunas.length).setFontWeight('bold').setFontColor('#ffffff').setBackground('#132717');
    sh.setFrozenRows(1);
    a.larguras.forEach((w, j) => sh.setColumnWidth(j + 1, w * 7));
    a.datas.forEach(j => { if (valores.length > 1) sh.getRange(2, j + 1, valores.length - 1, 1).setNumberFormat(j === a.dataHora ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy'); });
    if (valores.length > 1) sh.getRange(1, 1, valores.length, a.colunas.length).createFilter();
  });

  // 3) limpeza dos antigos
  const limite = Date.now() - MANTER_DIAS * 864e5, arquivos = pasta.getFiles();
  while (arquivos.hasNext()) {
    const f = arquivos.next();
    if (f.getName().indexOf(PREFIXO) === 0 && f.getDateCreated().getTime() < limite) f.setTrashed(true);
  }
  console.log('Backup ' + dia + ' salvo.');
}

/* ---------- montagem das abas (espelha a exportação do sistema) ---------- */
function montarAbas(d) {
  const C = d.colecoes || {};
  const lista = k => C[k] || [];
  const quadro = (lista('config').find(c => c.id === 'quadro') || {}).colunas || [
    { id: 'previsto', nome: 'Previsto no PCA' }, { id: 'planejamento', nome: 'Planejamento (DFD, ETP, TR)' }, { id: 'juridico', nome: 'Jurídico (PROJUR)' },
    { id: 'selecao', nome: 'Seleção do fornecedor' }, { id: 'contratacao', nome: 'Contratação / assinatura' }, { id: 'execucao', nome: 'Em execução' },
    { id: 'finalizado', nome: 'Finalizado' }, { id: 'encerrado', nome: 'Deserto, fracassado ou cancelado' }];
  const fase = f => (quadro.find(c => c.id === f) || quadro[0]).nome;
  const URG = { urgente: 'Urgente', media: 'Média', baixa: 'Baixa' };
  const nomes = {}; (d.usuarios || []).forEach(u => { if (u.nome) nomes[u.email] = u.nome; });
  const quem = e => nomes[e] || (e && e.indexOf('@') > 0 ? e.split('@')[0] : e || '');
  const D = s => { if (!s) return ''; const p = String(s).split('-'); return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : s; };
  const sim = v => v === true ? 'Sim' : v === false ? 'Não' : '';
  const proc = {}; lista('processos').forEach(p => proc[p.id] = p);
  const papel = (p, x) => (p.equipe || []).filter(e => e.papel === x && e.nome).map(e => e.nome).join(', ');
  const ordem = (a, b, k) => String(a[k] || '').localeCompare(String(b[k] || ''), 'pt-BR');

  const hist = [];
  [['Processo', 'processos', 'objeto'], ['Tarefa', 'tarefas', 'titulo']].forEach(([tipo, col, campo]) =>
    lista(col).forEach(x => (x.historico || []).forEach(h => hist.push([new Date(h.em), quem(h.por), tipo, x[campo] || '', x.sei || '', h.texto]))));
  hist.sort((a, b) => b[0] - a[0]);

  return [
    { nome: 'Processos', larguras: [48, 24, 24, 10, 13, 7, 18, 26, 26, 44, 9, 60], datas: [],
      colunas: ['Objeto', 'SEI', 'Fase', 'Urgência', 'Setor', 'PCA', 'Tipo', 'Gestor', 'Fiscal', 'Pendências', 'COFFITO', 'Observações'],
      linhas: lista('processos').sort((a, b) => ordem(a, b, 'objeto')).map(p => [p.objeto, p.sei, fase(p.fase), URG[p.urgencia] || '', p.setor, sim(p.pca), p.tipo,
        papel(p, 'Gestor'), papel(p, 'Fiscal'), (p.alertas || []).join('\n'), p.coffito ? 'Sim' : '', p.obs]) },
    { nome: 'Contratos', larguras: [42, 36, 24, 13, 18, 60], datas: [3],
      colunas: ['Objeto', 'Empresa', 'SEI', 'Vigência até', 'Continuidade', 'Situação'],
      linhas: lista('contratos').sort((a, b) => ordem(a, b, 'vigencia')).map(c => [c.objeto, c.empresa, c.sei, D(c.vigencia), c.continuidade, c.situacao]) },
    { nome: 'Tarefas', larguras: [16, 44, 44, 12, 12, 24, 60], datas: [3],
      colunas: ['Responsável', 'Tarefa', 'Ação', 'Prazo', 'Situação', 'Processo (SEI)', 'Anotações'],
      linhas: lista('tarefas').sort((a, b) => ordem(a, b, 'responsavel')).map(t => [t.responsavel, t.titulo, t.acao, D(t.prazo),
        { andamento: 'Em andamento', feito: 'Concluída', encerrado: 'Encerrada' }[t.status] || t.status, t.sei || (proc[t.processo] || {}).sei || '', t.notas]) },
    { nome: 'Designações', larguras: [30, 9, 44, 24, 22, 50], datas: [],
      colunas: ['Nome', 'Papel', 'Objeto', 'SEI', 'Fase', 'Observação'],
      linhas: [].concat(...lista('processos').map(p => (p.equipe || []).map(e => [e.nome || '(pendente)', e.papel, p.objeto, p.sei, fase(p.fase), e.obs || ''])))
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'pt-BR')) },
    { nome: 'Parcerias', larguras: [40, 20, 18, 50, 24, 14, 12, 12, 36], datas: [6, 7],
      colunas: ['Parceiro', 'CNPJ', 'Tipo', 'Objeto ou benefício', 'SEI', 'Situação', 'Início', 'Fim', 'Contato'],
      linhas: lista('parcerias').sort((a, b) => ordem(a, b, 'nome')).map(x => [x.nome, x.cnpj, x.tipo, x.objeto, x.sei, x.situacao, D(x.inicio), D(x.fim), x.contato]) },
    { nome: 'Agenda', larguras: [12, 8, 44, 18, 40, 50], datas: [0],
      colunas: ['Data', 'Hora', 'Título', 'Tipo', 'Processo', 'Anotações'],
      linhas: lista('agenda').sort((a, b) => ordem(a, b, 'data')).map(e => [D(e.data), e.hora, e.titulo, e.tipo, (proc[e.processo] || {}).objeto || '', e.notas]) },
    { nome: 'Metas', larguras: [46, 12, 24, 14, 40], datas: [1],
      colunas: ['Meta', 'Prazo', 'Responsável', 'Situação', 'Observações'],
      linhas: lista('metas').map(m => [m.titulo, D(m.prazo), m.responsavel, m.arquivada ? 'Arquivada' : 'Ativa', m.notas]) },
    { nome: 'Equipe', larguras: [36, 24, 16, 32], datas: [],
      colunas: ['Nome', 'Função', 'Setor', 'E-mail'],
      linhas: lista('pessoas').sort((a, b) => ordem(a, b, 'nome')).map(x => [x.nome, x.funcao, x.setor, x.email]) },
    { nome: 'Histórico', larguras: [18, 22, 10, 46, 24, 70], datas: [0], dataHora: 0,
      colunas: ['Data e hora', 'Quem', 'Tipo', 'Item', 'SEI', 'Registro'], linhas: hist },
    { nome: 'Usuários', larguras: [30, 32, 20], datas: [],
      colunas: ['Nome', 'E-mail', 'Nível'],
      linhas: (d.usuarios || []).map(u => [u.nome, u.email, { admin: 'Administrador', editor: 'Editor', leitor: 'Leitor', pendente: 'Aguardando aprovação', bloqueado: 'Acesso recusado' }[u.nivel] || u.nivel]) },
    { nome: 'Sobre', larguras: [26, 70], datas: [],
      colunas: ['Item', 'Valor'],
      linhas: [['Gerado em', Utilities.formatDate(new Date(d.gerado_em), FUSO, 'dd/MM/yyyy HH:mm')], ['Origem', 'SELIC-15 – Setor de Licitações e Contratos do CREFITO-15'],
        ['Restauração', 'Use o arquivo .json de mesma data, que contém todos os dados brutos.']] },
  ];
}
