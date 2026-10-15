import type { Analise } from "../ia/partes.js";

/** Uma parte já com o WhatsApp de quem vai assinar. */
export type ParteComContato = { papel: string; nome: string; telefone: string };

/** Coleta dos contatos: um por parte do documento (null = ainda falta), e quem não vai assinar. */
type Coleta = {
  nomeArquivo: string;
  analise: Analise;
  contatos: (ParteComContato | null)[];
  excluidas: number[];
};

/** Etapa da conversa com o escritório. O PDF em análise fica guardado à parte, no banco. */
export type Estado =
  | { etapa: "inicio" }
  | { etapa: "confirmando_partes"; nomeArquivo: string; analise: Analise }
  | { etapa: "corrigindo_partes"; nomeArquivo: string; analise: Analise }
  | ({ etapa: "coletando_contatos" } & Coleta)
  | ({ etapa: "confirmando_exclusao"; excluir: number[] } & Coleta)
  | { etapa: "escolhendo_selfie"; nomeArquivo: string; analise: Analise; contatos: ParteComContato[] }
  | { etapa: "confirmando_envio"; nomeArquivo: string; analise: Analise; contatos: ParteComContato[]; selfie: boolean };

export const BOTOES = {
  confirmarPartes: { id: "partes_ok", titulo: "Está certo" },
  corrigirPartes: { id: "partes_corrigir", titulo: "Corrigir" },
  enviar: { id: "enviar", titulo: "Enviar" },
  euAssino: { id: "eu_assino", titulo: "Eu mesmo assino" },
  cancelar: { id: "cancelar", titulo: "Cancelar" },
  confirmarExclusao: { id: "excluir_sim", titulo: "Sim, seguir" },
  negarExclusao: { id: "excluir_nao", titulo: "Não" },
  pedirSelfie: { id: "selfie_sim", titulo: "Pedir selfie" },
  semSelfie: { id: "selfie_nao", titulo: "Não precisa" },
  verDocumentos: { id: "documentos", titulo: "Ver documentos" },
} as const;
