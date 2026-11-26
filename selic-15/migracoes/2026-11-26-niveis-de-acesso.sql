-- Adiciona o nível de acesso (admin | editor | leitor) aos usuários já existentes.
ALTER TABLE usuarios ADD COLUMN nivel TEXT NOT NULL DEFAULT 'editor';
