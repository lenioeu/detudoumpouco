import type { Request, RequestHandler } from "express";

/**
 * Limite simples de pedidos por IP, em memória: dificulta que alguém percorra códigos de verificação
 * ao acaso. Ao passar do limite, responde 429 até a janela acabar.
 */
export function limitarPorIp(maximo: number, janelaMs: number, ipDe: (req: Request) => string = (req) => req.ip ?? "?"): RequestHandler {
  const contagem = new Map<string, { n: number; ate: number }>();
  return (req, res, next) => {
    const agora = Date.now();
    if (contagem.size > 10_000) for (const [ip, c] of contagem) if (c.ate <= agora) contagem.delete(ip);
    const ip = ipDe(req);
    const atual = contagem.get(ip);
    if (!atual || atual.ate <= agora) {
      contagem.set(ip, { n: 1, ate: agora + janelaMs });
      next();
      return;
    }
    if (++atual.n > maximo) {
      res.set("Retry-After", String(Math.ceil((atual.ate - agora) / 1000)));
      res.status(429).type("text").send("Muitas consultas seguidas. Tente de novo em instantes.");
      return;
    }
    next();
  };
}
