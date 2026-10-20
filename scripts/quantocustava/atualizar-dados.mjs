#!/usr/bin/env node
// Baixa as séries oficiais usadas pelo Quanto Custava? e gera os itens do jogo.
//
// Uso: node scripts/quantocustava/atualizar-dados.mjs
// Roda todo mês pelo GitHub Actions (.github/workflows/dados-quantocustava.yml),
// depois que o IBGE divulga o IPCA do mês anterior.
//
// Fontes (todas públicas e verificáveis):
//   IPCA, número-índice ......... IBGE/SIDRA, tabela 1737, variável 2266
//   Salário mínimo .............. Ipeadata, série MTE12_SALMIN12
//   Big Mac e cotação do dólar .. The Economist, Big Mac Index (GitHub)
//   Itens pesquisados à mão ..... sites/quantocustava/dados/itens-pesquisados.csv

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hojeEmBrasilia, somarDias } from '#core/dia.js';
import { sortearRodadas, RODADAS } from '../../sites/quantocustava/js/sorteio.js';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DADOS = join(RAIZ, 'sites', 'quantocustava', 'dados');
const INICIO = '1994-07'; // Plano Real: antes disso os preços não estão em reais.
const DIAS_A_FRENTE = 60;

const FONTES = {
  ipca: {
    nome: 'IBGE — IPCA, número-índice (tabela 1737 do SIDRA)',
    url: 'https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/2266/p/all?formato=json',
    pagina: 'https://sidra.ibge.gov.br/tabela/1737',
  },
  salario: {
    nome: 'Ipeadata — salário mínimo vigente (MTE12_SALMIN12)',
    url: "https://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='MTE12_SALMIN12')",
    pagina: 'https://www.ipeadata.gov.br/ExibeSerie.aspx?serid=1739471028',
  },
  bigmac: {
    nome: 'The Economist — Big Mac Index',
    url: 'https://raw.githubusercontent.com/TheEconomist/big-mac-data/master/output-data/big-mac-raw-index.csv',
    pagina: 'https://github.com/TheEconomist/big-mac-data',
  },
};

async function baixar(url, tipo = 'json') {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const resposta = await fetch(url, { headers: { 'user-agent': 'quantocustava-dados/1.0' } });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      return tipo === 'json' ? await resposta.json() : await resposta.text();
    } catch (erro) {
      if (tentativa === 3) throw new Error(`Falha ao baixar ${url}: ${erro.message}`);
      await new Promise((r) => setTimeout(r, 2000 * tentativa));
    }
  }
}

async function ipca() {
  const linhas = await baixar(FONTES.ipca.url);
  const [cabecalho, ...dados] = linhas;
  const chaveMes = Object.keys(cabecalho).find((k) => cabecalho[k] === 'Mês (Código)');
  const serie = {};
  for (const l of dados) {
    const valor = Number(l.V);
    if (!Number.isFinite(valor)) continue;
    const mes = `${l[chaveMes].slice(0, 4)}-${l[chaveMes].slice(4, 6)}`;
    if (mes >= INICIO) serie[mes] = valor;
  }
  if (Object.keys(serie).length < 300) throw new Error('Série do IPCA veio incompleta');
  return serie;
}

async function salarioMinimo() {
  const { value } = await baixar(FONTES.salario.url);
  const serie = {};
  for (const v of value) {
    const mes = v.VALDATA.slice(0, 7);
    if (mes >= INICIO && Number.isFinite(v.VALVALOR)) serie[mes] = v.VALVALOR;
  }
  return serie;
}

async function bigMac() {
  const texto = await baixar(FONTES.bigmac.url, 'texto');
  const [cabecalho, ...linhas] = texto.trim().split('\n').map((l) => l.split(','));
  const col = (nome) => cabecalho.indexOf(nome);
  return linhas
    .filter((l) => l[col('iso_a3')] === 'BRA')
    .map((l) => ({
      mes: l[col('date')].slice(0, 7),
      preco: Number(l[col('local_price')]),
      dolar: Number(l[col('dollar_ex')]),
    }));
}

/** CSV simples com aspas opcionais. */
function lerCsv(texto) {
  const linhas = texto.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
  const separar = (linha) => {
    const campos = [];
    let atual = '';
    let aspas = false;
    for (const c of linha) {
      if (c === '"') aspas = !aspas;
      else if (c === ',' && !aspas) { campos.push(atual); atual = ''; }
      else atual += c;
    }
    campos.push(atual);
    return campos.map((s) => s.trim());
  };
  const [cabecalho, ...resto] = linhas.map(separar);
  return resto.map((campos) => Object.fromEntries(cabecalho.map((c, i) => [c, campos[i] ?? ''])));
}

