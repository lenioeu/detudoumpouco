import type { Repositorio } from "../banco.js";
import type { Config } from "../config.js";
import { ErroWhatsApp, type WhatsApp } from "../whatsapp/cliente.js";

export type Mensageiro = Pick<WhatsApp, "enviarTexto" | "enviarBotoes" | "enviarDocumento" | "enviarTemplate" | "baixarMidia">;

/** Código de erro da Meta quando a janela de 24h fechou e só templates podem ser enviados. */
const JANELA_FECHADA = 131047;

/**
 * Envia avisos que podem chegar fora da janela de 24h do WhatsApp. Nesse caso manda o
 * template de aviso e guarda a mensagem completa para quando a pessoa responder.
 */
export class Avisador {
  constructor(
    private readonly config: Config,
    private readonly banco: Repositorio,
    private readonly whatsapp: Mensageiro,
  ) {}

  async avisar(telefone: string, titulo: string, texto: string, anexo?: { pdf: Uint8Array; nomeArquivo: string }): Promise<void> {
    try {
      await this.whatsapp.enviarTexto(telefone, texto);
      if (anexo) await this.whatsapp.enviarDocumento(telefone, anexo.pdf, anexo.nomeArquivo);
    } catch (erro) {
      if (!(erro instanceof ErroWhatsApp && erro.codigo === JANELA_FECHADA)) throw erro;
      const jaAvisado = this.banco.pendencias(telefone).length > 0;
      this.banco.adicionarPendencia(telefone, texto, anexo?.pdf ?? null, anexo?.nomeArquivo ?? null);
      // Um template basta: ao responder, a pessoa recebe todas as pendências
      if (jaAvisado) return;
      await this.whatsapp.enviarTemplate(telefone, this.config.WHATSAPP_TEMPLATE_AVISO, [
        titulo,
        texto.replace(/[*_]/g, "").replace(/\s+/g, " ").slice(0, 200),
      ]);
    }
  }

  async entregarPendencias(telefone: string): Promise<void> {
    for (const p of this.banco.pendencias(telefone)) {
      await this.whatsapp.enviarTexto(telefone, p.texto);
      if (p.pdf) await this.whatsapp.enviarDocumento(telefone, p.pdf, p.nomeArquivo ?? "documento.pdf");
      this.banco.removerPendencia(p.id);
    }
  }
}

/** Filas por chave, para que eventos ligados à mesma pessoa ou documento não corram em paralelo. */
export class Filas {
  private readonly filas = new Map<string, Promise<void>>();

  executar(chave: string, tarefa: () => Promise<void>): Promise<void> {
    const anterior = this.filas.get(chave) ?? Promise.resolve();
    const atual = anterior.then(tarefa);
    const guardada = atual.catch(() => {});
    this.filas.set(chave, guardada);
    void guardada.finally(() => {
      if (this.filas.get(chave) === guardada) this.filas.delete(chave);
    });
    return atual;
  }
}

export function nomeDeArquivo(titulo: string, sufixo: string): string {
  return `${titulo.replace(/[\\/:*?"<>|]+/g, " ").trim()}${sufixo}.pdf`;
}
