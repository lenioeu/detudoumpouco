import { z } from "zod";

export const EsquemaAnalise = z.object({
  titulo: z.string().describe("Título curto do documento, ex.: 'Procuração ad judicia'"),
  tipo_documento: z.string().describe("Tipo do documento, ex.: procuração, contrato de honorários, declaração"),
  partes: z
    .array(
      z.object({
        papel: z.string().describe("Papel no documento, ex.: outorgante, contratante, declarante"),
        nome: z.string().nullable().describe("Nome completo como aparece no documento; null se estiver em branco"),
      }),
    )
    .describe("Quem precisa assinar, na ordem em que deve assinar"),
  ordem: z
    .enum(["sequencial", "simultanea"])
    .describe("sequencial quando uma parte define os termos e a outra aceita; simultanea quando a ordem não importa"),
  observacao: z
    .string()
    .nullable()
    .describe("Algo que o advogado deve conferir antes de enviar (campo em branco, assinatura faltando etc.); null se nada"),
});

export type Analise = z.infer<typeof EsquemaAnalise>;

export const INSTRUCOES = `Você ajuda um escritório de advocacia brasileiro a enviar documentos para assinatura eletrônica pelo WhatsApp.

Leia o documento e identifique quem precisa assiná-lo.

Regras:
- Liste só quem assina como parte. Testemunhas ficam de fora: elas assinam separadamente, se o escritório quiser.
- Use o nome exatamente como está no documento. Se o nome estiver em branco ou for um campo a preencher, use null.
- Se uma pessoa jurídica assina por representante, o papel é o da empresa e o nome é o do representante, ex.: papel "contratante (Empresa X Ltda.)".
- Ordem de assinatura: quem define os termos assina primeiro (outorgante antes do outorgado, contratante antes do contratado, locador antes do locatário). Use "simultanea" só quando a ordem não fizer diferença, como em acordos mútuos.
- Na observação, aponte só o que exige atenção antes do envio: campos obrigatórios em branco, documento que parece incompleto, número de partes menor que o exigido pelo tipo de documento. Não comente o mérito jurídico.`;

/** Resposta da IA a um pedido livre do advogado sobre quem assina ("só o Carlos assina"). */
export const EsquemaAjuste = z.object({
  excluir: z.array(z.number().int()).describe("Índices das partes que NÃO vão assinar, segundo o advogado"),
  entendeu: z.boolean().describe("false se a mensagem não for um pedido sobre quem assina"),
});

export type Ajuste = z.infer<typeof EsquemaAjuste>;

export type ParteParaAjuste = { indice: number; papel: string; nome: string | null };

export function promptDeAjuste(partes: ParteParaAjuste[], mensagem: string): string {
  const lista = partes.map((p) => `${p.indice}: ${p.nome ?? "(nome em branco)"}, ${p.papel}`).join("\n");
  return `Um advogado está enviando um documento para assinatura pelo WhatsApp. Estas são as partes que ainda não têm contato informado:
${lista}

O advogado escreveu: "${mensagem}"

Se a mensagem disser que alguma dessas partes não vai assinar (ex.: "só o Carlos assina", "a outra parte já assinou", "sem a Maria", "a Heloísa não precisa assinar"), devolva os índices dessas partes em "excluir" e "entendeu": true.
Se a mensagem não for sobre quem assina, devolva "excluir": [] e "entendeu": false.
Responda somente com um objeto JSON: {"excluir": [índices], "entendeu": true ou false}`;
}
