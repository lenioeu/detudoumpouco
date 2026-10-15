import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { P12Signer } from "@signpdf/signer-p12";
import { SignPdf } from "@signpdf/signpdf";
import forge from "node-forge";
import { PDFDocument } from "pdf-lib";

export type DadosDoAssinante = { nome: string; local: string; contato: string };

/**
 * Assina digitalmente o PDF final (PKCS#7 destacado), para que qualquer alteração posterior
 * fique visível em leitores como o Adobe Reader ou o verificador do ITI.
 */
export class AssinadorDePdf {
  constructor(
    private readonly p12: Buffer,
    private readonly senha: string,
    private readonly dados: DadosDoAssinante,
  ) {}

  /**
   * Usa o certificado .p12 do caminho informado. Se o arquivo não existir, gera um
   * certificado autoassinado ali (válido por 10 anos) com a senha informada.
   */
  static carregarOuGerar(caminho: string, senha: string, dados: DadosDoAssinante): AssinadorDePdf {
    if (!existsSync(caminho)) {
      mkdirSync(dirname(caminho), { recursive: true });
      writeFileSync(caminho, gerarCertificadoAutoassinado(dados.nome, senha));
      console.warn(
        `Certificado autoassinado gerado em ${caminho}. Para mais peso jurídico, troque pelo certificado A1 (ICP-Brasil) do escritório.`,
      );
    }
    return new AssinadorDePdf(readFileSync(caminho), senha, dados);
  }

  async assinar(pdf: Uint8Array, motivo: string): Promise<Uint8Array> {
    const doc = await PDFDocument.load(pdf);
    pdflibAddPlaceholder({
      pdfDoc: doc,
      reason: motivo,
      name: this.dados.nome,
      location: this.dados.local,
      contactInfo: this.dados.contato,
      signatureLength: 16384,
      appName: "AssinaBot",
    });
    const comEspaco = await doc.save({ useObjectStreams: false });
    const assinado = await new SignPdf().sign(Buffer.from(comEspaco), new P12Signer(this.p12, { passphrase: this.senha }));
    return new Uint8Array(assinado);
  }
}

export function gerarCertificadoAutoassinado(nome: string, senha: string): Buffer {
  const chaves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = chaves.publicKey;
  cert.serialNumber = "01" + forge.util.bytesToHex(forge.random.getBytesSync(15));
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
  // O node-forge grava os nomes como PrintableString, que não aceita acentos
  const semAcentos = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const sujeito = [
    { name: "commonName", value: semAcentos },
    { name: "countryName", value: "BR" },
    { name: "organizationName", value: semAcentos },
  ];
  cert.setSubject(sujeito);
  cert.setIssuer(sujeito);
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
  ]);
  cert.sign(chaves.privateKey, forge.md.sha256.create());

  const p12 = forge.pkcs12.toPkcs12Asn1(chaves.privateKey, [cert], senha, { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");
}
