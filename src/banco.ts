import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Carimbo } from "./assinatura/carimbo.js";
import type { Bloco } from "./assinatura/pagina.js";
import type { Estado } from "./conversa/estado.js";

export type Envio = {
  id: string;
  remetente: string;
  titulo: string;
  ordem: "sequencial" | "simultanea";
  hashOriginal: string;
  /** PDF que cada pessoa recebe para ler e assinar (original + página de assinaturas em branco). */
  pdfApresentado: Uint8Array;
  blocos: Bloco[];
  status: "aguardando" | "concluido" | "recusado";
  criadoEm: string;
  /** Se cada signatário precisa mandar uma selfie segurando um documento de identidade. */
  exigeSelfie: boolean;
};

import { STATUS_EM_ANDAMENTO, type StatusSignatario } from "./status.js";

export { STATUS_EM_ANDAMENTO, type StatusSignatario };

export type Signatario = {
  envioId: string;
  indice: number;
  papel: string;
  nome: string;
  telefone: string;
  status: StatusSignatario;
  cpf: string | null;
  linkEnviadoEm: string | null;
  visualizadoEm: string | null;
  assinadoEm: string | null;
  mensagemAssinaturaId: string | null;
  selfieEm: string | null;
  lembretes: number;
  ultimoLembreteEm: string | null;
};

export type Selfie = { dados: Uint8Array; tipo: string };

export type Pendencia = { id: number; telefone: string; texto: string; pdf: Uint8Array | null; nomeArquivo: string | null };

/** O que o bot usa do banco; implementado em SQLite (Banco) e em memória (simulador no navegador). */
export type Repositorio = { [K in keyof Banco]: Banco[K] };

/** Persistência em SQLite (embutido no Node 22.5+). */
export class Banco {
  private readonly db: DatabaseSync;

