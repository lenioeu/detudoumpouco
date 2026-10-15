import type { Analise } from "../ia/partes.js";

/** Uma parte já com o WhatsApp de quem vai assinar. */
export type ParteComContato = { papel: string; nome: string; telefone: string };

/** Etapa da conversa com o escritório. O PDF em análise fica guardado à parte, no banco. */
export type Estado =
  | { etapa: "inicio" }
  | { etapa: "confirmando_partes"; nomeArquivo: string; analise: Analise }
  | { etapa: "corrigindo_partes"; nomeArquivo: string; analise: Analise }
  | { etapa: "coletando_contatos"; nomeArquivo: string; analise: Analise; contatos: ParteComContato[] }
  | { etapa: "confirmando_envio"; nomeArquivo: string; analise: Analise; contatos: ParteComContato[] };

export const BOTOES = {
  confirmarPartes: { id: "partes_ok", titulo: "Está certo" },
  corrigirPartes: { id: "partes_corrigir", titulo: "Corrigir" },
  enviar: { id: "enviar", titulo: "Enviar" },
  euAssino: { id: "eu_assino", titulo: "Eu mesmo assino" },
  cancelar: { id: "cancelar", titulo: "Cancelar" },
} as const;
