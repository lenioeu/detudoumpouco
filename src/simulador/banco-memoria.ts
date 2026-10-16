import type { Carimbo } from "../assinatura/carimbo.js";
import type { Envio, Pendencia, Repositorio, Selfie, Signatario } from "../banco.js";
import { STATUS_EM_ANDAMENTO } from "../status.js";
import type { Estado } from "../conversa/estado.js";

/** O mesmo banco do bot, só que em memória: usado pelo simulador que roda no navegador. */
export class BancoMemoria implements Repositorio {
  private readonly processadas = new Set<string>();
  private readonly conversas = new Map<string, { estado: Estado; pdf: Uint8Array | null }>();
  private readonly envios = new Map<string, Envio & { pdfFinal?: Uint8Array }>();
  private readonly lista: Signatario[] = [];
  private readonly selfies = new Map<string, Selfie>();
  private readonly carimbos = new Map<string, Carimbo>();
  private readonly mensagens = new Map<string, { envioId: string; indice: number | null }>();
  private readonly registro: { envioId: string | null; tipo: string; detalhe: unknown; em: string }[] = [];
  private filaDePendencias: Pendencia[] = [];
  private proximaPendencia = 1;

  marcarProcessada(id: string): boolean {
    if (this.processadas.has(id)) return false;
    this.processadas.add(id);
    return true;
  }

  lerConversa(telefone: string): { estado: Estado; pdf: Uint8Array | null } {
    return this.conversas.get(telefone) ?? { estado: { etapa: "inicio" }, pdf: null };
  }

  salvarConversa(telefone: string, estado: Estado, pdf?: Uint8Array | null): void {
    const anterior = this.conversas.get(telefone);
    this.conversas.set(telefone, { estado, pdf: pdf === undefined ? (anterior?.pdf ?? null) : pdf });
  }

  criarEnvio(envio: Envio, signatarios: Pick<Signatario, "papel" | "nome" | "telefone">[]): void {
    this.envios.set(envio.id, { ...envio });
    signatarios.forEach((s, indice) =>
      this.lista.push({
        envioId: envio.id,
        indice,
        papel: s.papel,
        nome: s.nome,
        telefone: s.telefone,
        status: "pendente",
        cpf: null,
        linkEnviadoEm: null,
        visualizadoEm: null,
        assinadoEm: null,
        mensagemAssinaturaId: null,
        selfieEm: null,
        lembretes: 0,
        ultimoLembreteEm: null,
      }),
    );
  }

  envio(id: string): Envio | null {
    const e = this.envios.get(id);
    return e ? { ...e } : null;
  }

  pdfFinal(id: string): Uint8Array | null {
    return this.envios.get(id)?.pdfFinal ?? null;
  }

  salvarCarimbo(id: string, carimbo: Carimbo): void {
    this.carimbos.set(id, carimbo);
  }

  carimbo(id: string): Carimbo | null {
    return this.carimbos.get(id) ?? null;
  }

  concluidosSemCarimbo(): string[] {
    return [...this.envios.values()].filter((e) => e.status === "concluido" && !this.carimbos.has(e.id)).map((e) => e.id);
  }

  concluirEnvio(id: string, pdfFinal: Uint8Array): void {
    const e = this.envios.get(id);
    if (e) Object.assign(e, { status: "concluido", pdfFinal });
  }

  marcarEnvioRecusado(id: string): void {
    const e = this.envios.get(id);
    if (e) e.status = "recusado";
  }

  signatarios(envioId: string): Signatario[] {
    return this.lista.filter((s) => s.envioId === envioId).map((s) => ({ ...s }));
  }

  signatario(envioId: string, indice: number): Signatario | null {
    const s = this.lista.find((x) => x.envioId === envioId && x.indice === indice);
    return s ? { ...s } : null;
  }

