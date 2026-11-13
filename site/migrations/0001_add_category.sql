ALTER TABLE achados ADD COLUMN category TEXT;
CREATE INDEX IF NOT EXISTS achados_category ON achados (category);
