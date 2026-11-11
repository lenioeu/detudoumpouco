import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Envio, Repositorio, Signatario } from "./banco.js";
import { FORMATO_CODIGO_CURTO } from "./codigo-curto.js";
import { mascararCpf } from "./cpf.js";
import { formatarDataHora, fundamentoLegal, sha256 } from "./assinatura/pagina.js";
import { mascararTelefone } from "./telefone.js";

export function urlDeVerificacao(urlPublica: string, codigo: string): string {
  return `${urlPublica.replace(/\/+$/, "")}/verificar/${codigo}`;
}

/** Link curto de verificação (/v/CODIGO); envios antigos, sem código curto, ficam com o link completo. */
export function linkDoEnvio(urlPublica: string, envio: Pick<Envio, "id" | "codigoCurto">): string {
  return envio.codigoCurto ? `${urlPublica.replace(/\/+$/, "")}/v/${envio.codigoCurto}` : urlDeVerificacao(urlPublica, envio.id);
}

/** Cabeçalhos das páginas e respostas de verificação: fora dos buscadores, sem cache, sem repassar o endereço. */
export const CABECALHOS_DE_VERIFICACAO = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Acha o envio por código completo (UUID) ou curto (7 caracteres, maiúsculas ou minúsculas). */
function envioPorCodigo(banco: Repositorio, codigo: string): Envio | null {
  const limpo = codigo.trim();
  if (UUID.test(limpo.toLowerCase())) return banco.envio(limpo.toLowerCase());
  if (FORMATO_CODIGO_CURTO.test(limpo.toUpperCase())) return banco.envioPorCodigoCurto(limpo);
  return null;
}

/** Endereço canônico da verificação de um envio (o curto, quando existe). */
const caminhoDoEnvio = (envio: Pick<Envio, "id" | "codigoCurto">) => (envio.codigoCurto ? `/v/${envio.codigoCurto}` : `/verificar/${envio.id}`);

/**
 * Nome como aparece na página pública: primeiro nome e iniciais dos demais ("Kamila L. F. C.").
 * O nome completo está no próprio documento; a internet não precisa dele (LGPD, art. 6º, III).
 */
export function nomeParcial(nome: string): string {
  const [primeiro = "", ...resto] = nome.trim().split(/\s+/);
  const iniciais = resto.filter((p) => !/^(d[aeo]s?|e)$/i.test(p)).map((p) => `${p[0]!.toUpperCase()}.`);
  return [primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase(), ...iniciais].join(" ");
}

const hora = (iso: string) => formatarDataHora(iso, false);

// ------------------------------------------------------------------ resultado de um documento

/**
 * Página pública de verificação, aberta pelo QR Code ou pelo link do rodapé.
 * Mostra a situação do documento, os hashes, cada assinatura com o nível e as provas (com dados
 * pessoais parcialmente ocultos) e permite conferir no navegador se um PDF é a via assinada.
 * Não oferece download do documento.
 */
