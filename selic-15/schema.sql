-- SELIC-15 · esquema do banco D1
-- Documentos das coleções (processos, contratos, tarefas, agenda) guardados como JSON.
CREATE TABLE IF NOT EXISTS docs (
  col        TEXT    NOT NULL,
  id         TEXT    NOT NULL,
  data       TEXT    NOT NULL,
  version    INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT    NOT NULL,
  updated_by TEXT,
  deleted    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (col, id)
);
CREATE INDEX IF NOT EXISTS docs_updated ON docs (updated_at);

-- Pessoas que já entraram no sistema (e-mail vem do Cloudflare Access).
CREATE TABLE IF NOT EXISTS usuarios (
  email     TEXT PRIMARY KEY,
  nome      TEXT,
  criado_em TEXT
);

-- Registro de ações: alimenta o histórico de atividade e a pontuação da equipe.
CREATE TABLE IF NOT EXISTS eventos (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  em     TEXT NOT NULL,
  email  TEXT,
  col    TEXT,
  doc    TEXT,
  tipo   TEXT,
  pontos INTEGER NOT NULL DEFAULT 0,
  texto  TEXT
);
CREATE INDEX IF NOT EXISTS eventos_em ON eventos (em);

-- Fotografia diária dos indicadores (sequências e tendência do Índice de Saúde).
CREATE TABLE IF NOT EXISTS metricas (
  dia  TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
