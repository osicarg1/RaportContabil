-- Schema pentru istoricul analizelor de balanta (Cloudflare D1)

CREATE TABLE IF NOT EXISTS balanta_istoric (
  id TEXT PRIMARY KEY,
  company_name TEXT NOT NULL,
  report_period TEXT NOT NULL,
  mode TEXT,
  venituri REAL,
  cheltuieli REAL,
  rezultat REAL,
  marja REAL,
  lichiditate REAL,
  grad_indatorare REAL,
  generated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_balanta_company ON balanta_istoric (company_name);
CREATE INDEX IF NOT EXISTS idx_balanta_generated_at ON balanta_istoric (generated_at);
