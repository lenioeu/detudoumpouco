// Quanto Custava?: lógica da partida do dia.

import { hojeEmBrasilia, numeroDoJogo, dataPorExtenso } from '#core/dia.js';
import { criarProgresso } from '#core/progresso.js';
import { mostrarAnuncioRecompensa } from '#core/anuncios.js';
import { abrirPainel, compartilhar, escapar, htmlProgresso, htmlSequencia, icones, iniciarContagem, recado } from '#core/ui.js';
import { atualizarSequenciaDoCabecalho } from '#core/pagina.js';
import { rodadasDoDia, RODADAS } from './sorteio.js';

const PONTOS_ACERTO = 10;
const PONTOS_COM_DICA = 5;

const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const $$ = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];
const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const progresso = criarProgresso(window.SITE.id);
const hoje = hojeEmBrasilia();
const numero = numeroDoJogo(hoje, window.SITE.lancamento);
const rotuloJogo = numero >= 1 ? `Jogo nº ${numero}` : 'Jogo de prévia';

let dados;
let rodadas;
let estado; // { respostas: [{ escolha, acertou, dica }], dicaAtual: boolean }

for (const el of $$('[data-icone]')) el.innerHTML = icones[el.dataset.icone] ?? '';

async function carregar() {
  const [resItens, resCalendario] = await Promise.all([
    fetch(`/dados/itens.json?v=${window.SITE.versao}`),
    fetch(`/dados/calendario.json?v=${window.SITE.versao}`),
  ]);
  dados = await resItens.json();
  const calendario = resCalendario.ok ? await resCalendario.json() : {};
  rodadas = rodadasDoDia(dados, calendario, hoje).slice(0, RODADAS);
  estado = progresso.partida(hoje) ?? { respostas: [], dicaAtual: false };

  $('[data-numero-jogo]').textContent = `${rotuloJogo} · ${dataPorExtenso(hoje)}`;
  $('[data-pergunta]').textContent = `O que era mais caro, em dinheiro de ${dados.mesReferenciaTexto}?`;

  if (estado.respostas.length >= rodadas.length) {
    mostrarResultado(false);
  } else {
    mostrarRodada();
  }
  if (location.hash === '#progresso') abrirProgresso();
}

function preencherOpcao(botao, item) {
  $('[data-ano]', botao).textContent = item.quando;
  $('[data-nome]', botao).textContent = item.nome;
  $('[data-detalhe]', botao).textContent = item.detalhe;
}

function desenharBarra() {
  const atual = estado.respostas.length;
  $('[data-barra]').innerHTML = rodadas.map((_, i) => {
    const r = estado.respostas[i];
    const classe = r ? (r.acertou ? 'certo' : 'errado') : i === atual ? 'atual' : '';
    return `<span class="${classe}"></span>`;
  }).join('');
}

function mostrarRodada() {
  const i = estado.respostas.length;
  const rodada = rodadas[i];
  $('[data-rodada]').textContent = i + 1;
  desenharBarra();
  for (const botao of $$('.opcao')) {
    const lado = botao.dataset.opcao;
    preencherOpcao(botao, rodada[lado]);
    botao.disabled = false;
    botao.classList.remove('mais-caro', 'escolhida', 'acertou');
    botao.removeAttribute('data-veredito');
    $('[data-valores]', botao).hidden = true;
  }
  $('[data-proxima]').hidden = true;
  const pedirDica = $('[data-pedir-dica]');
  pedirDica.hidden = false;
  pedirDica.disabled = estado.dicaAtual;
  const textoDica = $('[data-dica-texto]');
  textoDica.hidden = !estado.dicaAtual;
  if (estado.dicaAtual) textoDica.textContent = textoDaDica(rodada);
}

function textoDaDica(rodada) {
  return `Na época, sem corrigir a inflação: ${rodada.a.nome.toLowerCase()} custava ${reais.format(rodada.a.preco)} (${rodada.a.quando}) e ${rodada.b.nome.toLowerCase()} custava ${reais.format(rodada.b.preco)} (${rodada.b.quando}).`;
}

