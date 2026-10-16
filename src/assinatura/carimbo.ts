/**
 * Carimbo do tempo (RFC 3161): uma autoridade de carimbo do tempo (TSA) assina o
 * SHA-256 da via final junto com a data e a hora em que o recebeu. É uma prova
 * independente de que o documento existia, exatamente assim, naquele momento.
 *
 * O "token" devolvido pode ser conferido por qualquer pessoa, por exemplo com:
 *   openssl ts -verify -data via-final.pdf -in carimbo.tsr -CAfile cadeia-da-tsa.pem
 */
import forge from "node-forge";

const { asn1 } = forge;
const OID_SHA256 = "2.16.840.1.101.3.4.2.1";
const OID_TSTINFO = "1.2.840.113549.1.9.16.1.4";

export type Carimbo = {
  /** Resposta da TSA (TimeStampToken em DER), o arquivo .tsr. */
  token: Uint8Array;
  /** Data e hora atestadas pela TSA (ISO 8601). */
  em: string;
  /** Endereço da TSA que emitiu. */
  autoridade: string;
};

export type Carimbador = (sha256Hex: string) => Promise<Carimbo>;

export function criarCarimbador(url: string, buscar: typeof fetch = fetch): Carimbador {
  return async (sha256Hex) => {
    const resposta = await buscar(url, {
      method: "POST",
      headers: { "Content-Type": "application/timestamp-query" },
      body: Buffer.from(montarPedido(sha256Hex), "binary"),
    });
    if (!resposta.ok) throw new Error(`Autoridade de carimbo do tempo respondeu ${resposta.status}`);
    const der = Buffer.from(await resposta.arrayBuffer()).toString("binary");
    return { ...lerResposta(der, sha256Hex), autoridade: url };
  };
}

/** TimeStampReq em DER (string binária do node-forge). */
export function montarPedido(sha256Hex: string): string {
  const nonce = forge.util.bytesToHex(forge.random.getBytesSync(8));
  const pedido = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(1).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(OID_SHA256).getBytes()),
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ""),
      ]),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, forge.util.hexToBytes(sha256Hex)),
    ]),
    // nonce positivo (primeiro bit zero)
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, forge.util.hexToBytes(`00${nonce}`)),
    // pede o certificado da TSA dentro do token, para a conferência offline
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BOOLEAN, false, String.fromCharCode(0xff)),
  ]);
  return asn1.toDer(pedido).getBytes();
}

/**
 * Lê o TimeStampResp: confere o status, que o carimbo é sobre o hash pedido e
 * extrai a data e a hora. (A assinatura da TSA é conferida por quem verificar o .tsr.)
 */
export function lerResposta(der: string, sha256Hex: string): Omit<Carimbo, "autoridade"> {
  const resposta = asn1.fromDer(der) as forge.asn1.Asn1;
  const [statusInfo, token] = resposta.value as forge.asn1.Asn1[];
  const status = (statusInfo!.value as forge.asn1.Asn1[])[0]!;
  const codigo = forge.util.createBuffer(status.value as string).getInt(8 * (status.value as string).length);
  if (codigo > 1 || !token) throw new Error(`Autoridade de carimbo do tempo recusou o pedido (status ${codigo})`);

  // ContentInfo -> [0] SignedData -> encapContentInfo -> [0] OCTET STRING com o TSTInfo
  const signedData = ((token.value as forge.asn1.Asn1[])[1]!.value as forge.asn1.Asn1[])[0]!;
  const encap = (signedData.value as forge.asn1.Asn1[]).find(
    (n) => n.type === asn1.Type.SEQUENCE && asn1.derToOid((n.value as forge.asn1.Asn1[])[0]!.value as string) === OID_TSTINFO,
  );
  if (!encap) throw new Error("Resposta da autoridade de carimbo do tempo sem TSTInfo");
  const octetos = ((encap.value as forge.asn1.Asn1[])[1]!.value as forge.asn1.Asn1[])[0]!;
  const tstInfo = asn1.fromDer(conteudoDeOctetos(octetos)) as forge.asn1.Asn1;
  const campos = tstInfo.value as forge.asn1.Asn1[];

  const imprint = campos[2]!.value as forge.asn1.Asn1[];
  const hashCarimbado = forge.util.bytesToHex(imprint[1]!.value as string);
  if (hashCarimbado !== sha256Hex.toLowerCase()) throw new Error("O carimbo do tempo veio para outro hash");

  const genTime = campos.find((c) => c.type === asn1.Type.GENERALIZEDTIME);
  if (!genTime) throw new Error("Carimbo do tempo sem data");
  const em = asn1.generalizedTimeToDate(genTime.value as string).toISOString();

  return { token: Uint8Array.from(asn1.toDer(token).getBytes(), (c) => c.charCodeAt(0)), em };
}

/** OCTET STRING pode vir "construída" (em pedaços) em alguns codificadores. */
function conteudoDeOctetos(no: forge.asn1.Asn1): string {
  return typeof no.value === "string" ? no.value : (no.value as forge.asn1.Asn1[]).map(conteudoDeOctetos).join("");
}
