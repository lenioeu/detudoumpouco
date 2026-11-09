import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Banco } from "../src/banco.js";
import { carregarConfig } from "../src/config.js";
import type { Fluxo } from "../src/conversa/fluxo.js";
import { criarServidor } from "../src/servidor.js";

let servidor: Server;
let base = "";

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
  const app = criarServidor(config, {} as Fluxo, new Banco(":memory:"));
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

  it("não atrapalha a verificação nem o webhook", async () => {
    expect((await fetch(`${base}/verificar/nao-existe`)).status).toBe(404);
    expect((await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=errado`)).status).toBe(403);
  });
});
