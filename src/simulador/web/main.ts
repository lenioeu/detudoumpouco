/**
 * Simulador do AssinaBot que roda inteiro no navegador (publicado como página no claude.ai).
 * Usa o mesmo código do bot: conversa, coleta de assinaturas, página de assinaturas,
 * manifesto e assinatura digital do PDF. Só o banco (memória), o WhatsApp (a própria
 * página) e a IA (Claude da conta de quem abre) são trocados.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";
import { AssinadorDePdf } from "../../assinatura/certificado.js";
import { carregarConfig } from "../../config.js";
import { Avisador, Filas } from "../../conversa/avisos.js";
import { Fluxo } from "../../conversa/fluxo.js";
import { ColetaDeAssinaturas } from "../../conversa/signatario.js";
import type { MensagemRecebida } from "../../whatsapp/webhook.js";
import { BancoMemoria } from "../banco-memoria.js";
import { type MensagemSimulada, WhatsAppSimulado } from "../whatsapp-simulado.js";
import { IaNoNavegador, type Sample } from "./ia-navegador.js";

declare const __CERTIFICADO_P12__: string;
declare const pdfjsLib: {
  getDocument(src: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getViewport(o: { scale: number }): { width: number; height: number };
        render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
        getTextContent(): Promise<{ items: { str?: string; hasEOL?: boolean }[] }>;
      }>;
    }>;
  };
};
type Capacidades = { use(nome: string): Promise<unknown> };
declare global {
  interface Window {
    claude?: Capacidades;
  }
}

const PESSOAS = [
  { telefone: "5551911112222", nome: "Escritório (você)", escritorio: true },
  { telefone: "5551988887777", nome: "Maria da Silva", escritorio: false },
  { telefone: "5551977776666", nome: "João Pereira", escritorio: false },
];
const SENHA_CERTIFICADO = "simulador-123";

// ---------------------------------------------------------------- montagem do bot

const config = carregarConfig({
  PUBLIC_URL: "https://claude.ai",
  DATABASE_PATH: ":memory:",
  AUTHORIZED_SENDERS: PESSOAS[0]!.telefone,
  SENDER_DISPLAY_NAME: "Escritório Exemplo Advocacia",
  SENDER_LOCATION: "Porto Alegre/RS",
  CERTIFICATE_PASSWORD: SENHA_CERTIFICADO,
  WHATSAPP_TOKEN: "simulador",
  WHATSAPP_PHONE_NUMBER_ID: "simulador",
  WHATSAPP_APP_SECRET: "simulador",
  WHATSAPP_VERIFY_TOKEN: "simulador",
});

const banco = new BancoMemoria();
const whatsapp = new WhatsAppSimulado();
const filas = new Filas();
const avisos = new Avisador(config, banco, whatsapp);
const assinador = new AssinadorDePdf(
  Buffer.from(__CERTIFICADO_P12__, "base64"),
  SENHA_CERTIFICADO,
  { nome: config.SENDER_DISPLAY_NAME, local: config.SENDER_LOCATION, contato: "Simulador AssinaBot" },
);
const coleta = new ColetaDeAssinaturas(config, banco, whatsapp, avisos, assinador, filas);

let sample: Sample | null = null;
let ia = new IaNoNavegador(null, extrairTexto, mostrarModo);
// O Fluxo chama a IA por esta ponte, para que ela possa ser trocada quando o Claude responder
const ponteIa = {
  analisar: (pdf: Uint8Array) => ia.analisar(pdf),
  corrigir: (...a: Parameters<IaNoNavegador["corrigir"]>) => ia.corrigir(...a),
};
const fluxo = new Fluxo(config, banco, whatsapp, ponteIa, coleta, avisos, filas);

// ---------------------------------------------------------------- utilidades

const $ = <T extends Element>(seletor: string, raiz: ParentNode = document) => raiz.querySelector(seletor) as T;

function formatarTelefone(t: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(t);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : `+${t}`;
}

function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Negrito e itálico no estilo do WhatsApp. */
function formatar(texto: string): string {
  return escapar(texto)
    .replace(/\*([^*\n]+)\*/g, "<b>$1</b>")
    .replace(/(^|\s)_([^_\n]+)_/g, "$1<i>$2</i>");
}

