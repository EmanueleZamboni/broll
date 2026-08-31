CREATE TABLE IF NOT EXISTS players (
  name   TEXT PRIMARY KEY,
  points INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  actor  TEXT NOT NULL,
  target TEXT NOT NULL,
  delta  INTEGER NOT NULL,
  reason TEXT,
  ts     INTEGER NOT NULL
);

INSERT OR IGNORE INTO players (name, points) VALUES
  ('Emanuele', 0),
  ('Serena', 0),
  ('Mario', 0),
  ('Greta', 0);
