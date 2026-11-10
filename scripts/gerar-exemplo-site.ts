/**
 * Gera a via de exemplo mostrada no site: um contrato de locação fictício, assinado por duas pessoas,
 * com a marca d'água "EXEMPLO · SEM VALOR JURÍDICO" em todas as páginas e assinatura digital.
 * Salva em site/exemplo/ só a página de assinaturas, em imagem WebP de 300 e 150 dpi
 * (o site mostra essa página; não oferece o PDF nem as outras páginas).
 * Precisa de pdftoppm (poppler) e python3 com Pillow.
 *
 *   npx tsx scripts/gerar-exemplo-site.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { AssinadorDePdf } from "../src/assinatura/certificado.js";
import { carregarFontesDaMarca } from "../src/assinatura/fontes-node.js";
import { encontrarLinhasDeAssinatura } from "../src/assinatura/linhas.js";
import { finalizarDocumento, prepararDocumento, usarFontesDaMarca } from "../src/assinatura/pagina.js";
import { lerTextoDoPdf } from "../src/assinatura/texto-node.js";

usarFontesDaMarca(carregarFontesDaMarca());
const saida = new URL("../site/exemplo/", import.meta.url).pathname;
mkdirSync(saida, { recursive: true });
const temporaria = mkdtempSync(join(tmpdir(), "exemplo-"));

// Documento original: um contrato de locação curto, com as linhas de assinatura de cada parte
const original = await PDFDocument.create();
const pagina = original.addPage([595.28, 841.89]);
const fonte = await original.embedFont(StandardFonts.TimesRoman);
const negrito = await original.embedFont(StandardFonts.TimesRomanBold);
pagina.drawText("CONTRATO DE LOCAÇÃO RESIDENCIAL", { x: 150, y: 760, size: 15, font: negrito });
[
  "Pelo presente instrumento particular, de um lado JOÃO SOUZA, doravante denominado LOCADOR, e de",
  "outro MARINA LIMA, doravante denominada LOCATÁRIA, ajustam a locação do imóvel situado na Rua das",
  "Flores, 100, apartamento 201, mediante as cláusulas seguintes.",
  "",
  "Cláusula 1ª. O prazo da locação é de 30 (trinta) meses, a contar da assinatura deste contrato.",
  "Cláusula 2ª. O aluguel mensal é de R$ 2.000,00 (dois mil reais), com vencimento no dia 10 de cada mês.",
  "Cláusula 3ª. As partes elegem o foro da comarca de Vitória/ES para dirimir quaisquer dúvidas.",
].forEach((linha, i) => pagina.drawText(linha, { x: 60, y: 715 - i * 17, size: 11.5, font: fonte }));
pagina.drawText("Vitória/ES, 10 de novembro de 2026.", { x: 60, y: 560, size: 11.5, font: fonte });
for (const [nome, papel, y] of [["JOÃO SOUZA", "Locador", 470], ["MARINA LIMA", "Locatária", 350]] as const) {
  pagina.drawText("______________________________", { x: 180, y, size: 12, font: fonte });
  pagina.drawText(nome, { x: 300 - fonte.widthOfTextAtSize(nome, 11.5) / 2, y: y - 20, size: 11.5, font: fonte });
  pagina.drawText(papel, { x: 300 - fonte.widthOfTextAtSize(papel, 10.5) / 2, y: y - 35, size: 10.5, font: fonte });
}
const bytes = await original.save();

const signatarios = [
  { papel: "locador", nome: "João Souza", telefone: "5527988887777" },
  { papel: "locatária", nome: "Marina Lima", telefone: "5527999998888" },
];
const linhas = encontrarLinhasDeAssinatura(await lerTextoDoPdf(bytes), signatarios.map((s) => s.nome));
const { pdf, blocos, hashOriginal } = await prepararDocumento(bytes, "Contrato de locação residencial", signatarios, linhas);
const preenchido = await finalizarDocumento(pdf, blocos, {
  titulo: "Contrato de locação residencial",
  codigo: "00000000-0000-4000-8000-000000000000",
  criadoEm: "2026-11-10T12:58:00Z",
  hashOriginal,
  remetente: "Escritório Exemplo Advocacia",
  remetenteTelefone: "5527911112222",
  urlVerificacao: "https://deacordo.app",
  registros: signatarios.map((s, i) => ({
    ...s,
    cpf: i ? "52998224725" : "11144477735", // CPFs de teste, válidos só no formato
    linkEnviadoEm: "2026-11-10T13:00:00Z",
    visualizadoEm: `2026-11-10T13:0${4 + i}:00Z`,
    assinadoEm: `2026-11-10T17:3${i}:12Z`,
    mensagemId: `wamid.EXEMPLO${i + 1}`,
  })),
  comCarimboDoTempo: true,
  certificadoDoArquivo: "DeAcordo",
});

// Marca d'água em todas as páginas, antes da assinatura digital (que fica válida sobre o arquivo final)
const comMarca = await PDFDocument.load(preenchido);
const helvetica = await comMarca.embedFont(StandardFonts.HelveticaBold);
for (const p of comMarca.getPages()) {
  const { width, height } = p.getSize();
  const texto = "EXEMPLO · SEM VALOR JURÍDICO";
  const tamanho = 34;
  const largura = helvetica.widthOfTextAtSize(texto, tamanho);
  const angulo = 35;
  const rad = (angulo * Math.PI) / 180;
  p.drawText(texto, {
    x: width / 2 - (Math.cos(rad) * largura) / 2,
    y: height / 2 - (Math.sin(rad) * largura) / 2,
    size: tamanho,
    font: helvetica,
    color: rgb(0.82, 0.84, 0.86),
    opacity: 0.45,
    rotate: degrees(angulo),
  });
}
const assinador = AssinadorDePdf.carregarOuGerar(join(temporaria, "exemplo.p12"), "exemplo-deacordo", {
  nome: "DeAcordo (exemplo)",
  local: "Vitória/ES",
  contato: "https://deacordo.app",
});
const final = await assinador.assinar(await comMarca.save(), "Exemplo de via assinada pelo DeAcordo");
const pdfTemporario = join(temporaria, "via.pdf");
writeFileSync(pdfTemporario, final);
for (const antigo of readdirSync(saida)) rmSync(join(saida, antigo));
const paraWebp = (png: string, webp: string) =>
  execFileSync("python3", [
    "-I",
    "-c",
    "import sys; from PIL import Image; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2], 'WEBP', quality=88, method=6)",
    png,
    join(saida, webp),
  ]);

// Página de assinaturas (a 2ª): 300 dpi para telas grandes, 150 dpi para o celular
for (const dpi of [300, 150]) {
  const base = join(temporaria, `assinaturas-${dpi}`);
  execFileSync("pdftoppm", ["-r", String(dpi), "-f", "2", "-l", "2", "-singlefile", "-png", pdfTemporario, base]);
  paraWebp(`${base}.png`, `pagina-de-assinaturas-${dpi}dpi.webp`);
}

console.log("Exemplo gerado em site/exemplo/");