async function extrairTexto(pdf: Uint8Array): Promise<string> {
  const doc = await pdfjsLib.getDocument({ data: pdf.slice() }).promise;
  const paginas: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const conteudo = await (await doc.getPage(n)).getTextContent();
    paginas.push(conteudo.items.map((i) => (i.str ?? "") + (i.hasEOL ? "\n" : " ")).join(""));
  }
  return paginas.join("\n\n");
}

// ---------------------------------------------------------------- celulares

const celulares = new Map<string, HTMLElement>();
const digitando = new Map<string, number>();

function montarCelular(pessoa: (typeof PESSOAS)[number]): HTMLElement {
  const el = document.createElement("section");
  el.className = "celular";
  el.setAttribute("aria-label", `Celular de ${pessoa.nome}`);
  el.innerHTML = `
    <header class="cel-topo">
      <span class="avatar" aria-hidden="true">${escapar(pessoa.escritorio ? "E" : pessoa.nome[0]!)}</span>
      <span class="cel-nome"><strong>${escapar(pessoa.nome)}</strong><small>${formatarTelefone(pessoa.telefone)}</small></span>
    </header>
    <div class="conversa" role="log" aria-live="polite">
      <div class="vazio">${
        pessoa.escritorio
          ? `<p>Envie um PDF pelo 📎 ou use a procuração de exemplo.</p><button type="button" class="exemplo">Usar procuração de exemplo</button>`
          : "<p>Quando o escritório enviar um documento para esta pessoa, ele chega aqui.</p>"
      }</div>
    </div>
    <div class="digitando" hidden>bot digitando…</div>
    <form class="barra">
      <label class="acao" title="Enviar PDF"><span aria-hidden="true">📎</span><span class="sr">Enviar PDF</span><input type="file" accept="application/pdf" id="arquivo-${pessoa.telefone}"></label>
      <span class="menu-contato"><button type="button" class="acao abrir-contatos" title="Compartilhar contato"><span aria-hidden="true">👤</span><span class="sr">Compartilhar contato</span></button></span>
      <input class="texto" id="texto-${pessoa.telefone}" autocomplete="off" placeholder="Mensagem">
      <button class="enviar" type="submit">Enviar</button>
    </form>`;

  const form = $<HTMLFormElement>("form", el);
  const caixa = $<HTMLInputElement>("input.texto", el);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const texto = caixa.value.trim();
    if (!texto) return;
    caixa.value = "";
    enviar(pessoa.telefone, { tipo: "texto", texto }, { texto });
  });

  $<HTMLInputElement>("input[type=file]", el).addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    input.value = "";
    if (arquivo) enviarPdf(pessoa.telefone, arquivo.name, new Uint8Array(await arquivo.arrayBuffer()));
  });

  $<HTMLButtonElement>(".exemplo", el)?.addEventListener("click", async () => {
    enviarPdf(pessoa.telefone, "Procuração - Maria da Silva.pdf", await procuracaoDeExemplo());
  });

  const menu = $<HTMLElement>(".menu-contato", el);
  $<HTMLButtonElement>(".abrir-contatos", el).addEventListener("click", () => {
    const aberto = $("ul", menu);
    if (aberto) {
      aberto.remove();
      return;
    }
    const ul = document.createElement("ul");
    for (const outra of PESSOAS.filter((p) => p.telefone !== pessoa.telefone)) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = outra.nome;
      b.addEventListener("click", () => {
        ul.remove();
        enviar(
          pessoa.telefone,
          { tipo: "contato", contatos: [{ nome: outra.nome, telefones: [outra.telefone] }] },
          { texto: `👤 Contato: ${outra.nome}` },
        );
      });
      li.append(b);
      ul.append(li);
    }
    menu.append(ul);
  });

  return el;
}

type SemRemetente<T> = T extends unknown ? Omit<T, "de" | "id"> : never;
type Conteudo = SemRemetente<MensagemRecebida>;

