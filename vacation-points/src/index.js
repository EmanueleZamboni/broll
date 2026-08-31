/**
 * Vacanza Cup — point system per la vacanza.
 * Cloudflare Worker + D1. Serve il sito statico da /public e le API sotto /api.
 *
 * AFFIDABILITÀ — come sono tenuti i punti
 * ---------------------------------------
 * Non esiste da nessuna parte un "totale" che viene sovrascritto. Esiste solo
 * un registro di eventi in cui si può soltanto AGGIUNGERE una riga: +1 a Greta,
 * −1 a Mario, e così via. Il punteggio è la somma di quelle righe, calcolata al
 * momento della lettura.
 *
 * Questo toglie di mezzo tre modi di perdere punti:
 *  - due telefoni che segnano nello stesso istante non si sovrascrivono a
 *    vicenda (nessuno legge-modifica-riscrive: si accodano e basta);
 *  - un totale non può "sballare" restando sbagliato per sempre: si ricalcola
 *    ogni volta dallo storico;
 *  - "Azzera tutto" non cancella niente: scrive una riga di tipo 'reset' e la
 *    somma riparte da lì. Lo storico completo resta, ed è scaricabile da
 *    /api/export.
 */

const PLAYERS = ['Emanuele', 'Serena', 'Mario', 'Greta'];
const COOKIE = 'vc_session';
const SESSION_DAYS = 60;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

/* ---------------------------------------------------------------- database */

let schemaReady = false;

async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS events (
       id     INTEGER PRIMARY KEY AUTOINCREMENT,
       kind   TEXT NOT NULL DEFAULT 'point',   -- 'point' oppure 'reset'
       actor  TEXT NOT NULL,
       target TEXT NOT NULL DEFAULT '',
       delta  INTEGER NOT NULL DEFAULT 0,
       reason TEXT,
       ts     INTEGER NOT NULL
     )`
  ).run();
  // Chi avesse già la tabella nella forma vecchia, senza la colonna kind.
  try {
    await env.DB.prepare("ALTER TABLE events ADD COLUMN kind TEXT NOT NULL DEFAULT 'point'").run();
  } catch { /* la colonna c'è già: bene così */ }
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_events_kind_id ON events (kind, id)').run();
  schemaReady = true;
}

// Il punteggio è la somma dei punti dopo l'ultimo azzeramento.
const SINCE_LAST_RESET = "(SELECT COALESCE(MAX(id), 0) FROM events WHERE kind = 'reset')";

async function readState(env) {
  const [totals, events, head] = await Promise.all([
    env.DB.prepare(
      `SELECT target, SUM(delta) AS points
         FROM events
        WHERE kind = 'point' AND id > ${SINCE_LAST_RESET}
        GROUP BY target`
    ).all(),
    env.DB.prepare(
      `SELECT id, actor, target, delta, reason, ts
         FROM events
        WHERE kind = 'point' AND id > ${SINCE_LAST_RESET}
        ORDER BY id DESC
        LIMIT 30`
    ).all(),
    env.DB.prepare('SELECT COALESCE(MAX(id), 0) AS rev, COUNT(*) AS totale FROM events').first(),
  ]);

  const byName = new Map((totals.results || []).map((r) => [r.target, Number(r.points) || 0]));
  const players = PLAYERS.map((name) => ({ name, points: byName.get(name) ?? 0 })).sort(
    (a, b) => b.points - a.points || PLAYERS.indexOf(a.name) - PLAYERS.indexOf(b.name)
  );

  return {
    players,
    log: events.results || [],
    rev: Number(head && head.rev) || 0,
    eventi: Number(head && head.totale) || 0,
  };
}

/* ------------------------------------------------------------------- auth */

const enc = new TextEncoder();
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(env, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(env.AUTH_SECRET || 'vacanza-cup-dev-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

async function makeToken(env, name) {
  const payload = b64url(enc.encode(JSON.stringify({ n: name, e: Date.now() + SESSION_DAYS * 864e5 })));
  return `${payload}.${await hmac(env, payload)}`;
}

async function readToken(env, token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (sig !== (await hmac(env, payload))) return null;
  try {
    const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (!data || data.e < Date.now() || !PLAYERS.includes(data.n)) return null;
    return data.n;
  } catch {
    return null;
  }
}

function cookieValue(request, key) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === key) return decodeURIComponent(v.join('='));
  }
  return null;
}

const whoAmI = (request, env) => readToken(env, cookieValue(request, COOKIE));

const sessionCookie = (token, maxAge) =>
  `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

