import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { AssinadorDePdf } from "../src/assinatura/certificado.js";
import { encontrarLinhasDeAssinatura } from "../src/assinatura/linhas.js";
import { finalizarDocumento, prepararDocumento, sha256 } from "../src/assinatura/pagina.js";
import { lerTextoDoPdf } from "../src/assinatura/texto-node.js";

const pasta = mkdtempSync(join(tmpdir(), "assinabot-"));

function pdfsigDisponivel(): boolean {
  try {
    execFileSync("pdfsig", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("documento", () => {
  it("prepara, preenche e assina digitalmente", async () => {
    const original = await PDFDocument.create();
    original.addPage();
    const bytes = await original.save();

    const signatarios = Array.from({ length: 7 }, (_, i) => ({
      papel: i === 0 ? "outorgante" : "outorgado",
      nome: `Pessoa ${i + 1} — São João`,
      telefone: "5551999998888",
    }));
    const { pdf, blocos, hashOriginal } = await prepararDocumento(bytes, "Procuração ad judicia", signatarios);
    expect(hashOriginal).toBe(sha256(bytes));

    const preparado = await PDFDocument.load(pdf);
    expect(preparado.getPageCount()).toBeGreaterThan(2); // 7 blocos não cabem numa página só
    expect(blocos).toHaveLength(7);
    for (const b of blocos) {
      expect(b.pagina).toBeGreaterThanOrEqual(1);
      expect(b.y).toBeGreaterThan(0);
    }

    const registros = signatarios.map((s) => ({
      ...s,
      cpf: "52998224725",
      linkEnviadoEm: "2026-10-15T12:00:00Z",
      visualizadoEm: "2026-10-15T12:05:00Z",
      assinadoEm: "2026-10-15T12:06:30Z",
      mensagemId: "wamid.ABC",
    }));
    const preenchido = await finalizarDocumento(pdf, blocos, {
      titulo: "Procuração ad judicia",
      codigo: "123e4567-e89b-12d3-a456-426614174000",
      criadoEm: "2026-10-15T11:59:00Z",
      hashOriginal,
      remetente: "Escritório Teste",
      remetenteTelefone: "5551911112222",
      urlVerificacao: "https://bot.exemplo.com.br/verificar/123e4567-e89b-12d3-a456-426614174000",
      registros,
    });
    expect((await PDFDocument.load(preenchido)).getPageCount()).toBeGreaterThan(preparado.getPageCount());

    const assinador = AssinadorDePdf.carregarOuGerar(join(pasta, "cert.p12"), "senha-de-teste", {
      nome: "Escritório Teste",
      local: "Porto Alegre/RS",
      contato: "https://bot.exemplo.com.br",
    });
    const final = await assinador.assinar(preenchido, "Teste");
    expect(Buffer.from(final).includes("/ByteRange")).toBe(true);

    if (pdfsigDisponivel()) {
      const arquivo = join(pasta, "final.pdf");
      writeFileSync(arquivo, final);
      expect(execFileSync("pdfsig", [arquivo]).toString()).toContain("Signature is Valid");
    }
  }, 60_000);

  it("carimba a linha de assinatura do próprio documento, com CPF completo e rodapé em todas as páginas", async () => {
    // Declaração no estilo da do RIA: o nome aparece no texto e sozinho no bloco de assinatura
    const original = await PDFDocument.create();
    const pagina = original.addPage([595.28, 841.89]);
    const fonte = await original.embedFont(StandardFonts.Helvetica);
    pagina.drawText("EU, JULIA ROSA, DECLARO QUE ESTOU DE ACORDO.", { x: 85, y: 693, size: 11, font: fonte });
    pagina.drawText("______________________________", { x: 200, y: 625, size: 11, font: fonte });
    pagina.drawText("JULIA ROSA", { x: 260, y: 603, size: 11, font: fonte });
    pagina.drawText("Declarante", { x: 270, y: 581, size: 11, font: fonte });
    const bytes = await original.save();

    const linhas = encontrarLinhasDeAssinatura(await lerTextoDoPdf(bytes), ["Júlia Rosa"]);
    expect(linhas).toHaveLength(1);
    // O carimbo fica acima da linha de sublinhados, não sobre o texto da declaração
    expect(linhas[0]!.y).toBeGreaterThan(625);
    expect(linhas[0]!.y + linhas[0]!.altura).toBeLessThan(693);

    const signatarios = [{ papel: "declarante", nome: "Júlia Rosa", telefone: "5527999990000" }];
    const { pdf, blocos, hashOriginal } = await prepararDocumento(bytes, "Declaração", signatarios, linhas);
    expect(blocos.map((b) => b.origem)).toEqual(["documento", "pagina"]);

    const final = await finalizarDocumento(pdf, blocos, {
      titulo: "Declaração",
      codigo: "123e4567-e89b-12d3-a456-426614174000",
      criadoEm: "2026-10-15T11:59:00Z",
      hashOriginal,
      remetente: "Escritório Teste",
      remetenteTelefone: "5551911112222",
      urlVerificacao: "https://bot.exemplo.com.br/verificar/123e4567-e89b-12d3-a456-426614174000",
      registros: [
        {
          ...signatarios[0]!,
          cpf: "52998224725",
          linkEnviadoEm: "2026-10-15T12:00:00Z",
          visualizadoEm: "2026-10-15T12:05:00Z",
          assinadoEm: "2026-10-15T12:06:30Z",
          mensagemId: "wamid.ABC",
        },
      ],
    });

    const texto = await lerTextoDoPdf(final);
    const doPagina = (i: number) => texto[i]!.trechos.map((t) => t.texto).join(" ");
    expect(doPagina(0)).toContain("Assinado eletronicamente por Júlia Rosa");
    expect(doPagina(0)).toContain("CPF 529.982.247-25");
    const tudo = texto.map((_, i) => doPagina(i)).join(" ");
    expect(tudo).toContain("posse do número verificada");
    expect(tudo).toContain("art. 4º, I, da Lei 14.063/2020");
    expect(tudo).not.toContain("***");
    texto.forEach((_, i) => expect(doPagina(i)).toContain(`Página ${i + 1} de ${texto.length}`));
  }, 60_000);
});