function revelar(rodada, escolha) {
  for (const botao of $$('.opcao')) {
    const lado = botao.dataset.opcao;
    const item = rodada[lado];
    botao.disabled = true;
    const valores = $('[data-valores]', botao);
    valores.innerHTML = `
      <span>Em ${escapar(dados.mesReferenciaTexto)}: <strong>${reais.format(item.hoje)}</strong></span>
      <span>Na época: ${reais.format(item.preco)}</span>`;
    valores.hidden = false;
    botao.classList.toggle('mais-caro', lado === rodada.certo);
    if (escolha && lado === escolha) {
      botao.classList.add('escolhida');
      botao.classList.toggle('acertou', escolha === rodada.certo);
      botao.dataset.veredito = escolha === rodada.certo ? 'Acertou!' : 'Errou';
    }
  }
}

function escolher(lado) {
  const i = estado.respostas.length;
  const rodada = rodadas[i];
  if (!rodada) return;
  const acertou = lado === rodada.certo;
  estado.respostas.push({ escolha: lado, acertou, dica: estado.dicaAtual });
  estado.dicaAtual = false;
  progresso.salvarPartida(hoje, estado);

  revelar(rodada, lado);
  desenharBarra();
  $('[data-pedir-dica]').hidden = true;
  const proxima = $('[data-proxima]');
  proxima.textContent = i + 1 < rodadas.length ? 'Próxima rodada' : 'Ver meu resultado';
  proxima.hidden = false;
  proxima.focus();
  recado(acertou ? 'Acertou!' : 'Não foi dessa vez', 1200);
}

function calcularPlacar() {
  const acertos = estado.respostas.filter((r) => r.acertou).length;
  const pontos = estado.respostas.reduce((t, r) => t + (r.acertou ? (r.dica ? PONTOS_COM_DICA : PONTOS_ACERTO) : 0), 0);
  const dicas = estado.respostas.filter((r) => r.dica).length;
  return { acertos, pontos, dicas };
}

function frase(acertos) {
  if (acertos === 10) return 'Gabaritou! Você tem a memória de preços de um economista.';
  if (acertos >= 8) return 'Mandou muito bem. Pouca coisa escapa do seu bolso.';
  if (acertos >= 6) return 'Bom resultado. A inflação engana todo mundo de vez em quando.';
  if (acertos >= 4) return 'Os preços de antigamente pregaram algumas peças hoje.';
  return 'A inflação venceu hoje. Amanhã tem revanche!';
}

function mostrarResultado(acabouDeTerminar) {
  const placar = calcularPlacar();
  progresso.concluir(hoje, { valor: placar.acertos, pontos: placar.pontos, dicas: placar.dicas });
  atualizarSequenciaDoCabecalho();

  $('#jogo').hidden = true;
  const secao = $('#resultado');
  secao.hidden = false;
  $('[data-numero-jogo-final]').textContent = `${rotuloJogo} · ${dataPorExtenso(hoje)}`;
  $('[data-acertos]').textContent = placar.acertos;
  $('[data-grade]').innerHTML = estado.respostas
    .map((r) => `<span class="${r.acertou ? (r.dica ? 'com-dica' : 'certo') : ''}"></span>`).join('');
  $('[data-frase]').textContent = `${frase(placar.acertos)} Você fez ${placar.pontos} pontos${placar.dicas ? ` e usou ${placar.dicas} ${placar.dicas === 1 ? 'dica' : 'dicas'}` : ''}.`;

  const est = progresso.estatisticas(hoje);
  $('[data-sequencia]').innerHTML = htmlSequencia(est);

  $('[data-lista-fontes]').innerHTML = rodadas.map((r, i) => {
    const linha = (item) => `${escapar(item.nome)} (${escapar(item.quando)}): ${reais.format(item.preco)} na época, ${reais.format(item.hoje)} hoje. Fonte: <a href="${escapar(item.url)}" rel="nofollow noopener" target="_blank">${escapar(item.fonte)}</a>`;
    const resposta = estado.respostas[i];
    return `<li><strong>${resposta?.acertou ? 'Acertou' : 'Errou'}:</strong> ${linha(r.a)}; ${linha(r.b)}.</li>`;
  }).join('') + `<li>Correção pelo <a href="${escapar(dados.fonteIpca.url)}" rel="nofollow noopener" target="_blank">IPCA do IBGE</a>, até ${escapar(dados.mesReferenciaTexto)}.</li>`;

  if (acabouDeTerminar) {
    secao.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(abrirProgresso, 700);
  }
}

