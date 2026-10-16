import Anthropic from "@anthropic-ai/sdk";
import { criarCarimbador } from "./assinatura/carimbo.js";
import { AssinadorDePdf } from "./assinatura/certificado.js";
import { Banco } from "./banco.js";
import { carregarConfig } from "./config.js";
import { Avisador, Filas } from "./conversa/avisos.js";
import { Fluxo } from "./conversa/fluxo.js";
import { ColetaDeAssinaturas } from "./conversa/signatario.js";
import { IdentificadorDePartes } from "./ia/partes.js";
import { lerTextoDoPdf } from "./assinatura/texto-node.js";
import { criarServidor } from "./servidor.js";
import { WhatsApp } from "./whatsapp/cliente.js";

const config = carregarConfig();
const banco = new Banco(config.DATABASE_PATH);
const whatsapp = new WhatsApp(config);
const filas = new Filas();
const avisos = new Avisador(config, banco, whatsapp);
const assinador = AssinadorDePdf.carregarOuGerar(config.CERTIFICATE_PATH, config.CERTIFICATE_PASSWORD, {
  nome: config.SENDER_DISPLAY_NAME,
  local: config.SENDER_LOCATION,
  contato: config.PUBLIC_URL,
});
const carimbador = config.TSA_URL ? criarCarimbador(config.TSA_URL) : undefined;
const coleta = new ColetaDeAssinaturas(config, banco, whatsapp, avisos, assinador, filas, carimbador);
const ia = new IdentificadorDePartes(new Anthropic(), config.ANTHROPIC_MODEL);
const fluxo = new Fluxo(config, banco, whatsapp, ia, coleta, avisos, filas, lerTextoDoPdf);

// A cada 15 minutos: lembretes para quem não assinou e carimbos do tempo que falharam
setInterval(() => {
  void coleta.enviarLembretes().catch((e) => console.error("Erro nos lembretes:", e));
  void coleta.carimbarPendentes().catch((e) => console.error("Erro nos carimbos do tempo:", e));
}, 15 * 60_000);

criarServidor(config, fluxo, banco).listen(config.PORT, () => {
  console.log(`AssinaBot ouvindo na porta ${config.PORT}`);
  console.log(`  Webhook do WhatsApp: ${config.PUBLIC_URL}/webhook/whatsapp`);
});
