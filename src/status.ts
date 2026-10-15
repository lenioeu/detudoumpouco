// Fica fora de banco.ts para o simulador no navegador poder usar sem levar o SQLite junto.

export type StatusSignatario =
  | "pendente"
  | "convidado"
  | "visualizou"
  | "aguardando_cpf"
  | "aguardando_selfie"
  | "assinado"
  | "recusado";

/** Quem ainda pode receber lembrete: já convidado e sem assinar. */
export const STATUS_EM_ANDAMENTO: StatusSignatario[] = ["convidado", "visualizou", "aguardando_cpf", "aguardando_selfie"];