const codeMatches = (given, env) =>
  String(given || '').trim().toLowerCase() === String(env.ROOM_CODE || 'vacanza').trim().toLowerCase();

/* ------------------------------------------------------------------ routes */

async function handleLogin(request, env) {
  const { code, name } = await request.json().catch(() => ({}));
  if (!codeMatches(code, env)) return json({ error: 'Codice sbagliato' }, 401);
  if (!PLAYERS.includes(name)) return json({ error: 'Scegli chi sei' }, 400);

  const token = await makeToken(env, name);
  return json({ ok: true, me: name }, 200, { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86400) });
}

async function handleState(request, env) {
  const me = await whoAmI(request, env);
  if (!me) return json({ error: 'unauthorized' }, 401);
  await ensureSchema(env);
  return json({ me, ...(await readState(env)) });
}

async function handlePoint(request, env) {
  const me = await whoAmI(request, env);
  if (!me) return json({ error: 'unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const target = body.target;
  const delta = body.delta === -1 ? -1 : 1;
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 80) : null;
  if (!PLAYERS.includes(target)) return json({ error: 'Giocatore sconosciuto' }, 400);

  await ensureSchema(env);
  // Una riga in più nel registro: niente da sovrascrivere, niente da perdere.
  await env.DB.prepare(
    `INSERT INTO events (kind, actor, target, delta, reason, ts)
     VALUES ('point', ?1, ?2, ?3, ?4, ?5)`
  ).bind(me, target, delta, reason, Date.now()).run();

  return json({ me, ...(await readState(env)) });
}

async function handleReset(request, env) {
  const me = await whoAmI(request, env);
  if (!me) return json({ error: 'unauthorized' }, 401);

  const { code } = await request.json().catch(() => ({}));
  if (!codeMatches(code, env)) return json({ error: 'Serve il codice della vacanza per azzerare' }, 403);

  await ensureSchema(env);
  // Non si cancella niente: si segna il punto di ripartenza.
  await env.DB.prepare(
    `INSERT INTO events (kind, actor, target, delta, reason, ts)
     VALUES ('reset', ?1, '', 0, 'azzeramento', ?2)`
  ).bind(me, Date.now()).run();

  return json({ me, ...(await readState(env)) });
}

// Copia di sicurezza: tutto il registro, azzeramenti compresi.
async function handleExport(request, env) {
  const me = await whoAmI(request, env);
  if (!me) return json({ error: 'unauthorized' }, 401);

  await ensureSchema(env);
  const all = await env.DB.prepare(
    'SELECT id, kind, actor, target, delta, reason, ts FROM events ORDER BY id'
  ).all();

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(
    JSON.stringify({ esportato: Date.now(), giocatori: PLAYERS, eventi: all.results || [] }, null, 2),
    {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="vacanza-cup-${stamp}.json"`,
        'cache-control': 'no-store',
      },
    }
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (url.pathname === '/api/session' && request.method === 'GET') {
        const me = await whoAmI(request, env);
        return json({ me, players: PLAYERS });
      }
      if (url.pathname === '/api/login' && request.method === 'POST') return handleLogin(request, env);
      if (url.pathname === '/api/logout' && request.method === 'POST') {
        return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
      }
      if (url.pathname === '/api/state' && request.method === 'GET') return handleState(request, env);
      if (url.pathname === '/api/point' && request.method === 'POST') return handlePoint(request, env);
      if (url.pathname === '/api/reset' && request.method === 'POST') return handleReset(request, env);
      if (url.pathname === '/api/export' && request.method === 'GET') return handleExport(request, env);

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: 'server error', detail: String(err && err.message ? err.message : err) }, 500);
    }
  },
};