function enviar(telefone: string, conteudo: Conteudo, exibicao: Omit<MensagemSimulada, "id" | "direcao" | "em" | "telefone">): void {
  const id = whatsapp.registrarDaPessoa({ telefone, ...exibicao });
  mostrarDigitando(telefone);
  void fluxo.receberMensagem({ de: telefone, id, ...conteudo } as MensagemRecebida);
}

function enviarPdf(telefone: string, nome: string, dados: Uint8Array): void {
  const arquivo = whatsapp.guardarArquivo(nome, dados);
  enviar(telefone, { tipo: "documento", mediaId: arquivo.id, mimeType: "application/pdf", nomeArquivo: nome }, { arquivo });
}

function mostrarDigitando(telefone: string): void {
  const el = $<HTMLElement>(".digitando", celulares.get(telefone)!);
  el.hidden = false;
  window.clearTimeout(digitando.get(telefone));
  digitando.set(telefone, window.setTimeout(() => (el.hidden = true), 120_000));
}

function mostrar(m: MensagemSimulada): void {
  const celular = celulares.get(m.telefone);
  if (!celular) return;
  const conversa = $<HTMLElement>(".conversa", celular);
  $(".vazio", conversa)?.remove();
  if (m.direcao === "bot") $<HTMLElement>(".digitando", celular).hidden = true;

  const bolha = document.createElement("div");
  bolha.className = `msg ${m.direcao}`;
  let html = m.template ? `<div class="rotulo">Mensagem de modelo aprovado pela Meta</div>` : "";
  if (m.arquivo) {
    html += `<button type="button" class="arquivo" data-arquivo="${m.arquivo.id}"><span class="pdf" aria-hidden="true">PDF</span><span>${escapar(m.arquivo.nome)}</span></button>`;
  }
  if (m.texto) html += `<div>${formatar(m.texto)}</div>`;
  html += `<div class="hora">${new Date(m.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>`;
  bolha.innerHTML = html;
  bolha.querySelector<HTMLButtonElement>(".arquivo")?.addEventListener("click", () => abrirPdf(m.arquivo!.id));
  conversa.append(bolha);

  if (m.botoes?.length) {
    const botoes = document.createElement("div");
    botoes.className = "botoes";
    for (const b of m.botoes) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = b.titulo;
      btn.addEventListener("click", () => enviar(m.telefone, { tipo: "botao", botaoId: b.id }, { texto: `👆 ${b.titulo}` }));
      botoes.append(btn);
    }
    conversa.append(botoes);
  }
  conversa.scrollTop = conversa.scrollHeight;
}

// ---------------------------------------------------------------- leitor de PDF

let downloads: { save(r: { filename: string; data: Uint8Array }): Promise<unknown> } | null = null;

