import Anthropic from "@anthropic-ai/sdk";
import { Banco } from "./banco.js";
import { carregarConfig } from "./config.js";
import { Documenso } from "./assinatura/documenso.js";
import { Fluxo } from "./conversa/fluxo.js";
import { IdentificadorDePartes } from "./ia/partes.js";
import { criarServidor } from "./servidor.js";
import { WhatsApp } from "./whatsapp/cliente.js";

const config = carregarConfig();
const banco = new Banco(config.DATABASE_PATH);
const fluxo = new Fluxo(
  config,
  banco,
  new WhatsApp(config),
  new IdentificadorDePartes(new Anthropic(), config.ANTHROPIC_MODEL),
  new Documenso(config),
);

criarServidor(config, fluxo).listen(config.PORT, () => {
  console.log(`AssinaBot ouvindo na porta ${config.PORT}`);
  console.log(`  Webhook do WhatsApp: ${config.PUBLIC_URL}/webhook/whatsapp`);
  console.log(`  Webhook do Documenso: ${config.PUBLIC_URL}/webhook/documenso`);
});
