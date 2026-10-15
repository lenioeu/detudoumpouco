import type { Analise } from "../ia/partes.js";
import { formatarTelefone } from "../telefone.js";
import type { ParteComContato } from "./estado.js";

export const AJUDA =
  "Olá! Envie aqui o *PDF* que precisa ser assinado.\n\n" +
  "Eu leio o documento, identifico quem deve assinar, peço o contato de cada pessoa e mando o link de assinatura pelo WhatsApp.\n\n" +
  "A qualquer momento, escreva *cancelar* para recomeçar.";

export function listaDePartes(analise: Analise): string {
  const ordem = analise.ordem === "sequencial" ? "nesta ordem" : "em qualquer ordem";
  const partes = analise.partes
    .map((p, i) => `${i + 1}. *${p.nome ?? "(nome em branco)"}*, ${p.papel}`)
    .join("\n");
  const observacao = analise.observacao ? `\n\n⚠️ ${analise.observacao}` : "";
  return `📄 *${analise.titulo}*\n\nQuem assina (${ordem}):\n${partes}${observacao}\n\nEstá certo?`;
}

export function pedidoDeContato(papel: string, nome: string | null, numero: number, total: number): string {
  const quem = nome ? `*${nome}* (${papel})` : `a pessoa que assina como *${papel}*`;
  return (
    `Contato ${numero} de ${total}: envie o contato de ${quem}.\n\n` +
    "Pode compartilhar o contato da agenda ou digitar o número com DDD" +
    (nome ? "." : ", junto com o nome completo. Ex.: _Maria da Silva, 51 99999-8888_")
  );
}

export function resumoParaEnvio(analise: Analise, contatos: ParteComContato[]): string {
  const ordem = analise.ordem === "sequencial" ? "um de cada vez, nesta ordem" : "todos ao mesmo tempo";
  const linhas = contatos
    .map((c, i) => `${i + 1}. ${c.nome} (${c.papel}): ${formatarTelefone(c.telefone)}`)
    .join("\n");
  return (
    `Confira antes de enviar:\n\n📄 *${analise.titulo}*\n\n${linhas}\n\n` +
    `Os links vão por WhatsApp, ${ordem}. Posso enviar?`
  );
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}
