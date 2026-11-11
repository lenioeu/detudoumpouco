import express from "express";
import type { Repositorio } from "./banco.js";
import { limitarPorIp } from "./limite.js";
import {
  arquivoDoCarimbo,
  CABECALHOS_DE_VERIFICACAO,
  consultarPorHash,
  destinoDoCodigo,
  paginaDeVerificacao,
  paginaInicialDeVerificacao,
} from "./verificacao.js";

/**
 * Rotas públicas de verificação, iguais no servidor e no simulador:
 *   /verificar             tela inicial (código ou arquivo)
 *   /verificar?codigo=X    leva ao documento
 *   /v/CODIGO              link curto do QR Code
 *   /verificar/UUID        link completo
 *   POST /api/verificar    { hash } -> documento com aquele arquivo (o PDF nunca é enviado)
 * Todas fora dos buscadores e com limite de consultas por IP, contra quem tenta códigos ao acaso.
 * Em produção, o site fica no Cloudflare Pages e functions/ repassa essas rotas para cá.
 */
export function registrarRotasDeVerificacao(
  app: express.Express,
  banco: Repositorio,
  nomeDoEscritorio: string,
  segredoDoProxy?: string,
): void {
  // Pedidos repassados pelo Cloudflare Pages (deacordo.app) chegam com o IP de quem acessou num
  // cabeçalho; só vale quando vem junto a senha combinada, senão qualquer um poderia inventar um IP.
  const ipDe = (req: express.Request) =>
    segredoDoProxy && req.header("x-deacordo-proxy") === segredoDoProxy ? req.header("x-deacordo-ip") || req.ip || "?" : req.ip || "?";
  const limite = limitarPorIp(60, 60_000, ipDe);
  const enviarPagina = (res: express.Response, { status, html }: { status: number; html: string }) =>
    res.status(status).set(CABECALHOS_DE_VERIFICACAO).type("html").send(html);

  app.get("/verificar", limite, (req, res) => {
    const codigo = typeof req.query.codigo === "string" ? req.query.codigo.trim() : "";
    if (!codigo) return enviarPagina(res, { status: 200, html: paginaInicialDeVerificacao() });
    const destino = destinoDoCodigo(banco, codigo);
    if (destino) return res.redirect(303, destino);
    enviarPagina(res, {
      status: 404,
      html: paginaInicialDeVerificacao({
        codigo,
        aviso: "Não encontramos documento com esse código. Confira as 7 letras e números impressos ao lado do QR Code, no rodapé do PDF.",
      }),
    });
  });

  app.get("/verificar/:codigo/carimbo.tsr", limite, (req, res) => {
    const tsr = arquivoDoCarimbo(banco, String(req.params.codigo));
    if (!tsr) {
      res.sendStatus(404);
      return;
    }
    res.type("application/timestamp-reply").set("Content-Disposition", `attachment; filename="carimbo-${String(req.params.codigo)}.tsr"`);
    res.send(Buffer.from(tsr));
  });

  app.get("/verificar/:codigo", limite, (req, res) => enviarPagina(res, paginaDeVerificacao(banco, String(req.params.codigo), nomeDoEscritorio)));
  app.get("/v/:codigo", limite, (req, res) => enviarPagina(res, paginaDeVerificacao(banco, String(req.params.codigo), nomeDoEscritorio)));

  app.post("/api/verificar", limite, express.json({ limit: "1kb" }), (req, res) => {
    const hash = typeof req.body?.hash === "string" ? req.body.hash.toLowerCase() : "";
    const resposta = consultarPorHash(banco, hash);
    res.set(CABECALHOS_DE_VERIFICACAO);
    if (!resposta) {
      res.status(400).json({ erro: "Envie o SHA-256 do arquivo em hexadecimal." });
      return;
    }
    res.json(resposta);
  });
}
