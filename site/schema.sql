CREATE TABLE IF NOT EXISTS achados (
  id TEXT PRIMARY KEY,
  store TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  price REAL NOT NULL,
  original_price REAL NOT NULL,
  discount_pct REAL NOT NULL,
  image TEXT,
  category TEXT,
  posted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS achados_posted_at ON achados (posted_at DESC);
CREATE INDEX IF NOT EXISTS achados_category ON achados (category);
