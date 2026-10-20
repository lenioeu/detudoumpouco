// Etapa de build própria do Quanto Custava?: publica os dados do jogo e as
// páginas "Jogos anteriores" (uma por dia já encerrado, com as respostas).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataPorExtenso, numeroDoJogo, somarDias } from '#core/dia.js';
import { rodadasDoDia } from './js/sorteio.js';

const PASTA = dirname(fileURLToPath(import.meta.url));
const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export default async function construir({ site, saida, hoje, amanha, publicar, escapar, modeloTexto }) {
  const arquivoItens = join(PASTA, 'dados', 'itens.json');
  if (!existsSync(arquivoItens)) {
    throw new Error('Faltam os dados do jogo. Rode: node scripts/quantocustava/atualizar-dados.mjs');
  }
  const dados = JSON.parse(await readFile(arquivoItens, 'utf8'));
  const calendario = existsSync(join(PASTA, 'dados', 'calendario.json'))
    ? JSON.parse(await readFile(join(PASTA, 'dados', 'calendario.json'), 'utf8'))
    : {};

  // Só vai para o site o calendário até amanhã (margem para fuso e cache).
  const publico = Object.fromEntries(Object.entries(calendario).filter(([dia]) => dia <= amanha));
  await mkdir(join(saida, 'dados'), { recursive: true });
  await writeFile(join(saida, 'dados', 'itens.json'), JSON.stringify(dados));
  await writeFile(join(saida, 'dados', 'calendario.json'), JSON.stringify(publico));

  // Dias encerrados, do mais recente para o mais antigo.
  const dias = [];
  for (let dia = somarDias(hoje, -1); dia >= site.lancamento; dia = somarDias(dia, -1)) dias.push(dia);

  const item = (i) => `<strong>${escapar(i.nome)}</strong> em ${escapar(i.quando)} (${escapar(i.detalhe)}): ${reais.format(i.preco)} na época, <strong>${reais.format(i.hoje)}</strong> em ${escapar(dados.mesReferenciaTexto)}. <a href="${escapar(i.url)}" rel="nofollow noopener">Fonte: ${escapar(i.fonte)}</a>.`;

  for (const dia of dias) {
    const numero = numeroDoJogo(dia, site.lancamento);
    const rodadas = rodadasDoDia(dados, calendario, dia);
    const conteudo = `
      <h1>Respostas do jogo nº ${numero}</h1>
      <p>Jogo de ${dataPorExtenso(dia, true)}. Em cada rodada, o item mais caro em dinheiro de hoje aparece primeiro.</p>
      ${rodadas.map((r, i) => {
        const [maior, menor] = r.certo === 'a' ? [r.a, r.b] : [r.b, r.a];
        return `<div class="par-resposta"><h2>Rodada ${i + 1}</h2><p>Mais caro: ${item(maior)}</p><p>Mais barato: ${item(menor)}</p></div>`;
      }).join('')}
      <p>Valores corrigidos pelo <a href="${escapar(dados.fonteIpca.url)}" rel="nofollow noopener">IPCA do IBGE</a>.</p>
      <p><a class="botao" href="/">Jogar o desafio de hoje</a></p>`;
    await publicar(modeloTexto, `/respostas/${numero}`, {
      titulo: `Respostas do jogo nº ${numero} (${dataPorExtenso(dia)})`,
      descricao: `Gabarito do ${site.nome} de ${dataPorExtenso(dia, true)}: o que era mais caro em cada uma das 10 rodadas.`,
      conteudo,
      cabecaExtra: '<link rel="stylesheet" href="/css/jogo.css">',
    });
  }

  const lista = dias.length
    ? `<ul class="respostas-lista">${dias.map((d) => `<li><a href="/respostas/${numeroDoJogo(d, site.lancamento)}"><span>Jogo nº ${numeroDoJogo(d, site.lancamento)}</span><span>${dataPorExtenso(d, true)}</span></a></li>`).join('')}</ul>`
    : '<p>As respostas de cada jogo aparecem aqui no dia seguinte. Volte amanhã!</p>';
  await publicar(modeloTexto, '/respostas', {
    titulo: 'Jogos anteriores e respostas',
    descricao: `Respostas de todos os jogos anteriores do ${site.nome}.`,
    conteudo: `<h1>Jogos anteriores</h1><p>As respostas de cada dia são publicadas depois da meia-noite, quando o jogo vira.</p>${lista}`,
    cabecaExtra: '<link rel="stylesheet" href="/css/jogo.css">',
  });
}
