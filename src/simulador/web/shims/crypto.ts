// Substitui o node:crypto no navegador: só o que o bot usa.
import forge from "node-forge";

export function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

export function createHash(algoritmo: "sha256") {
  if (algoritmo !== "sha256") throw new Error(`Hash não suportado: ${algoritmo}`);
  const md = forge.md.sha256.create();
  const api = {
    update(dados: Uint8Array | string) {
      md.update(typeof dados === "string" ? forge.util.encodeUtf8(dados) : bytesParaBinario(dados));
      return api;
    },
    digest(formato: "hex") {
      if (formato !== "hex") throw new Error(`Formato não suportado: ${formato}`);
      return md.digest().toHex();
    },
  };
  return api;
}

function bytesParaBinario(dados: Uint8Array): string {
  let texto = "";
  for (let i = 0; i < dados.length; i += 0x8000) {
    texto += String.fromCharCode(...dados.subarray(i, i + 0x8000));
  }
  return texto;
}
