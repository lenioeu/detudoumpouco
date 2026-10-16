import type { Repositorio } from "./banco.js";
import { mascararCpf } from "./cpf.js";
import { formatarDataHora, fundamentoLegal, sha256 } from "./assinatura/pagina.js";
import { formatarTelefone } from "./telefone.js";

export function urlDeVerificacao(urlPublica: string, codigo: string): string {
  return `${urlPublica.replace(/\/+$/, "")}/verificar/${codigo}`;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/**
 * Página pública de verificação, aberta pelo QR Code ou pelo link do rodapé.
 * Mostra a situação do documento e permite conferir se um PDF é a via original.
 * Na internet o CPF aparece parcialmente oculto; completo, só no próprio documento.
 */
export function paginaDeVerificacao(banco: Repositorio, codigo: string, nomeDoEscritorio: string): { status: number; html: string } {
  const envio = /^[0-9a-f-]{36}$/.test(codigo) ? banco.envio(codigo) : null;
  if (!envio) {
    return {
      status: 404,
      html: moldura(
        "Documento não encontrado",
        `<p>Não há documento com o código <code>${esc(codigo)}</code>. Confira o código impresso no rodapé do PDF.</p>`,
      ),
    };
  }

  const signatarios = banco.signatarios(envio.id);
  const final = banco.pdfFinal(envio.id);
  const hashFinal = final ? sha256(final) : null;
  const carimbo = banco.carimbo(envio.id);
  const situacao =
    envio.status === "concluido"
      ? `<span class="selo ok">Assinado por todos</span>`
      : envio.status === "recusado"
        ? `<span class="selo erro">Assinatura recusada</span>`
        : `<span class="selo espera">Aguardando assinaturas</span>`;

  const linhas = signatarios
    .map((s) => {
      const estado =
        s.status === "assinado" && s.assinadoEm
          ? `Assinou em ${esc(formatarDataHora(s.assinadoEm))}`
          : s.status === "recusado"
            ? "Recusou assinar"
            : "Ainda não assinou";
      return `<li><strong>${esc(s.nome)}</strong> <span class="papel">${esc(s.papel)}</span>
        <div class="dados">${s.cpf ? `CPF ${esc(mascararCpf(s.cpf))} · ` : ""}WhatsApp ${esc(formatarTelefone(s.telefone))}</div>
        <div class="estado">${estado}${s.selfieEm ? " · selfie com documento recebida" : ""}</div></li>`;
    })
    .join("");

  const conferencia = hashFinal
    ? `<section>
        <h2>Conferir um arquivo</h2>
        <p>Escolha o PDF que você recebeu. A conferência é feita no seu navegador: o arquivo não é enviado.</p>
        <input type="file" id="arquivo" accept="application/pdf">
        <p id="resultado" role="status"></p>
      </section>
      <script>
        const HASH_FINAL = ${JSON.stringify(hashFinal)};
        document.getElementById("arquivo").addEventListener("change", async (e) => {
          const arquivo = e.target.files[0];
          if (!arquivo) return;
          const digest = await crypto.subtle.digest("SHA-256", await arquivo.arrayBuffer());
          const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
          const r = document.getElementById("resultado");
          r.className = hex === HASH_FINAL ? "ok" : "erro";
          r.textContent = hex === HASH_FINAL
            ? "Este arquivo é a via final assinada, sem nenhuma alteração."
            : "Este arquivo não corresponde à via final assinada deste documento.";
        });
      </script>`
    : "";

  return {
    status: 200,
    html: moldura(
      envio.titulo,
      `<p class="situacao">${situacao}</p>
      <dl>
        <dt>Código</dt><dd><code>${esc(envio.id)}</code></dd>
        <dt>Enviado por</dt><dd>${esc(nomeDoEscritorio)}</dd>
        <dt>Enviado em</dt><dd>${esc(formatarDataHora(envio.criadoEm))}</dd>
        <dt>SHA-256 do original</dt><dd><code>${esc(envio.hashOriginal)}</code></dd>
        ${hashFinal ? `<dt>SHA-256 da via final</dt><dd><code>${esc(hashFinal)}</code></dd>` : ""}
        ${
          carimbo
            ? `<dt>Carimbo do tempo</dt><dd>RFC 3161, emitido em ${esc(formatarDataHora(carimbo.em))} por ${esc(hostDe(carimbo.autoridade))} sobre o SHA-256 da via final. <a href="${esc(envio.id)}/carimbo.tsr" download>Baixar o carimbo (.tsr)</a></dd>`
            : ""
        }
      </dl>
      <section><h2>Assinaturas</h2><ul class="assinaturas">${linhas}</ul></section>
      ${conferencia}
      <p class="lei">${esc(fundamentoLegal(envio.exigeSelfie))}</p>`,
    ),
  };
}

function moldura(titulo: string, corpo: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} · Verificação de assinatura</title>
<style>
  :root { --fundo: #f4f6f5; --cartao: #fff; --tinta: #16201f; --suave: #5d6b69; --linha: #d8dfdc; --ok: #0a7a52; --erro: #b3261e; --espera: #8a5a00; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --fundo: #0e1513; --cartao: #17211e; --tinta: #e6ecea; --suave: #9aa8a5; --linha: #2c3a36; --ok: #4fd1a1; --erro: #ff8a80; --espera: #f2c46b; color-scheme: dark; } }
  body { margin: 0; background: var(--fundo); color: var(--tinta); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px max(16px, env(safe-area-inset-left)); }
  main { max-width: 720px; margin: 0 auto; background: var(--cartao); border: 1px solid var(--linha); border-radius: 12px; padding: 24px; }
  .marca { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--suave); margin: 0 0 4px; }
  h1 { font-size: 22px; margin: 0 0 8px; text-wrap: balance; }
  h2 { font-size: 16px; margin: 24px 0 8px; }
  dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 16px; margin: 16px 0; }
  dt { color: var(--suave); }
  dd { margin: 0; overflow-wrap: anywhere; }
  code { font-size: 13px; }
  .selo { display: inline-block; padding: 3px 10px; border-radius: 999px; font-weight: 600; font-size: 13px; border: 1px solid currentColor; }
  .ok { color: var(--ok); } .erro { color: var(--erro); } .espera { color: var(--espera); }
  .assinaturas { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
  .assinaturas li { border-top: 1px solid var(--linha); padding-top: 10px; }
  .papel, .dados { color: var(--suave); font-size: 13px; }
  .lei { color: var(--suave); font-size: 13px; margin-top: 24px; }
  @media (max-width: 480px) { dl { grid-template-columns: minmax(0, 1fr); } dd { margin-bottom: 8px; } }
</style></head>
<body><main><p class="marca">Verificação de assinatura eletrônica</p><h1>${esc(titulo)}</h1>${corpo}</main></body></html>`;
}

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Arquivo .tsr do carimbo do tempo, para conferência independente (ex.: openssl ts -verify). */
export function arquivoDoCarimbo(banco: Repositorio, codigo: string): Uint8Array | null {
  return /^[0-9a-f-]{36}$/.test(codigo) ? (banco.carimbo(codigo)?.token ?? null) : null;
}