export function paginaDeVerificacao(banco: Repositorio, codigo: string, nomeDoEscritorio: string): { status: number; html: string } {
  const envio = envioPorCodigo(banco, codigo);
  if (!envio) {
    return {
      status: 404,
      html: paginaInicialDeVerificacao({
        aviso: `Não encontramos documento com o código <code>${esc(codigo.slice(0, 64))}</code>. Confira o código impresso ao lado do QR Code, no rodapé do PDF.`,
      }),
    };
  }

  const signatarios = banco.signatarios(envio.id);
  const final = banco.pdfFinal(envio.id);
  const hashFinal = final ? sha256(final) : null;
  const carimbo = banco.carimbo(envio.id);
  const assinadas = signatarios.filter((s) => s.status === "assinado").length;
  const concluidoEm =
    envio.status === "concluido"
      ? signatarios
          .map((s) => s.assinadoEm)
          .filter((d): d is string => !!d)
          .sort()
          .at(-1)
      : undefined;

  const situacao =
    envio.status === "concluido"
      ? { classe: "ok", titulo: "Documento assinado por todos", texto: "Todas as pessoas indicadas assinaram. A via final está lacrada contra alterações." }
      : envio.status === "recusado"
        ? { classe: "erro", titulo: "Assinatura recusada", texto: "Uma das pessoas recusou assinar. O documento não foi concluído e não tem via final." }
        : { classe: "espera", titulo: "Aguardando assinaturas", texto: "O documento ainda não foi assinado por todos. Esta página se atualiza a cada assinatura." };

  const icone =
    situacao.classe === "ok"
      ? `<path d="M5 12.5l4.5 4.5L19 7.5"/>`
      : situacao.classe === "erro"
        ? `<path d="M7 7l10 10M17 7L7 17"/>`
        : `<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/>`;

  const hashes = [
    { rotulo: "Via final assinada", valor: hashFinal, ajuda: "É a impressão digital do PDF que as partes receberam no WhatsApp." },
    { rotulo: "Documento original", valor: envio.hashOriginal, ajuda: "É a impressão digital do PDF enviado para assinatura, antes das assinaturas." },
  ]
    .filter((h): h is { rotulo: string; valor: string; ajuda: string } => !!h.valor)
    .map(
      (h) => `<div class="hash">
        <div class="hash-topo"><span>${h.rotulo}</span><button type="button" class="copiar" data-copiar="${h.valor}">Copiar</button></div>
        <code>${h.valor}</code>
        <p>${h.ajuda}</p>
      </div>`,
    )
    .join("");

  const conferencia = `<section class="bloco" aria-labelledby="titulo-conferir">
      <h2 id="titulo-conferir">Conferir o arquivo que você tem</h2>
      <p>Escolha ou arraste o PDF. A conferência é feita no seu aparelho: o arquivo não é enviado para lugar nenhum.</p>
      <label class="soltar" data-modo="local" data-final="${hashFinal ?? ""}" data-original="${envio.hashOriginal}">
        <input type="file" accept="application/pdf,.pdf" class="so-leitor">
        <span class="soltar-icone" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 14l2 2 4-4"/></svg></span>
        <span class="soltar-texto"><strong>Escolher o PDF</strong> ou arrastar para cá</span>
      </label>
      <div class="resultado" role="status" aria-live="polite"></div>
    </section>`;

  const assinaturas = signatarios.map((s) => cartaoDeSignatario(s, envio)).join("");

  const lacre =
    envio.status === "concluido"
      ? `<section class="bloco" aria-labelledby="titulo-provas">
      <h2 id="titulo-provas">Proteções da via final</h2>
      <dl class="provas">
        <dt>Lacre digital</dt>
        <dd>O PDF final é lacrado com assinatura digital (padrão PAdES) emitida pelo DeAcordo. Qualquer alteração feita depois aparece como lacre inválido no leitor de PDF. O lacre protege o arquivo; não é um certificado ICP-Brasil e não substitui a assinatura das partes.</dd>
        ${
          carimbo
            ? `<dt>Carimbo do tempo</dt>
        <dd>Emitido em ${esc(hora(carimbo.em))} por ${esc(hostDe(carimbo.autoridade))}, autoridade independente, sobre o SHA-256 da via final (RFC 3161). Prova que a via já existia nesse momento. <a href="/verificar/${esc(envio.id)}/carimbo.tsr" download>Baixar o carimbo (.tsr)</a></dd>`
            : ""
        }
      </dl>
    </section>`
      : "";

  const corpo = `
  <section class="situacao ${situacao.classe}">
    <span class="situacao-icone" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${icone}</svg></span>
    <div>
      <p class="rotulo">Verificação de assinatura</p>
      <h1>${situacao.titulo}</h1>
      <p>${situacao.texto}</p>
      <p class="contagem"><strong>${assinadas} de ${signatarios.length}</strong> ${signatarios.length === 1 ? "assinatura" : "assinaturas"}</p>
    </div>
  </section>

  <section class="bloco" aria-labelledby="titulo-documento">
    <h2 id="titulo-documento">Documento</h2>
    <dl class="dados">
      <dt>Título</dt><dd>${esc(envio.titulo)}</dd>
      <dt>Enviado por</dt><dd>${esc(nomeDoEscritorio)}</dd>
      <dt>Criado em</dt><dd>${esc(hora(envio.criadoEm))}</dd>
      ${concluidoEm ? `<dt>Concluído em</dt><dd>${esc(hora(concluidoEm))}</dd>` : ""}
      <dt>Código</dt><dd><code>${esc(envio.codigoCurto ?? envio.id)}</code></dd>
    </dl>
    <p class="nota">Horários de Brasília (UTC−3).</p>
    <div class="hashes">${hashes}</div>
  </section>

  ${conferencia}

  <section class="bloco" aria-labelledby="titulo-assinaturas">
    <div class="bloco-topo"><h2 id="titulo-assinaturas">Assinaturas</h2><span class="contador">${assinadas} de ${signatarios.length}</span></div>
    <ul class="signatarios">${assinaturas}</ul>
    <p class="nota">Nesta página pública, nomes, CPF e WhatsApp aparecem parcialmente ocultos. Os dados completos estão na via assinada.</p>
  </section>

  ${lacre}

  <section class="bloco validade" aria-labelledby="titulo-lei">
    <h2 id="titulo-lei">Validade jurídica</h2>
    <p>${esc(fundamentoLegal(envio.exigeSelfie))} A MP 2.200-2/2001 admite outros meios de comprovar autoria e integridade além do certificado ICP-Brasil, desde que aceitos pelas partes ou pela pessoa a quem o documento for oposto.</p>
    <p><a href="/#validade">Entenda a validade jurídica</a> · <a href="/verificar">Verificar outro documento</a></p>
  </section>`;

  return { status: 200, html: moldura(`${envio.titulo} · Verificação`, corpo) };
}