async function abrirPdf(id: string): Promise<void> {
  const arquivo = whatsapp.arquivo(id);
  if (!arquivo) return;
  const dialogo = $<HTMLDialogElement>("#leitor");
  $("#leitor-titulo").textContent = arquivo.nome;
  const paginas = $<HTMLElement>("#leitor-paginas");
  paginas.innerHTML = `<p class="carregando">Abrindo…</p>`;
  const salvar = $<HTMLButtonElement>("#leitor-salvar");
  salvar.hidden = !downloads;
  salvar.onclick = async () => {
    try {
      await downloads!.save({ filename: arquivo.nome, data: arquivo.dados });
    } catch {
      // A pessoa pode recusar o download; nada a fazer
    }
  };
  dialogo.showModal();

  const doc = await pdfjsLib.getDocument({ data: arquivo.dados.slice() }).promise;
  paginas.innerHTML = "";
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const viewport = pagina.getViewport({ scale: 1.6 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.setAttribute("aria-label", `Página ${n} de ${doc.numPages}`);
    paginas.append(canvas);
    await pagina.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
  }
}

// ---------------------------------------------------------------- modo da IA

function mostrarModo(modo: "claude" | "demonstracao", motivo?: string): void {
  const chip = $<HTMLElement>("#modo");
  const aviso = $<HTMLElement>("#aviso-modo");
  if (modo === "claude") {
    chip.textContent = "IA: Claude lê o documento";
    chip.dataset.modo = "claude";
    aviso.hidden = true;
  } else {
    chip.textContent = "IA: modo demonstração";
    chip.dataset.modo = "demo";
    aviso.hidden = false;
    aviso.innerHTML =
      `${motivo ? escapar(motivo) + " " : ""}Sem o Claude, o documento não é lido: depois de enviar o PDF, toque em <b>Corrigir</b> e escreva as partes, ` +
      `por exemplo <code>outorgante: Maria da Silva; outorgado: João Pereira</code>.`;
  }
}

// ---------------------------------------------------------------- documento de exemplo

async function procuracaoDeExemplo(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const pagina = doc.addPage([595.28, 841.89]);
  const fonte = await doc.embedFont(StandardFonts.TimesRoman);
  const negrito = await doc.embedFont(StandardFonts.TimesRomanBold);
  let y = 770;
  const linha = (t: string, f = fonte, tamanho = 12, x = 72) => {
    pagina.drawText(t, { x, y, size: tamanho, font: f });
    y -= tamanho * 1.6;
  };
  linha("PROCURAÇÃO AD JUDICIA ET EXTRA", negrito, 15, 170);
  y -= 14;
  for (const t of [
    "OUTORGANTE: MARIA DA SILVA, brasileira, casada, comerciante, inscrita no CPF sob o",
    "nº 529.982.247-25, residente e domiciliada na Rua dos Andradas, 1234, Centro Histórico,",
    "Porto Alegre/RS, CEP 90020-008.",
  ])
    linha(t);
  y -= 8;
  for (const t of [
    "OUTORGADO: JOÃO PEREIRA, advogado, inscrito na OAB/RS sob o nº 123.456, com escritório",
    "na Avenida Borges de Medeiros, 500, sala 801, Porto Alegre/RS.",
  ])
    linha(t);
  y -= 8;
  for (const t of [
    "PODERES: pelo presente instrumento particular de mandato, a outorgante nomeia e constitui",
    "o outorgado seu procurador, conferindo-lhe os poderes da cláusula ad judicia et extra, para",
    "o foro em geral, em qualquer juízo, instância ou tribunal, podendo propor as ações",
    "competentes e defendê-la nas contrárias, seguindo umas e outras até final decisão, usando",
    "os recursos legais e acompanhando-os, conferindo-lhe ainda poderes especiais para",
    "confessar, desistir, transigir, firmar compromissos ou acordos, receber e dar quitação,",
    "e substabelecer esta em outrem, com ou sem reserva de iguais poderes.",
  ])
    linha(t);
  y -= 24;
  linha("Porto Alegre, 15 de outubro de 2026.");
  y -= 40;
  linha("_______________________________________", fonte, 12, 170);
  linha("MARIA DA SILVA", negrito, 12, 235);
  return doc.save();
}

// ---------------------------------------------------------------- início

function iniciar(): void {
  const area = $<HTMLElement>("#celulares");
  for (const p of PESSOAS) {
    const el = montarCelular(p);
    celulares.set(p.telefone, el);
    area.append(el);
  }
  whatsapp.aoReceber(mostrar);
  $<HTMLButtonElement>("#leitor-fechar").addEventListener("click", () => $<HTMLDialogElement>("#leitor").close());
  mostrarModo("demonstracao", "Conectando ao Claude…");
  $<HTMLElement>("#aviso-modo").hidden = true;

  const capacidades = window.claude;
  if (!capacidades) {
    mostrarModo("demonstracao", "Esta página está fora do claude.ai, então o Claude não está disponível.");
    return;
  }
  void capacidades.use("sample").then((s) => {
    sample = (s as Sample | null) ?? null;
    ia = new IaNoNavegador(sample, extrairTexto, mostrarModo);
    if (sample) mostrarModo("claude");
    else mostrarModo("demonstracao", "O Claude não está disponível nesta visualização.");
  });
  void capacidades.use("downloads").then((d) => {
    downloads = (d as typeof downloads) ?? null;
  });
}

iniciar();