function textoCompartilhar() {
  const placar = calcularPlacar();
  const quadrados = estado.respostas.map((r) => (r.acertou ? (r.dica ? '🟨' : '🟩') : '⬛')).join('');
  const { sequencia } = progresso.estatisticas(hoje);
  return [
    `${window.SITE.nome} ${numero >= 1 ? `nº ${numero}` : ''} · ${placar.acertos}/10`.replace('  ', ' '),
    quadrados,
    sequencia > 1 ? `${sequencia} dias seguidos` : null,
    `https://${window.SITE.dominio}`,
  ].filter(Boolean).join('\n');
}

function abrirProgresso() {
  const est = progresso.estatisticas(hoje);
  const resultadoHoje = progresso.resultado(hoje);
  $('[data-conteudo-progresso]').innerHTML = htmlProgresso(est, {
    mediaRotulo: 'acertos por jogo',
    formatarMedia: (m) => m.toLocaleString('pt-BR', { maximumFractionDigits: 1 }),
    tituloDistribuicao: 'Acertos por jogo',
    valorHoje: resultadoHoje?.valor ?? null,
    faixas: [
      { rotulo: '10', testa: (v) => v === 10 },
      { rotulo: '9', testa: (v) => v === 9 },
      { rotulo: '8', testa: (v) => v === 8 },
      { rotulo: '7', testa: (v) => v === 7 },
      { rotulo: '6', testa: (v) => v === 6 },
      { rotulo: '≤5', testa: (v) => v <= 5 },
    ],
  });
  $('#painel-progresso [data-compartilhar]').hidden = !resultadoHoje;
  abrirPainel($('#painel-progresso'));
}

// ---------- Eventos ----------

for (const botao of $$('.opcao')) {
  botao.addEventListener('click', () => escolher(botao.dataset.opcao));
}

$('[data-proxima]').addEventListener('click', () => {
  if (estado.respostas.length >= rodadas.length) mostrarResultado(true);
  else mostrarRodada();
});

$('[data-pedir-dica]').addEventListener('click', () => abrirPainel($('#painel-dica')));

$('[data-assistir]').addEventListener('click', async (e) => {
  const botao = e.currentTarget;
  botao.disabled = true;
  $('#painel-dica').close();
  const ganhou = await mostrarAnuncioRecompensa();
  botao.disabled = false;
  if (!ganhou) {
    recado('A dica aparece quando o anúncio vai até o fim.');
    return;
  }
  estado.dicaAtual = true;
  progresso.salvarPartida(hoje, estado);
  const textoDica = $('[data-dica-texto]');
  textoDica.textContent = textoDaDica(rodadas[estado.respostas.length]);
  textoDica.hidden = false;
  $('[data-pedir-dica]').disabled = true;
});

for (const botao of $$('[data-abrir-progresso]')) botao.addEventListener('click', abrirProgresso);
for (const botao of $$('[data-compartilhar]')) botao.addEventListener('click', () => compartilhar(textoCompartilhar()));
for (const el of $$('[data-contagem]')) iniciarContagem(el);

carregar().catch(() => {
  $('[data-pergunta]').textContent = 'Não foi possível carregar o jogo de hoje. Verifique sua conexão e recarregue a página.';
});
