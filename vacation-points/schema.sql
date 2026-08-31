-- Vacanza Cup — un registro solo, in cui si può soltanto aggiungere righe.
-- Il punteggio non è memorizzato: è la somma dei punti dopo l'ultimo 'reset'.

CREATE TABLE IF NOT EXISTS events (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  kind   TEXT NOT NULL DEFAULT 'point',   -- 'point' oppure 'reset'
  actor  TEXT NOT NULL,                   -- chi ha premuto
  target TEXT NOT NULL DEFAULT '',        -- a chi è andato il punto
  delta  INTEGER NOT NULL DEFAULT 0,      -- +1 oppure -1
  reason TEXT,
  ts     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_kind_id ON events (kind, id);
