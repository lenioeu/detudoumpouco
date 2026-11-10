import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Banco } from "../src/banco.js";
import { carregarConfig } from "../src/config.js";
import type { Fluxo } from "../src/conversa/fluxo.js";
import { criarServidor } from "../src/servidor.js";

let servidor: Server;
let base = "";
const banco = new Banco(":memory:");

beforeAll(async () => {
  const config = carregarConfig({
    PUBLIC_URL: "https://deacordo.app",
    DATABASE_PATH: ":memory:",
    AUTHORIZED_SENDERS: "5551911112222",
    SENDER_DISPLAY_NAME: "Escritório de teste",
    CERTIFICATE_PASSWORD: "teste-123",
    WHATSAPP_TOKEN: "t",
    WHATSAPP_PHONE_NUMBER_ID: "t",
    WHATSAPP_APP_SECRET: "t",
    WHATSAPP_VERIFY_TOKEN: "t",
  });
  // O site não usa o fluxo de conversa
  const app = criarServidor(config, {} as Fluxo, banco);
  servidor = app.listen(0, "127.0.0.1");
  await new Promise((ok) => servidor.once("listening", ok));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(() => servidor?.close());

describe("site institucional", () => {
  it.each([
    ["/", "Assinatura eletrônica dentro do WhatsApp"],
    ["/privacidade", "Política de privacidade"],
    ["/termos", "Termos de uso"],
  ])("serve %s", async (caminho, texto) => {
    const resposta = await fetch(base + caminho);
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toContain("text/html");
    expect(await resposta.text()).toContain(texto);
  });

  it("abre a verificação pelo link curto, em maiúsculas ou minúsculas", async () => {
    banco.criarEnvio(
      {
        id: "123e4567-e89b-12d3-a456-426614174000",
        remetente: "5551911112222",
        titulo: "Contrato de locação",
        ordem: "simultanea",
        hashOriginal: "abc",
        pdfApresentado: new Uint8Array([1]),
        blocos: [],
        status: "aguardando",
        criadoEm: "2026-11-10T12:00:00Z",
        exigeSelfie: false,
      },
      [{ papel: "locatária", nome: "Marina Lima", telefone: "5551999998888" }],
    );
    const codigo = banco.envio("123e4567-e89b-12d3-a456-426614174000")!.codigoCurto!;
    for (const caminho of [`/v/${codigo}`, `/V/${codigo}`, `/v/${codigo.toLowerCase()}`]) {
      const resposta = await fetch(base + caminho);
      expect(resposta.status).toBe(200);
      expect(await resposta.text()).toContain("Contrato de locação");
    }
    expect((await fetch(`${base}/v/ZZZZZZZ`)).status).toBe(404);
  });

  it("não atrapalha a verificação nem o webhook", async () => {
    expect((await fetch(`${base}/verificar/nao-existe`)).status).toBe(404);
    expect((await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=errado`)).status).toBe(403);
  });
});