function cartaoDeSignatario(s: Signatario, envio: Envio): string {
  const nivel =
    s.status === "assinado"
      ? envio.exigeSelfie
        ? `<span class="chip ok">Assinatura eletrônica avançada</span>`
        : `<span class="chip ok">Assinatura eletrônica simples</span>`
      : s.status === "recusado"
        ? `<span class="chip erro">Recusou assinar</span>`
        : `<span class="chip espera">Ainda não assinou</span>`;
  const etapas = [
    ["Convite enviado pelo WhatsApp", s.linkEnviadoEm],
    ["Abriu o documento", s.visualizadoEm],
    ["Enviou selfie com documento de identidade", s.selfieEm],
    ["Assinou", s.assinadoEm],
  ]
    .filter((e): e is [string, string] => !!e[1])
    .map(([o, quando]) => `<li><time datetime="${esc(quando)}">${esc(hora(quando))}</time><span>${o}</span></li>`)
    .join("");
  const metodo =
    s.status === "assinado"
      ? `Confirmou pelo WhatsApp do próprio número, informando o CPF${s.selfieEm ? ", e enviou selfie segurando documento de identidade" : ""}.`
      : "";
  return `<li class="signatario">
      <div class="signatario-topo"><div><h3>${esc(nomeParcial(s.nome))}</h3><span class="papel">${esc(s.papel)}</span></div>${nivel}</div>
      <p class="contato">${s.cpf ? `<span>CPF ${esc(mascararCpf(s.cpf))}</span> · ` : ""}<span>WhatsApp ${esc(mascararTelefone(s.telefone))}</span></p>
      ${metodo ? `<p class="metodo">${metodo}</p>` : ""}
      ${etapas ? `<ol class="etapas">${etapas}</ol>` : ""}
    </li>`;
}

// ------------------------------------------------------------------ tela inicial e consulta por arquivo

