import { z } from "zod";

/** "5551999998888:Lenio Goularte,5551988887777" -> [{telefone, nome}] */
const listaDeRemetentes = z
  .string()
  .min(1)
  .transform((valor) =>
    valor
      .split(",")
      .map((item) => {
        const [telefone = "", ...nome] = item.split(":");
        return { telefone: telefone.replace(/\D/g, ""), nome: nome.join(":").trim() || null };
      })
      .filter((r) => r.telefone),
  );

const esquema = z.object({
  PORT: z.coerce.number().default(3000),
  /** URL pública deste servidor (usada nos logs e na documentação dos webhooks). */
  PUBLIC_URL: z.string().url(),
  /** Caminho do banco SQLite onde ficam as conversas e envios. */
  DATABASE_PATH: z.string().default("data/assinabot.db"),

  /**
   * Números (com DDI) autorizados a enviar documentos, separados por vírgula. Opcionalmente com o
   * nome completo do advogado, para o bot reconhecê-lo como parte: "5551999998888:Lenio Goularte".
   */
  AUTHORIZED_SENDERS: listaDeRemetentes,
  /** Nome exibido para quem vai assinar, ex.: "Escritório Goularte Advocacia". */
  SENDER_DISPLAY_NAME: z.string().min(1),

  // WhatsApp Business Cloud API (Meta)
  WHATSAPP_TOKEN: z.string().min(1),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_APP_SECRET: z.string().min(1),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1),
  WHATSAPP_API_VERSION: z.string().default("v23.0"),
  /** Template aprovado na Meta para pedir a assinatura (ver README). */
  WHATSAPP_TEMPLATE_SOLICITACAO: z.string().default("solicitacao_assinatura"),
  /** Template para avisos (ao escritório ou a quem assinou) quando a janela de 24h do WhatsApp já fechou. */
  WHATSAPP_TEMPLATE_AVISO: z.string().default("aviso_assinatura"),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default("pt_BR"),

  /** Cidade/UF do escritório, gravada na assinatura digital do PDF final. */
  SENDER_LOCATION: z.string().default("Brasil"),

  /**
   * Certificado .p12 que assina digitalmente o PDF final. Se o arquivo não existir,
   * um certificado autoassinado é gerado ali na primeira execução.
   */
  CERTIFICATE_PATH: z.string().default("data/certificado.p12"),
  CERTIFICATE_PASSWORD: z.string().min(8),

  /** Horas sem assinar até o lembrete automático, e quantos lembretes mandar no máximo. */
  REMINDER_AFTER_HOURS: z.coerce.number().positive().default(24),
  REMINDER_MAX: z.coerce.number().int().min(0).default(2),

  // Claude (identificação das partes)
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
});

export type Config = Omit<z.infer<typeof esquema>, "AUTHORIZED_SENDERS"> & {
  /** Telefones autorizados a enviar documentos. */
  AUTHORIZED_SENDERS: string[];
  /** Nome completo do advogado de cada telefone autorizado, quando informado. */
  NOMES_DOS_REMETENTES: Record<string, string>;
};

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const resultado = esquema.safeParse(env);
  if (!resultado.success) {
    const faltando = resultado.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuração inválida. Confira o arquivo .env:\n${faltando}`);
  }
  const remetentes = resultado.data.AUTHORIZED_SENDERS;
  return {
    ...resultado.data,
    AUTHORIZED_SENDERS: remetentes.map((r) => r.telefone),
    NOMES_DOS_REMETENTES: Object.fromEntries(remetentes.filter((r) => r.nome).map((r) => [r.telefone, r.nome!])),
  };
}