  constructor(caminho: string) {
    if (caminho !== ":memory:") mkdirSync(dirname(caminho), { recursive: true });
    this.db = new DatabaseSync(caminho);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS conversas (
        telefone TEXT PRIMARY KEY,
        estado TEXT NOT NULL,
        pdf BLOB,
        atualizado_em TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS envios (
        id TEXT PRIMARY KEY,
        remetente TEXT NOT NULL,
        titulo TEXT NOT NULL,
        ordem TEXT NOT NULL,
        hash_original TEXT NOT NULL,
        pdf_apresentado BLOB NOT NULL,
        blocos TEXT NOT NULL,
        status TEXT NOT NULL,
        pdf_final BLOB,
        criado_em TEXT NOT NULL,
        exige_selfie INTEGER NOT NULL DEFAULT 0,
        carimbo BLOB,
        carimbo_em TEXT,
        carimbo_autoridade TEXT
      );
      CREATE TABLE IF NOT EXISTS signatarios (
        envio_id TEXT NOT NULL REFERENCES envios(id),
        indice INTEGER NOT NULL,
        papel TEXT NOT NULL,
        nome TEXT NOT NULL,
        telefone TEXT NOT NULL,
        status TEXT NOT NULL,
        cpf TEXT,
        link_enviado_em TEXT,
        visualizado_em TEXT,
        assinado_em TEXT,
        mensagem_assinatura_id TEXT,
        selfie BLOB,
        selfie_tipo TEXT,
        selfie_em TEXT,
        lembretes INTEGER NOT NULL DEFAULT 0,
        ultimo_lembrete_em TEXT,
        PRIMARY KEY (envio_id, indice)
      );
      CREATE INDEX IF NOT EXISTS signatarios_telefone ON signatarios (telefone, status);
      -- Registro de tudo que aconteceu com cada envio (vai resumido para o manifesto)
      CREATE TABLE IF NOT EXISTS eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        envio_id TEXT,
        tipo TEXT NOT NULL,
        detalhe TEXT NOT NULL,
        em TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mensagens_whatsapp (
        mensagem_id TEXT PRIMARY KEY,
        envio_id TEXT NOT NULL,
        indice INTEGER
      );
      CREATE TABLE IF NOT EXISTS processadas (id TEXT PRIMARY KEY, em TEXT NOT NULL);
      -- Mensagens que esperam a janela de 24h do WhatsApp reabrir
      CREATE TABLE IF NOT EXISTS pendencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telefone TEXT NOT NULL,
        texto TEXT NOT NULL,
        pdf BLOB,
        nome_arquivo TEXT
      );
    `);
    // Bancos criados por versões anteriores: acrescenta as colunas novas
    for (const sql of [
      "ALTER TABLE envios ADD COLUMN exige_selfie INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE envios ADD COLUMN carimbo BLOB",
      "ALTER TABLE envios ADD COLUMN carimbo_em TEXT",
      "ALTER TABLE envios ADD COLUMN carimbo_autoridade TEXT",
      "ALTER TABLE signatarios ADD COLUMN selfie BLOB",
      "ALTER TABLE signatarios ADD COLUMN selfie_tipo TEXT",
      "ALTER TABLE signatarios ADD COLUMN selfie_em TEXT",
      "ALTER TABLE signatarios ADD COLUMN lembretes INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE signatarios ADD COLUMN ultimo_lembrete_em TEXT",
    ]) {
      try {
        this.db.exec(sql);
      } catch {
        // coluna já existe
      }
    }
  }

  /** Marca a mensagem como processada; devolve false se ela já tinha sido (a Meta reenvia webhooks). */
  marcarProcessada(id: string): boolean {
    const r = this.db.prepare("INSERT OR IGNORE INTO processadas (id, em) VALUES (?, ?)").run(id, agora());
    return r.changes > 0;
  }

  // ---------------------------------------------------------------- conversa do escritório

  lerConversa(telefone: string): { estado: Estado; pdf: Uint8Array | null } {
    const linha = this.db.prepare("SELECT estado, pdf FROM conversas WHERE telefone = ?").get(telefone) as
      | { estado: string; pdf: Uint8Array | null }
      | undefined;
    return linha ? { estado: JSON.parse(linha.estado) as Estado, pdf: linha.pdf } : { estado: { etapa: "inicio" }, pdf: null };
  }

  /** Grava o estado. Passe `pdf: undefined` para manter o PDF já salvo e `null` para apagá-lo. */
  salvarConversa(telefone: string, estado: Estado, pdf?: Uint8Array | null): void {
    if (pdf === undefined) {
      this.db
        .prepare(
          `INSERT INTO conversas (telefone, estado, atualizado_em) VALUES (?, ?, ?)
           ON CONFLICT(telefone) DO UPDATE SET estado = excluded.estado, atualizado_em = excluded.atualizado_em`,
        )
        .run(telefone, JSON.stringify(estado), agora());
    } else {
      this.db
        .prepare(
          `INSERT INTO conversas (telefone, estado, pdf, atualizado_em) VALUES (?, ?, ?, ?)
           ON CONFLICT(telefone) DO UPDATE SET estado = excluded.estado, pdf = excluded.pdf, atualizado_em = excluded.atualizado_em`,
        )
        .run(telefone, JSON.stringify(estado), pdf, agora());
    }
  }

  // ---------------------------------------------------------------- envios

  criarEnvio(envio: Envio, signatarios: Pick<Signatario, "papel" | "nome" | "telefone">[]): void {
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `INSERT INTO envios (id, remetente, titulo, ordem, hash_original, pdf_apresentado, blocos, status, criado_em, exige_selfie)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          envio.id,
          envio.remetente,
          envio.titulo,
          envio.ordem,
          envio.hashOriginal,
          envio.pdfApresentado,
          JSON.stringify(envio.blocos),
          envio.status,
          envio.criadoEm,
          envio.exigeSelfie ? 1 : 0,
        );
      const inserir = this.db.prepare(
        "INSERT INTO signatarios (envio_id, indice, papel, nome, telefone, status) VALUES (?, ?, ?, ?, ?, 'pendente')",
      );
      signatarios.forEach((s, i) => inserir.run(envio.id, i, s.papel, s.nome, s.telefone));
      this.db.exec("COMMIT");
    } catch (erro) {
      this.db.exec("ROLLBACK");
      throw erro;
    }
  }

  envio(id: string): Envio | null {
    const l = this.db.prepare("SELECT * FROM envios WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!l) return null;
    return {
      id: l.id as string,
      remetente: l.remetente as string,
      titulo: l.titulo as string,
      ordem: l.ordem as Envio["ordem"],
      hashOriginal: l.hash_original as string,
      pdfApresentado: l.pdf_apresentado as Uint8Array,
      blocos: JSON.parse(l.blocos as string) as Bloco[],
      status: l.status as Envio["status"],
      criadoEm: l.criado_em as string,
      exigeSelfie: l.exige_selfie === 1,
    };
  }

  /** Via final assinada, quando o envio já foi concluído. */
  pdfFinal(id: string): Uint8Array | null {
    const l = this.db.prepare("SELECT pdf_final FROM envios WHERE id = ?").get(id) as { pdf_final: Uint8Array | null } | undefined;
    return l?.pdf_final ?? null;
  }

  salvarCarimbo(id: string, carimbo: Carimbo): void {
    this.db
      .prepare("UPDATE envios SET carimbo = ?, carimbo_em = ?, carimbo_autoridade = ? WHERE id = ?")
      .run(carimbo.token, carimbo.em, carimbo.autoridade, id);
  }

  carimbo(id: string): Carimbo | null {
    const l = this.db.prepare("SELECT carimbo, carimbo_em, carimbo_autoridade FROM envios WHERE id = ?").get(id) as
      | { carimbo: Uint8Array | null; carimbo_em: string | null; carimbo_autoridade: string | null }
      | undefined;
    return l?.carimbo ? { token: l.carimbo, em: l.carimbo_em ?? "", autoridade: l.carimbo_autoridade ?? "" } : null;
  }

  /** Envios concluídos cujo carimbo do tempo ainda não foi obtido (a TSA pode ter falhado). */
  concluidosSemCarimbo(): string[] {
    const linhas = this.db.prepare("SELECT id FROM envios WHERE status = 'concluido' AND carimbo IS NULL").all() as { id: string }[];
    return linhas.map((l) => l.id);
  }

  concluirEnvio(id: string, pdfFinal: Uint8Array): void {
    this.db.prepare("UPDATE envios SET status = 'concluido', pdf_final = ? WHERE id = ?").run(pdfFinal, id);
  }

  marcarEnvioRecusado(id: string): void {
    this.db.prepare("UPDATE envios SET status = 'recusado' WHERE id = ?").run(id);
  }

  // ---------------------------------------------------------------- signatários

  signatarios(envioId: string): Signatario[] {
    const linhas = this.db.prepare("SELECT * FROM signatarios WHERE envio_id = ? ORDER BY indice").all(envioId);
    return linhas.map(lerSignatario);
  }

  signatario(envioId: string, indice: number): Signatario | null {
    const l = this.db.prepare("SELECT * FROM signatarios WHERE envio_id = ? AND indice = ?").get(envioId, indice);
    return l ? lerSignatario(l) : null;
  }

  /** Assinatura deste telefone que espera o CPF (a mais recente, se houver mais de uma). */
  aguardandoCpf(telefone: string): Signatario | null {
    const l = this.db
      .prepare(
        `SELECT s.* FROM signatarios s JOIN envios e ON e.id = s.envio_id
         WHERE s.telefone = ? AND s.status = 'aguardando_cpf' AND e.status = 'aguardando'
         ORDER BY s.visualizado_em DESC LIMIT 1`,
      )
      .get(telefone);
    return l ? lerSignatario(l) : null;
  }

  /** Assinatura deste telefone que espera a selfie (a mais recente, se houver mais de uma). */
  aguardandoSelfie(telefone: string): Signatario | null {
    const l = this.db
      .prepare(
        `SELECT s.* FROM signatarios s JOIN envios e ON e.id = s.envio_id
         WHERE s.telefone = ? AND s.status = 'aguardando_selfie' AND e.status = 'aguardando'
         ORDER BY s.visualizado_em DESC LIMIT 1`,
      )
      .get(telefone);
    return l ? lerSignatario(l) : null;
  }

  /** Assinatura deste telefone parada na revisão (a mais recente, se houver mais de uma). */
  aguardandoConfirmacao(telefone: string): Signatario | null {
    const l = this.db
      .prepare(
        `SELECT s.* FROM signatarios s JOIN envios e ON e.id = s.envio_id
         WHERE s.telefone = ? AND s.status = 'aguardando_confirmacao' AND e.status = 'aguardando'
         ORDER BY s.visualizado_em DESC LIMIT 1`,
      )
      .get(telefone);
    return l ? lerSignatario(l) : null;
  }

  salvarSelfie(envioId: string, indice: number, selfie: Selfie, em: string): void {
    this.db
      .prepare("UPDATE signatarios SET selfie = ?, selfie_tipo = ?, selfie_em = ? WHERE envio_id = ? AND indice = ?")
      .run(selfie.dados, selfie.tipo, em, envioId, indice);
  }

  selfie(envioId: string, indice: number): Selfie | null {
    const l = this.db.prepare("SELECT selfie, selfie_tipo FROM signatarios WHERE envio_id = ? AND indice = ?").get(envioId, indice) as
      | { selfie: Uint8Array | null; selfie_tipo: string | null }
      | undefined;
    return l?.selfie ? { dados: l.selfie, tipo: l.selfie_tipo ?? "image/jpeg" } : null;
  }

  /** Signatários convidados que ainda não assinaram, em envios em andamento (para os lembretes). */
  emAndamento(): Signatario[] {
    const marcas = STATUS_EM_ANDAMENTO.map(() => "?").join(", ");
    const linhas = this.db
      .prepare(
        `SELECT s.* FROM signatarios s JOIN envios e ON e.id = s.envio_id
         WHERE e.status = 'aguardando' AND s.status IN (${marcas}) ORDER BY s.envio_id, s.indice`,
      )
      .all(...STATUS_EM_ANDAMENTO);
    return linhas.map(lerSignatario);
  }

  /** Envios mais recentes de um remetente (para o comando "documentos"). */
  enviosDoRemetente(telefone: string, limite: number): Envio[] {
    const ids = this.db
      .prepare("SELECT id FROM envios WHERE remetente = ? ORDER BY criado_em DESC LIMIT ?")
      .all(telefone, limite) as { id: string }[];
    return ids.map((l) => this.envio(l.id)!);
  }

  ehSignatario(telefone: string): boolean {
    return this.db.prepare("SELECT 1 FROM signatarios WHERE telefone = ? LIMIT 1").get(telefone) !== undefined;
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
    const colunas: Record<string, string> = {
      status: "status",
      cpf: "cpf",
      linkEnviadoEm: "link_enviado_em",
      visualizadoEm: "visualizado_em",
      assinadoEm: "assinado_em",
      mensagemAssinaturaId: "mensagem_assinatura_id",
      lembretes: "lembretes",
      ultimoLembreteEm: "ultimo_lembrete_em",
    };
    const entradas = Object.entries(campos);
    if (entradas.length === 0) return;
    const sets = entradas.map(([k]) => `${colunas[k]} = ?`).join(", ");
    this.db
      .prepare(`UPDATE signatarios SET ${sets} WHERE envio_id = ? AND indice = ?`)
      .run(...entradas.map(([, v]) => v ?? null), envioId, indice);
  }

  // ---------------------------------------------------------------- mensagens e eventos

  vincularMensagem(mensagemId: string, envioId: string, indice: number | null): void {
    if (!mensagemId) return;
    this.db
      .prepare("INSERT OR IGNORE INTO mensagens_whatsapp (mensagem_id, envio_id, indice) VALUES (?, ?, ?)")
      .run(mensagemId, envioId, indice);
  }

  envioDaMensagem(mensagemId: string): { envioId: string; indice: number | null } | null {
    const l = this.db.prepare("SELECT envio_id, indice FROM mensagens_whatsapp WHERE mensagem_id = ?").get(mensagemId) as
      | { envio_id: string; indice: number | null }
      | undefined;
    return l ? { envioId: l.envio_id, indice: l.indice } : null;
  }

  registrarEvento(envioId: string | null, tipo: string, detalhe: unknown): void {
    this.db
      .prepare("INSERT INTO eventos (envio_id, tipo, detalhe, em) VALUES (?, ?, ?, ?)")
      .run(envioId, tipo, JSON.stringify(detalhe), agora());
  }

  eventos(envioId: string): { tipo: string; detalhe: unknown; em: string }[] {
    const linhas = this.db.prepare("SELECT tipo, detalhe, em FROM eventos WHERE envio_id = ? ORDER BY id").all(envioId) as {
      tipo: string;
      detalhe: string;
      em: string;
    }[];
    return linhas.map((l) => ({ tipo: l.tipo, detalhe: JSON.parse(l.detalhe) as unknown, em: l.em }));
  }

  // ---------------------------------------------------------------- pendências

  adicionarPendencia(telefone: string, texto: string, pdf: Uint8Array | null, nomeArquivo: string | null): void {
    this.db
      .prepare("INSERT INTO pendencias (telefone, texto, pdf, nome_arquivo) VALUES (?, ?, ?, ?)")
      .run(telefone, texto, pdf, nomeArquivo);
  }

  pendencias(telefone: string): Pendencia[] {
    const linhas = this.db.prepare("SELECT * FROM pendencias WHERE telefone = ? ORDER BY id").all(telefone) as Record<
      string,
      unknown
    >[];
    return linhas.map((l) => ({
      id: l.id as number,
      telefone: l.telefone as string,
      texto: l.texto as string,
      pdf: (l.pdf as Uint8Array | null) ?? null,
      nomeArquivo: (l.nome_arquivo as string | null) ?? null,
    }));
  }

  removerPendencia(id: number): void {
    this.db.prepare("DELETE FROM pendencias WHERE id = ?").run(id);
  }
}

function lerSignatario(linha: unknown): Signatario {
  const l = linha as Record<string, unknown>;
  const ou = (v: unknown) => (v as string | null) ?? null;
  return {
    envioId: l.envio_id as string,
    indice: l.indice as number,
    papel: l.papel as string,
    nome: l.nome as string,
    telefone: l.telefone as string,
    status: l.status as StatusSignatario,
    cpf: ou(l.cpf),
    linkEnviadoEm: ou(l.link_enviado_em),
    visualizadoEm: ou(l.visualizado_em),
    assinadoEm: ou(l.assinado_em),
    mensagemAssinaturaId: ou(l.mensagem_assinatura_id),
    selfieEm: ou(l.selfie_em),
    lembretes: (l.lembretes as number | null) ?? 0,
    ultimoLembreteEm: ou(l.ultimo_lembrete_em),
  };
}

function agora(): string {
  return new Date().toISOString();
}
