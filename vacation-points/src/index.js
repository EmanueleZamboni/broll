/**
 * Vacanza Cup — point system per la vacanza.
 * Cloudflare Worker + D1. Serve il sito statico da /public e le API sotto /api.
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
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS players (
         name   TEXT PRIMARY KEY,
         points INTEGER NOT NULL DEFAULT 0
       )`
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS events (
         id     INTEGER PRIMARY KEY AUTOINCREMENT,
         actor  TEXT NOT NULL,
         target TEXT NOT NULL,
         delta  INTEGER NOT NULL,
         reason TEXT,
         ts     INTEGER NOT NULL
       )`
    ),
    ...PLAYERS.map((name) =>
      env.DB.prepare('INSERT OR IGNORE INTO players (name, points) VALUES (?1, 0)').bind(name)
    ),
  ]);
  schemaReady = true;
}

async function readState(env) {
  const [players, events] = await Promise.all([
    env.DB.prepare('SELECT name, points FROM players').all(),
    env.DB.prepare(
      'SELECT id, actor, target, delta, reason, ts FROM events ORDER BY id DESC LIMIT 30'
    ).all(),
  ]);

  const byName = new Map((players.results || []).map((p) => [p.name, p.points]));
  const board = PLAYERS.map((name) => ({ name, points: byName.get(name) ?? 0 })).sort(
    (a, b) => b.points - a.points || PLAYERS.indexOf(a.name) - PLAYERS.indexOf(b.name)
  );

  const log = events.results || [];
  return { players: board, log, rev: log.length ? log[0].id : 0 };
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

/* ------------------------------------------------------------------ routes */

async function handleLogin(request, env) {
  const { code, name } = await request.json().catch(() => ({}));
  const expected = env.ROOM_CODE || 'vacanza';

  if (String(code || '').trim().toLowerCase() !== String(expected).trim().toLowerCase()) {
    return json({ error: 'Codice sbagliato' }, 401);
  }
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
  await env.DB.batch([
    env.DB.prepare('UPDATE players SET points = points + ?1 WHERE name = ?2').bind(delta, target),
    env.DB.prepare(
      'INSERT INTO events (actor, target, delta, reason, ts) VALUES (?1, ?2, ?3, ?4, ?5)'
    ).bind(me, target, delta, reason, Date.now()),
  ]);

  return json({ me, ...(await readState(env)) });
}

async function handleReset(request, env) {
  const me = await whoAmI(request, env);
  if (!me) return json({ error: 'unauthorized' }, 401);

  const { code } = await request.json().catch(() => ({}));
  const expected = env.ROOM_CODE || 'vacanza';
  if (String(code || '').trim().toLowerCase() !== String(expected).trim().toLowerCase()) {
    return json({ error: 'Serve il codice della vacanza per azzerare' }, 403);
  }

  await ensureSchema(env);
  await env.DB.batch([
    env.DB.prepare('UPDATE players SET points = 0'),
    env.DB.prepare('DELETE FROM events'),
  ]);
  return json({ me, ...(await readState(env)) });
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

      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: 'server error', detail: String(err && err.message ? err.message : err) }, 500);
    }
  },
};
