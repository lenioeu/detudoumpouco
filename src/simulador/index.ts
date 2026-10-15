/**
 * Simulador: roda o bot de verdade, mas no lugar do WhatsApp usa uma página no navegador
 * com três celulares (escritório e duas pessoas). Não precisa de conta na Meta.
 *
 *   npm run simulador   →   abra http://localhost:3000
 */
import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import { AssinadorDePdf } from "../assinatura/certificado.js";
import { Banco } from "../banco.js";
import { carregarConfig } from "../config.js";
import { Avisador, Filas } from "../conversa/avisos.js";
import { Fluxo } from "../conversa/fluxo.js";
import { ColetaDeAssinaturas } from "../conversa/signatario.js";
import { IdentificadorDePartes } from "../ia/partes.js";
import type { MensagemRecebida } from "../whatsapp/webhook.js";
import { IaDeDemonstracao } from "./ia-demonstracao.js";
import { WhatsAppSimulado } from "./whatsapp-simulado.js";

const PESSOAS = [
  { telefone: "5551911112222", nome: "Escritório (você)", escritorio: true },
  { telefone: "5551988887777", nome: "Maria da Silva", escritorio: false },
  { telefone: "5551977776666", nome: "João Pereira", escritorio: false },
];
const porta = Number(process.env.SIMULADOR_PORTA ?? 3000);
const comIa = Boolean(process.env.ANTHROPIC_API_KEY);

const config = carregarConfig({
  ...process.env,
  PUBLIC_URL: `http://localhost:${porta}`,
  DATABASE_PATH: ":memory:",
  AUTHORIZED_SENDERS: PESSOAS.filter((p) => p.escritorio).map((p) => p.telefone).join(","),
  SENDER_DISPLAY_NAME: process.env.SENDER_DISPLAY_NAME ?? "Escritório Exemplo Advocacia",
  CERTIFICATE_PATH: process.env.CERTIFICATE_PATH ?? "data/simulador-certificado.p12",
  CERTIFICATE_PASSWORD: process.env.CERTIFICATE_PASSWORD ?? "simulador-123",
  WHATSAPP_TOKEN: "simulador",
  WHATSAPP_PHONE_NUMBER_ID: "simulador",
  WHATSAPP_APP_SECRET: "simulador",
  WHATSAPP_VERIFY_TOKEN: "simulador",
});

const banco = new Banco(config.DATABASE_PATH);
const whatsapp = new WhatsAppSimulado();
const filas = new Filas();
const avisos = new Avisador(config, banco, whatsapp);
const assinador = AssinadorDePdf.carregarOuGerar(config.CERTIFICATE_PATH, config.CERTIFICATE_PASSWORD, {
  nome: config.SENDER_DISPLAY_NAME,
  local: config.SENDER_LOCATION,
  contato: config.PUBLIC_URL,
});
const coleta = new ColetaDeAssinaturas(config, banco, whatsapp, avisos, assinador, filas);
const ia = comIa ? new IdentificadorDePartes(new Anthropic(), config.ANTHROPIC_MODEL) : new IaDeDemonstracao();
const fluxo = new Fluxo(config, banco, whatsapp, ia, coleta, avisos, filas);

const app = express();
const pagina = readFileSync(new URL("./pagina.html", import.meta.url), "utf8");

app.get("/", (_req, res) => {
  res.type("html").send(pagina);
});

app.get("/estado", (_req, res) => {
  res.json({ pessoas: PESSOAS, mensagens: whatsapp.mensagens, comIa });
});

// Atualizações ao vivo para a página
app.get("/eventos", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders();
  const enviar = (m: unknown) => res.write(`data: ${JSON.stringify(m)}\n\n`);
  whatsapp.on("mensagem", enviar);
  req.on("close", () => whatsapp.off("mensagem", enviar));
});

app.get("/arquivo/:id", (req, res) => {
  const arquivo = whatsapp.arquivo(req.params.id);
  if (!arquivo) {
    res.sendStatus(404);
    return;
  }
  res.type("application/pdf").set("Content-Disposition", `inline; filename="${encodeURIComponent(arquivo.nome)}"`);
  res.send(Buffer.from(arquivo.dados));
});

app.post("/enviar", express.json(), (req, res) => {
  const { tipo, texto, botaoId, botaoTitulo, contatoTelefone } = req.body as Record<string, string | undefined>;
  const telefone = String((req.body as { telefone?: unknown }).telefone ?? "");
  if (!PESSOAS.some((p) => p.telefone === telefone)) {
    res.status(400).json({ erro: "telefone desconhecido" });
    return;
  }
  let mensagem: MensagemRecebida;
  if (tipo === "texto" && texto?.trim()) {
    const id = whatsapp.registrarDaPessoa({ telefone, texto });
    mensagem = { tipo: "texto", de: telefone, id, texto };
  } else if (tipo === "botao" && botaoId) {
    const id = whatsapp.registrarDaPessoa({ telefone, texto: `👆 ${botaoTitulo ?? "botão"}` });
    mensagem = { tipo: "botao", de: telefone, id, botaoId };
  } else if (tipo === "contato" && contatoTelefone) {
    const pessoa = PESSOAS.find((p) => p.telefone === contatoTelefone);
    const nome = pessoa?.nome ?? contatoTelefone;
    const id = whatsapp.registrarDaPessoa({ telefone, texto: `👤 Contato: ${nome}` });
    mensagem = { tipo: "contato", de: telefone, id, contatos: [{ nome, telefones: [contatoTelefone] }] };
  } else {
    res.status(400).json({ erro: "mensagem inválida" });
    return;
  }
  res.json({ ok: true });
  void fluxo.receberMensagem(mensagem);
});

app.post("/enviar-pdf", express.raw({ type: "application/pdf", limit: "40mb" }), (req, res) => {
  const telefone = String(req.query.telefone ?? "");
  const nome = decodeURIComponent(String(req.header("x-nome-arquivo") ?? "documento.pdf"));
  if (!PESSOAS.some((p) => p.telefone === telefone) || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ erro: "envio inválido" });
    return;
  }
  const arquivo = whatsapp.guardarArquivo(nome, new Uint8Array(req.body));
  const id = whatsapp.registrarDaPessoa({ telefone, arquivo });
  res.json({ ok: true });
  void fluxo.receberMensagem({ tipo: "documento", de: telefone, id, mediaId: arquivo.id, mimeType: "application/pdf", nomeArquivo: nome });
});

app.listen(porta, "127.0.0.1", () => {
  console.log(`\nSimulador do AssinaBot: abra http://localhost:${porta} no navegador`);
  console.log(
    comIa
      ? "IA: Claude (lê o documento de verdade)"
      : "IA: modo demonstração (sem ANTHROPIC_API_KEY, as partes são informadas por texto)",
  );
});