/** Tela /verificar: digitar o código ou escolher o PDF (o hash é calculado no navegador). */
export function paginaInicialDeVerificacao(opcoes: { aviso?: string; codigo?: string } = {}): string {
  const corpo = `
  <section class="inicio">
    <p class="rotulo">Verificar documento</p>
    <h1>Confira se um documento assinado pelo DeAcordo é <i>autêntico</i></h1>
    <p>Use o código impresso ao lado do QR Code, no rodapé do PDF, ou escolha o próprio arquivo.</p>
  </section>
  ${opcoes.aviso ? `<p class="aviso" role="alert">${opcoes.aviso}</p>` : ""}
  <div class="opcoes">
    <section class="bloco" aria-labelledby="titulo-codigo">
      <h2 id="titulo-codigo">Pelo código</h2>
      <p>São 7 letras e números, como <code>K7P2QXM</code>. Também aparece no fim do link de verificação.</p>
      <form class="form-codigo" action="/verificar" method="get">
        <label class="so-leitor" for="codigo">Código do documento</label>
        <input id="codigo" name="codigo" value="${esc(opcoes.codigo ?? "")}" placeholder="K7P2QXM" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="36" required>
        <button class="botao principal" type="submit">Verificar</button>
      </form>
    </section>
    <section class="bloco" aria-labelledby="titulo-arquivo">
      <h2 id="titulo-arquivo">Pelo arquivo</h2>
      <p>O arquivo não sai do seu aparelho: calculamos aqui a impressão digital dele (SHA-256) e consultamos só ela.</p>
      <label class="soltar" data-modo="consulta">
        <input type="file" accept="application/pdf,.pdf" class="so-leitor">
        <span class="soltar-icone" aria-hidden="true"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 18v-6M9 15l3-3 3 3"/></svg></span>
        <span class="soltar-texto"><strong>Escolher o PDF</strong> ou arrastar para cá</span>
      </label>
      <div class="resultado" role="status" aria-live="polite"></div>
    </section>
  </div>`;
  return moldura("Verificar documento · DeAcordo", corpo);
}

/** Leva o código digitado na tela inicial à página do documento. */
export function destinoDoCodigo(banco: Repositorio, codigo: string): string | null {
  const envio = envioPorCodigo(banco, codigo);
  return envio ? caminhoDoEnvio(envio) : null;
}

export type RespostaDeConsulta =
  | { encontrado: false }
  | { encontrado: true; arquivo: "final" | "original"; titulo: string; situacao: Envio["status"]; endereco: string };

/** Consulta pelo SHA-256 de um arquivo (calculado no navegador de quem verifica). */
export function consultarPorHash(banco: Repositorio, hash: string): RespostaDeConsulta | null {
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  const achado = banco.envioPorHash(hash);
  if (!achado) return { encontrado: false };
  return {
    encontrado: true,
    arquivo: achado.arquivo,
    titulo: achado.envio.titulo,
    situacao: achado.envio.status,
    endereco: caminhoDoEnvio(achado.envio),
  };
}

// ------------------------------------------------------------------ moldura com o cabeçalho e o rodapé do site

const PASTA_DO_SITE = new URL("../site/", import.meta.url);

/**
 * Cabeçalho, rodapé e endereços versionados dos estilos vêm da página de privacidade do próprio site,
 * para a verificação ter a mesma cara (e os mesmos ?v=) sem repetir código. Lidos uma vez.
 */
let partes: { cabeca: string; topo: string; rodape: string; css: string; js: string } | null = null;
function partesDoSite() {
  if (partes) return partes;
  const modelo = readFileSync(new URL("privacidade.html", PASTA_DO_SITE), "utf8");
  const trecho = (re: RegExp) => re.exec(modelo)?.[0] ?? "";
  const versao = (arquivo: string) => createHash("sha256").update(readFileSync(new URL(arquivo, PASTA_DO_SITE))).digest("hex").slice(0, 8);
  partes = {
    cabeca: [...modelo.matchAll(/^<(?:script>\(\(\)=>|link rel="(?:icon|preconnect|stylesheet)"|script src)[^\n]*$/gm)].map((m) => m[0]).join("\n"),
    topo: trecho(/<header class="topo">[\s\S]*?<\/header>/),
    rodape: trecho(/<footer class="rodape">[\s\S]*?<\/footer>/),
    css: `/verificar.css?v=${versao("verificar.css")}`,
    js: `/verificar.js?v=${versao("verificar.js")}`,
  };
  return partes;
}

function moldura(titulo: string, corpo: string): string {
  const p = partesDoSite();
  return `<!doctype html>
<html lang="pt-BR" data-theme="escuro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(titulo)}</title>
${p.cabeca}
<link rel="stylesheet" href="${p.css}">
<script src="${p.js}" defer></script>
</head>
<body class="pagina-verificacao">
${p.topo}
<main class="verificacao">${corpo}
</main>
${p.rodape}
</body>
</html>`;
}

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Arquivo .tsr do carimbo do tempo, para conferência independente (ex.: openssl ts -verify). */
export function arquivoDoCarimbo(banco: Repositorio, codigo: string): Uint8Array | null {
  return UUID.test(codigo) ? (banco.carimbo(codigo)?.token ?? null) : null;
}
