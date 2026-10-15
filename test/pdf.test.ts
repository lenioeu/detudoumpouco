import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { AssinadorDePdf } from "../src/assinatura/certificado.js";
import { finalizarDocumento, prepararDocumento, sha256 } from "../src/assinatura/pagina.js";

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
});
