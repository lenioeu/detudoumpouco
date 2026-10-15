import { createHmac, timingSafeEqual } from "node:crypto";

/** Mensagem recebida, já simplificada para o que o fluxo de conversa usa. */
export type MensagemRecebida =
  | { tipo: "texto"; de: string; id: string; texto: string }
  | { tipo: "documento"; de: string; id: string; mediaId: string; mimeType: string; nomeArquivo: string }
  | { tipo: "contato"; de: string; id: string; contatos: ContatoRecebido[] }
  | { tipo: "botao"; de: string; id: string; botaoId: string }
  | { tipo: "outro"; de: string; id: string };

export type ContatoRecebido = { nome: string; telefones: string[]; email?: string };

/** Atualização de status de uma mensagem que enviamos (entregue, lida, falhou). */
export type StatusMensagem = {
  mensagemId: string;
  status: string;
  destinatario: string;
  timestamp: string;
  erro?: string;
};

/** Confere o cabeçalho X-Hub-Signature-256 enviado pela Meta. */
export function assinaturaValida(corpoBruto: Buffer, cabecalho: string | undefined, appSecret: string): boolean {
  if (!cabecalho?.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", appSecret).update(corpoBruto).digest();
  const recebido = Buffer.from(cabecalho.slice("sha256=".length), "hex");
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

type Payload = {
  entry?: {
    changes?: {
      value?: {
        messages?: RawMensagem[];
        statuses?: {
          id: string;
          status: string;
          recipient_id: string;
          timestamp: string;
          errors?: { title?: string; message?: string }[];
        }[];
      };
    }[];
  }[];
};

type RawMensagem = {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  document?: { id: string; mime_type: string; filename?: string };
  contacts?: {
    name?: { formatted_name?: string };
    phones?: { phone?: string; wa_id?: string }[];
    emails?: { email?: string }[];
  }[];
  interactive?: { type: string; button_reply?: { id: string } };
  button?: { payload?: string };
};

export function extrairEventos(payload: unknown): { mensagens: MensagemRecebida[]; status: StatusMensagem[] } {
  const mensagens: MensagemRecebida[] = [];
  const status: StatusMensagem[] = [];

  for (const entry of (payload as Payload).entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) mensagens.push(converterMensagem(m));
      for (const s of change.value?.statuses ?? []) {
        const erro = s.errors?.map((e) => e.message ?? e.title).join("; ");
        status.push({
          mensagemId: s.id,
          status: s.status,
          destinatario: s.recipient_id,
          timestamp: s.timestamp,
          ...(erro ? { erro } : {}),
        });
      }
    }
  }
  return { mensagens, status };
}

function converterMensagem(m: RawMensagem): MensagemRecebida {
  const base = { de: m.from, id: m.id };
  switch (m.type) {
    case "text":
      return { ...base, tipo: "texto", texto: m.text?.body ?? "" };
    case "document":
      if (m.document) {
        return {
          ...base,
          tipo: "documento",
          mediaId: m.document.id,
          mimeType: m.document.mime_type,
          nomeArquivo: m.document.filename ?? "documento.pdf",
        };
      }
      break;
    case "contacts":
      return {
        ...base,
        tipo: "contato",
        contatos: (m.contacts ?? []).map((c) => {
          const email = c.emails?.find((e) => e.email)?.email;
          return {
            nome: c.name?.formatted_name ?? "",
            // wa_id já vem normalizado pela Meta quando o contato tem WhatsApp
            telefones: (c.phones ?? []).map((p) => p.wa_id ?? p.phone ?? "").filter(Boolean),
            ...(email ? { email } : {}),
          };
        }),
      };
    case "interactive":
      if (m.interactive?.button_reply) return { ...base, tipo: "botao", botaoId: m.interactive.button_reply.id };
      break;
    case "button":
      // clique em botão de resposta rápida de template
      if (m.button?.payload) return { ...base, tipo: "botao", botaoId: m.button.payload };
      break;
  }
  return { ...base, tipo: "outro" };
}
