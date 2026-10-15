import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Estado } from "./conversa/estado.js";

export type Envio = {
  id: string;
  remetente: string;
  documentoId: number;
  titulo: string;
  ordem: "sequencial" | "simultanea";
  hashOriginal: string;
  status: "aguardando" | "concluido" | "recusado";
};

export type Signatario = {
  envioId: string;
  indice: number;
  papel: string;
  nome: string;
  telefone: string;
  email: string;
  recipientId: number;
  token: string;
  linkEnviadoEm: string | null;
  assinadoEm: string | null;
};

export type Pendencia = { id: number; telefone: string; texto: string; documentoId: number | null; nomeArquivo: string | null };

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
        documento_id INTEGER NOT NULL UNIQUE,
        titulo TEXT NOT NULL,
        ordem TEXT NOT NULL,
        hash_original TEXT NOT NULL,
        status TEXT NOT NULL,
        criado_em TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS signatarios (
        envio_id TEXT NOT NULL REFERENCES envios(id),
        indice INTEGER NOT NULL,
        papel TEXT NOT NULL,
        nome TEXT NOT NULL,
        telefone TEXT NOT NULL,
        email TEXT NOT NULL,
        recipient_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        link_enviado_em TEXT,
        assinado_em TEXT,
        PRIMARY KEY (envio_id, indice)
      );
      -- Registro de tudo que aconteceu com cada envio (prova complementar à do Documenso)
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
      -- Mensagens ao escritório que esperam a janela de 24h do WhatsApp reabrir
      CREATE TABLE IF NOT EXISTS pendencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telefone TEXT NOT NULL,
        texto TEXT NOT NULL,
        documento_id INTEGER,
        nome_arquivo TEXT
      );
    `);
  }

  /** Marca a mensagem como processada; devolve false se ela já tinha sido (a Meta reenvia webhooks). */
  marcarProcessada(id: string): boolean {
    const r = this.db.prepare("INSERT OR IGNORE INTO processadas (id, em) VALUES (?, ?)").run(id, agora());
    return r.changes > 0;
  }

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

  criarEnvio(envio: Envio, signatarios: Signatario[]): void {
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare(
          `INSERT INTO envios (id, remetente, documento_id, titulo, ordem, hash_original, status, criado_em)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(envio.id, envio.remetente, envio.documentoId, envio.titulo, envio.ordem, envio.hashOriginal, envio.status, agora());
      const inserir = this.db.prepare(
        `INSERT INTO signatarios (envio_id, indice, papel, nome, telefone, email, recipient_id, token)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const s of signatarios) {
        inserir.run(s.envioId, s.indice, s.papel, s.nome, s.telefone, s.email, s.recipientId, s.token);
      }
      this.db.exec("COMMIT");
    } catch (erro) {
      this.db.exec("ROLLBACK");
      throw erro;
    }
  }

  envioPorDocumento(documentoId: number): Envio | null {
    return this.lerEnvio(this.db.prepare("SELECT * FROM envios WHERE documento_id = ?").get(documentoId));
  }

  envioPorId(id: string): Envio | null {
    return this.lerEnvio(this.db.prepare("SELECT * FROM envios WHERE id = ?").get(id));
  }

  private lerEnvio(linha: unknown): Envio | null {
    const l = linha as Record<string, unknown> | undefined;
    return l
      ? {
          id: l.id as string,
          remetente: l.remetente as string,
          documentoId: l.documento_id as number,
          titulo: l.titulo as string,
          ordem: l.ordem as Envio["ordem"],
          hashOriginal: l.hash_original as string,
          status: l.status as Envio["status"],
        }
      : null;
  }

  atualizarStatusEnvio(id: string, status: Envio["status"]): void {
    this.db.prepare("UPDATE envios SET status = ? WHERE id = ?").run(status, id);
  }

  signatarios(envioId: string): Signatario[] {
    const linhas = this.db.prepare("SELECT * FROM signatarios WHERE envio_id = ? ORDER BY indice").all(envioId) as Record<
      string,
      unknown
    >[];
    return linhas.map((l) => ({
      envioId: l.envio_id as string,
      indice: l.indice as number,
      papel: l.papel as string,
      nome: l.nome as string,
      telefone: l.telefone as string,
      email: l.email as string,
      recipientId: l.recipient_id as number,
      token: l.token as string,
      linkEnviadoEm: (l.link_enviado_em as string | null) ?? null,
      assinadoEm: (l.assinado_em as string | null) ?? null,
    }));
  }

  marcarLinkEnviado(envioId: string, indice: number, mensagemId: string): void {
    this.db.prepare("UPDATE signatarios SET link_enviado_em = ? WHERE envio_id = ? AND indice = ?").run(agora(), envioId, indice);
    if (mensagemId) {
      this.db
        .prepare("INSERT OR IGNORE INTO mensagens_whatsapp (mensagem_id, envio_id, indice) VALUES (?, ?, ?)")
        .run(mensagemId, envioId, indice);
    }
  }

  /** Devolve true se o signatário ainda não constava como assinado. */
  marcarAssinado(envioId: string, recipientId: number, em: string): boolean {
    const r = this.db
      .prepare("UPDATE signatarios SET assinado_em = ? WHERE envio_id = ? AND recipient_id = ? AND assinado_em IS NULL")
      .run(em, envioId, recipientId);
    return r.changes > 0;
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

  /** Telefones que receberam link de assinatura (para responder quem escreve ao bot). */
  ehSignatario(telefone: string): boolean {
    return this.db.prepare("SELECT 1 FROM signatarios WHERE telefone = ? LIMIT 1").get(telefone) !== undefined;
  }

  adicionarPendencia(telefone: string, texto: string, documentoId: number | null, nomeArquivo: string | null): void {
    this.db
      .prepare("INSERT INTO pendencias (telefone, texto, documento_id, nome_arquivo) VALUES (?, ?, ?, ?)")
      .run(telefone, texto, documentoId, nomeArquivo);
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
      documentoId: (l.documento_id as number | null) ?? null,
      nomeArquivo: (l.nome_arquivo as string | null) ?? null,
    }));
  }

  removerPendencia(id: number): void {
    this.db.prepare("DELETE FROM pendencias WHERE id = ?").run(id);
  }
}

function agora(): string {
  return new Date().toISOString();
}