  aguardandoCpf(telefone: string): Signatario | null {
    const candidatos = this.lista
      .filter((s) => s.telefone === telefone && s.status === "aguardando_cpf" && this.envios.get(s.envioId)?.status === "aguardando")
      .sort((a, b) => (b.visualizadoEm ?? "").localeCompare(a.visualizadoEm ?? ""));
    return candidatos[0] ? { ...candidatos[0] } : null;
  }

  aguardandoSelfie(telefone: string): Signatario | null {
    const candidatos = this.lista
      .filter((s) => s.telefone === telefone && s.status === "aguardando_selfie" && this.envios.get(s.envioId)?.status === "aguardando")
      .sort((a, b) => (b.visualizadoEm ?? "").localeCompare(a.visualizadoEm ?? ""));
    return candidatos[0] ? { ...candidatos[0] } : null;
  }

  aguardandoConfirmacao(telefone: string): Signatario | null {
    const s = this.lista.find(
      (x) => x.telefone === telefone && x.status === "aguardando_confirmacao" && this.envios.get(x.envioId)?.status === "aguardando",
    );
    return s ? { ...s } : null;
  }

  salvarSelfie(envioId: string, indice: number, selfie: Selfie, em: string): void {
    this.selfies.set(`${envioId}:${indice}`, selfie);
    const s = this.lista.find((x) => x.envioId === envioId && x.indice === indice);
    if (s) s.selfieEm = em;
  }

  selfie(envioId: string, indice: number): Selfie | null {
    return this.selfies.get(`${envioId}:${indice}`) ?? null;
  }

  emAndamento(): Signatario[] {
    return this.lista
      .filter((s) => this.envios.get(s.envioId)?.status === "aguardando" && STATUS_EM_ANDAMENTO.includes(s.status))
      .map((s) => ({ ...s }));
  }

  enviosDoRemetente(telefone: string, limite: number): Envio[] {
    return [...this.envios.values()]
      .filter((e) => e.remetente === telefone)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
      .slice(0, limite)
      .map((e) => ({ ...e }));
  }

  ehSignatario(telefone: string): boolean {
    return this.lista.some((s) => s.telefone === telefone);
  }

  atualizarSignatario(
    envioId: string,
    indice: number,
    campos: Partial<
      Pick<
        Signatario,
        "status" | "cpf" | "linkEnviadoEm" | "visualizadoEm" | "assinadoEm" | "mensagemAssinaturaId" | "lembretes" | "ultimoLembreteEm"
      >
    >,
  ): void {
    const s = this.lista.find((x) => x.envioId === envioId && x.indice === indice);
    if (s) Object.assign(s, campos);
  }

  vincularMensagem(mensagemId: string, envioId: string, indice: number | null): void {
    if (mensagemId && !this.mensagens.has(mensagemId)) this.mensagens.set(mensagemId, { envioId, indice });
  }

  envioDaMensagem(mensagemId: string): { envioId: string; indice: number | null } | null {
    return this.mensagens.get(mensagemId) ?? null;
  }

  registrarEvento(envioId: string | null, tipo: string, detalhe: unknown): void {
    this.registro.push({ envioId, tipo, detalhe, em: new Date().toISOString() });
  }

  eventos(envioId: string): { tipo: string; detalhe: unknown; em: string }[] {
    return this.registro.filter((e) => e.envioId === envioId).map(({ tipo, detalhe, em }) => ({ tipo, detalhe, em }));
  }

  adicionarPendencia(telefone: string, texto: string, pdf: Uint8Array | null, nomeArquivo: string | null): void {
    this.filaDePendencias.push({ id: this.proximaPendencia++, telefone, texto, pdf, nomeArquivo });
  }

  pendencias(telefone: string): Pendencia[] {
    return this.filaDePendencias.filter((p) => p.telefone === telefone);
  }

  removerPendencia(id: number): void {
    this.filaDePendencias = this.filaDePendencias.filter((p) => p.id !== id);
  }
}
