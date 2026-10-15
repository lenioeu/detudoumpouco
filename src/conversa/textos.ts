import type { Envio, Signatario } from "../banco.js";
import type { Analise } from "../ia/partes.js";
import { formatarTelefone } from "../telefone.js";
import type { ParteComContato } from "./estado.js";

export const AJUDA =
  "Olá! Envie aqui o *PDF* que precisa ser assinado.\n\n" +
  "Eu leio o documento, identifico quem deve assinar, peço o contato de cada pessoa e mando o documento para cada uma assinar aqui mesmo, pelo WhatsApp.\n\n" +
  "Para acompanhar o que já foi enviado, escreva *documentos*. A qualquer momento, escreva *cancelar* para recomeçar.";

export function listaDePartes(analise: Analise): string {
  const ordem = analise.ordem === "sequencial" ? "nesta ordem" : "em qualquer ordem";
  const partes = analise.partes
    .map((p, i) => `${i + 1}. *${p.nome ?? "(nome em branco)"}*, ${p.papel}`)
    .join("\n");
  const observacao = analise.observacao ? `\n\n⚠️ ${analise.observacao}` : "";
  return `📄 *${analise.titulo}*\n\nQuem assina (${ordem}):\n${partes}${observacao}\n\nEstá certo?`;
}

/** Pedido dos contatos que faltam, todos de uma vez. */
export function pedidoDeContatos(
  analise: Analise,
  contatos: (ParteComContato | null)[],
  excluidas: number[],
  reconhecido: number | null,
): string {
  const faltam = analise.partes
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => !contatos[i] && !excluidas.includes(i))
    .map(({ p }) => (p.nome ? `• *${p.nome}* (${p.papel})` : `• (nome em branco), ${p.papel}: mande nome completo e telefone`));
  const prontos = analise.partes
    .map((p, i) => ({ p, i, c: contatos[i] }))
    .filter(({ c }) => c)
    .map(({ i, c }) => `✓ *${c!.nome}* (${c!.papel})${i === reconhecido ? " — parece ser você" : `: ${formatarTelefone(c!.telefone)}`}`);
  return (
    `Envie o telefone com DDD de quem assina:\n${faltam.join("\n")}` +
    (prontos.length ? `\n\n${prontos.join("\n")}` : "") +
    "\n\nPode mandar todos de uma vez, um por linha (ex.: _Maria da Silva 51 99999-8888_), ou compartilhar os contatos. " +
    "Se alguém não vai assinar, é só dizer (ex.: _só a Maria assina_)."
  );
}

export function resumoParaEnvio(analise: Analise, contatos: ParteComContato[], selfie: boolean): string {
  const ordem = analise.ordem === "sequencial" ? "um de cada vez, nesta ordem" : "todos ao mesmo tempo";
  const linhas = contatos
    .map((c, i) => `${i + 1}. ${c.nome} (${c.papel}): ${formatarTelefone(c.telefone)}`)
    .join("\n");
  return (
    `Confira antes de enviar:\n\n📄 *${analise.titulo}*\n\n${linhas}\n\n` +
    `Cada pessoa recebe o documento no WhatsApp, ${ordem}.` +
    (selfie ? " Depois do CPF, cada uma manda uma selfie segurando um documento de identidade." : "") +
    " Posso enviar?"
  );
}

/** Lista para o comando "documentos". */
export function listaDeDocumentos(envios: { envio: Envio; signatarios: Signatario[] }[]): string {
  if (!envios.length) return "Você ainda não enviou nenhum documento por aqui. Mande um PDF para começar.";
  const linhas = envios.map(({ envio, signatarios }) => {
    const assinaram = signatarios.filter((s) => s.status === "assinado").length;
    const contagem = `${assinaram}/${signatarios.length} assinaram`;
    if (envio.status === "concluido") return `✅ *${envio.titulo}*: ${contagem}`;
    if (envio.status === "recusado") {
      const quem = signatarios.find((s) => s.status === "recusado");
      return `❌ *${envio.titulo}*: recusado${quem ? ` por ${quem.nome}` : ""}`;
    }
    const faltam = signatarios.filter((s) => s.status !== "assinado").map((s) => s.nome);
    return `⏳ *${envio.titulo}*: ${contagem}. Falta: ${faltam.join(", ")}`;
  });
  return `📊 Seus documentos mais recentes:\n\n${linhas.join("\n")}`;
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