function mesAnoCurto(mes) {
  const [a, m] = mes.split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[Number(m) - 1]}/${a}`;
}

async function main() {
  const [serieIpca, serieSalario, linhasBigMac, csvPesquisados] = await Promise.all([
    ipca(), salarioMinimo(), bigMac(),
    readFile(join(DADOS, 'itens-pesquisados.csv'), 'utf8'),
  ]);
  const ultimoMes = Object.keys(serieIpca).sort().at(-1);
  const corrigir = (preco, mes) => {
    if (!serieIpca[mes]) throw new Error(`Sem IPCA para ${mes}`);
    return Math.round(preco * (serieIpca[ultimoMes] / serieIpca[mes]) * 100) / 100;
  };

  const itens = [];
  const adicionar = (item) => itens.push({ ...item, hoje: corrigir(item.preco, item.mes) });

  // Salário mínimo: um item por valor novo (cada reajuste).
  let anterior = null;
  for (const mes of Object.keys(serieSalario).sort()) {
    const valor = serieSalario[mes];
    if (valor === anterior || mes > ultimoMes) continue;
    anterior = valor;
    adicionar({
      id: `salario-${mes}`, grupo: 'salario', nome: 'Um salário mínimo', detalhe: 'valor mensal em vigor',
      mes, preco: valor, fonte: FONTES.salario.nome, url: FONTES.salario.pagina,
    });
  }

  for (const { mes, preco, dolar } of linhasBigMac) {
    if (mes > ultimoMes) continue;
    adicionar({
      id: `bigmac-${mes}`, grupo: 'bigmac', nome: 'Um Big Mac', detalhe: 'preço médio no Brasil',
      mes, preco, fonte: FONTES.bigmac.nome, url: FONTES.bigmac.pagina,
    });
    adicionar({
      id: `dolar-${mes}`, grupo: 'dolar', nome: 'Um dólar americano', detalhe: 'cotação do dia da pesquisa do Big Mac',
      mes, preco: dolar, fonte: FONTES.bigmac.nome, url: FONTES.bigmac.pagina,
    });
  }

  for (const linha of lerCsv(csvPesquisados)) {
    const preco = Number(linha.preco.replace(',', '.'));
    if (!linha.id || !Number.isFinite(preco) || !linha.url) {
      throw new Error(`Item pesquisado incompleto: ${JSON.stringify(linha)}`);
    }
    adicionar({
      id: linha.id, grupo: linha.grupo || linha.id, nome: linha.nome, detalhe: linha.detalhe,
      mes: linha.mes, preco, fonte: linha.fonte, url: linha.url, verificacao: linha.verificacao,
    });
  }

  await mkdir(DADOS, { recursive: true });
  const saida = {
    geradoEm: new Date().toISOString().slice(0, 10),
    mesReferencia: ultimoMes,
    mesReferenciaTexto: mesAnoCurto(ultimoMes),
    fonteIpca: { nome: FONTES.ipca.nome, url: FONTES.ipca.pagina },
    itens: itens.map((i) => ({ ...i, quando: mesAnoCurto(i.mes) })),
  };
  await writeFile(join(DADOS, 'itens.json'), `${JSON.stringify(saida, null, 1)}\n`);
  console.log(`${itens.length} itens gerados, em valores de ${saida.mesReferenciaTexto}.`);
  await estenderCalendario(saida);
}

/**
 * O calendário congela os pares de cada dia. Dias já sorteados nunca mudam, mesmo
 * que itens novos entrem na lista; só os dias futuros são acrescentados.
 */
async function estenderCalendario(dados) {
  const arquivo = join(DADOS, 'calendario.json');
  let calendario = {};
  try {
    calendario = JSON.parse(await readFile(arquivo, 'utf8'));
  } catch {
    // Primeiro uso: calendário vazio.
  }
  const ids = new Set(dados.itens.map((i) => i.id));
  for (const [dia, pares] of Object.entries(calendario)) {
    const faltando = pares.flat().filter((id) => !ids.has(id));
    if (faltando.length) throw new Error(`O dia ${dia} usa itens que sumiram: ${faltando.join(', ')}`);
  }
  const hoje = hojeEmBrasilia();
  let novos = 0;
  for (let i = 0; i <= DIAS_A_FRENTE; i++) {
    const dia = somarDias(hoje, i);
    if (calendario[dia]) continue;
    calendario[dia] = sortearRodadas(dados.itens, dia);
    if (calendario[dia].length < RODADAS) console.warn(`Atenção: ${dia} ficou com só ${calendario[dia].length} rodadas.`);
    novos++;
  }
  const ordenado = Object.fromEntries(Object.entries(calendario).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(arquivo, `${JSON.stringify(ordenado, null, 0).replace(/\],"/g, '],\n"')}\n`);
  console.log(`Calendário: ${novos} dias novos, até ${somarDias(hoje, DIAS_A_FRENTE)}.`);
}

main().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
