import express, { type Request } from "express";
import type { Repositorio } from "./banco.js";
import type { Config } from "./config.js";
import type { Fluxo } from "./conversa/fluxo.js";
import { arquivoDoCarimbo, paginaDeVerificacao } from "./verificacao.js";
import { assinaturaValida, extrairEventos } from "./whatsapp/webhook.js";

type ComCorpoBruto = Request & { corpoBruto?: Buffer };

export function criarServidor(config: Config, fluxo: Fluxo, banco: Repositorio): express.Express {
  const app = express();
  app.use(
    express.json({
      limit: "5mb",
      verify: (req, _res, buf) => {
        (req as ComCorpoBruto).corpoBruto = Buffer.from(buf);
      },
    }),
  );

  app.get("/saude", (_req, res) => {
    res.json({ ok: true });
  });

  // Página aberta pelo QR Code e pelo link do rodapé da via final
  app.get("/verificar/:codigo/carimbo.tsr", (req, res) => {
  const tsr = arquivoDoCarimbo(banco, req.params.codigo);
  if (!tsr) {
    res.sendStatus(404);
    return;
  }
  res.type("application/timestamp-reply").set("Content-Disposition", `attachment; filename="carimbo-${req.params.codigo}.tsr"`);
  res.send(Buffer.from(tsr));
});

app.get("/verificar/:codigo", (req, res) => {
    const { status, html } = paginaDeVerificacao(banco, req.params.codigo, config.SENDER_DISPLAY_NAME);
    res.status(status).type("html").send(html);
  });

  // Verificação feita pela Meta ao cadastrar a URL do webhook
  app.get("/webhook/whatsapp", (req, res) => {
    if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === config.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(String(req.query["hub.challenge"] ?? ""));
    } else {
      res.sendStatus(403);
    }
  });

  app.post("/webhook/whatsapp", (req, res) => {
    const corpo = (req as ComCorpoBruto).corpoBruto;
    if (!corpo || !assinaturaValida(corpo, req.header("x-hub-signature-256"), config.WHATSAPP_APP_SECRET)) {
      res.sendStatus(401);
      return;
    }
    // Responde logo: a Meta reenvia o webhook se demorarmos (a análise do PDF leva alguns segundos)
    res.sendStatus(200);

    const { mensagens, status } = extrairEventos(req.body);
    for (const m of mensagens) void fluxo.receberMensagem(m);
    for (const s of status) void fluxo.receberStatus(s).catch((e) => console.error("Erro ao tratar status:", e));
  });

  return app;
}
