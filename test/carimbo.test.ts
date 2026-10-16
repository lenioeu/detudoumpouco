import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarCarimbador, montarPedido } from "../src/assinatura/carimbo.js";
import { sha256 } from "../src/assinatura/pagina.js";

/** Autoridade de carimbo do tempo de teste, feita com o próprio OpenSSL (`openssl ts -reply`). */
function opensslDisponivel(): boolean {
  try {
    execFileSync("openssl", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const pasta = mkdtempSync(join(tmpdir(), "tsa-"));
const openssl = (...args: string[]) => execFileSync("openssl", args, { cwd: pasta, stdio: ["ignore", "pipe", "pipe"] });
let servidor: Server;
let url = "";

describe.skipIf(!opensslDisponivel())("carimbo do tempo (RFC 3161)", () => {
  beforeAll(async () => {
    openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.pem", "-subj", "/CN=AC de teste", "-days", "2",
      "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign");
    openssl("req", "-newkey", "rsa:2048", "-nodes", "-keyout", "tsa.key", "-out", "tsa.csr", "-subj", "/CN=TSA de teste");
    writeFileSync(join(pasta, "ext.cnf"), "extendedKeyUsage=critical,timeStamping\nkeyUsage=critical,digitalSignature,nonRepudiation\n");
    openssl("x509", "-req", "-in", "tsa.csr", "-CA", "ca.pem", "-CAkey", "ca.key", "-CAcreateserial", "-out", "tsa.pem", "-days", "2", "-extfile", "ext.cnf");
    writeFileSync(join(pasta, "serial"), "01\n");
    writeFileSync(
      join(pasta, "tsa.cnf"),
      `[ tsa ]
default_tsa = tsa1
[ tsa1 ]
dir = ${pasta}
serial = $dir/serial
crypto_device = builtin
signer_cert = $dir/tsa.pem
certs = $dir/ca.pem
signer_key = $dir/tsa.key
signer_digest = sha256
default_policy = 1.2.3.4.1
digests = sha256
accuracy = secs:1
ordering = yes
tsa_name = yes
ess_cert_id_chain = no
ess_cert_id_alg = sha256
`,
    );

    servidor = createServer((req, res) => {
      const partes: Buffer[] = [];
      req.on("data", (p: Buffer) => partes.push(p));
      req.on("end", () => {
        writeFileSync(join(pasta, "pedido.tsq"), Buffer.concat(partes));
        try {
          openssl("ts", "-reply", "-config", "tsa.cnf", "-queryfile", "pedido.tsq", "-out", "resposta.tsr");
          res.writeHead(200, { "Content-Type": "application/timestamp-reply" });
          res.end(readFileSync(join(pasta, "resposta.tsr")));
        } catch {
          res.writeHead(500).end();
        }
      });
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/tsr`;
  });

  afterAll(() => servidor?.close());

  it("obtém o carimbo, com a data, e ele confere no openssl", async () => {
    const via = new TextEncoder().encode("via final assinada");
    const hash = sha256(via);
    const antes = Date.now();
    const carimbo = await criarCarimbador(url)(hash);

    expect(carimbo.autoridade).toBe(url);
    const em = new Date(carimbo.em).getTime();
    expect(em).toBeGreaterThanOrEqual(antes - 2000);
    expect(em).toBeLessThanOrEqual(Date.now() + 2000);

    // Conferência independente, como faria qualquer perito com o .tsr
    writeFileSync(join(pasta, "carimbo.tsr"), carimbo.token);
    writeFileSync(join(pasta, "via.pdf"), via);
    const saida = openssl("ts", "-verify", "-data", "via.pdf", "-in", "carimbo.tsr", "-token_in", "-CAfile", "ca.pem", "-untrusted", "tsa.pem");
    expect(saida.toString()).toContain("Verification: OK");
  });

  it("recusa resposta que carimba outro hash", async () => {
    const pedido = sha256(new TextEncoder().encode("documento pedido"));
    const outro = sha256(new TextEncoder().encode("outro documento"));
    // A "TSA" responde com um carimbo válido, mas do hash errado
    const tsaQueErra: typeof fetch = (alvo) =>
      fetch(alvo, {
        method: "POST",
        headers: { "Content-Type": "application/timestamp-query" },
        body: Buffer.from(montarPedido(outro), "binary"),
      });
    await expect(criarCarimbador(url, tsaQueErra)(pedido)).rejects.toThrow("outro hash");
  });
});
