/* ============================================================================
   Vacanza Cup — client
   ========================================================================== */
'use strict';

const PLAYERS = ['Emanuele', 'Serena', 'Mario', 'Greta'];
const COLORS = {
  Emanuele: 'var(--p-emanuele)',
  Serena: 'var(--p-serena)',
  Mario: 'var(--p-mario)',
  Greta: 'var(--p-greta)',
};
// Il testo che va SOPRA il colore (il giallo vuole scritte scure).
const ON_COLORS = {
  Emanuele: 'var(--on-emanuele)',
  Serena: 'var(--on-serena)',
  Mario: 'var(--on-mario)',
  Greta: 'var(--on-greta)',
};
// La versione scura, per scrivere il nome su fondo chiaro.
const TEXT_COLORS = {
  Emanuele: 'var(--t-emanuele)',
  Serena: 'var(--t-serena)',
  Mario: 'var(--t-mario)',
  Greta: 'var(--t-greta)',
};
const CONFETTI_HEX = { Emanuele: '#e52521', Serena: '#ffc400', Mario: '#0b6fe8', Greta: '#16a34a' };
const BEACH_HEX = ['#ffd34d', '#ffffff', '#ff9f4d', '#4fd6f0'];

// Le foto profilo: metti i file in /avatars (vedi avatars/README.txt).
// Se mancano, resta l'iniziale del nome.
const AVATAR_DIR = '/avatars/';

const $ = (sel) => document.querySelector(sel);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  me: null,
  players: PLAYERS.map((name) => ({ name, points: 0 })),
  log: [],
  rev: -1,
  leader: null,
  cols: new Map(),
  booted: false,
};

/* ------------------------------------------------------------------- api */

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, data });
  return data;
}

/* ----------------------------------------------------------------- audio */

let audioCtx = null;
let soundOn = localStorage.getItem('vc_sound') !== 'off';

function ctx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(freq, start, dur, { type = 'square', gain = 0.16, slide = null } = {}) {
  const ac = ctx();
  if (!ac || !soundOn) return;
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(amp).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

const semitone = (f, n) => f * Math.pow(2, n / 12);

const sfx = {
  // La moneta di Mario: due note. Con i punti a raffica sale di semitono,
  // così il combo si sente oltre che vedersi.
  coin(comboCount = 1) {
    const n = Math.min(comboCount - 1, 10);
    tone(semitone(987.77, n), 0, 0.07, { gain: 0.17 });
    tone(semitone(1318.51, n), 0.07, 0.42, { gain: 0.17 });
    if (comboCount >= 5) tone(semitone(2637, n), 0.09, 0.3, { type: 'triangle', gain: 0.07 });
  },
  minus() {
    tone(392, 0, 0.18, { type: 'sawtooth', gain: 0.13, slide: 120 });
    tone(196, 0.04, 0.22, { type: 'square', gain: 0.07, slide: 90 });
  },
  click() { tone(660, 0, 0.06, { type: 'triangle', gain: 0.1 }); },
  // Sorpasso: fanfara ascendente + scintillio.
  fanfare() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) =>
      tone(f, i * 0.08, 0.26, { gain: 0.16 })
    );
    [2093, 2637, 3136].forEach((f, i) => tone(f, 0.5 + i * 0.06, 0.35, { type: 'triangle', gain: 0.08 }));
  },
  start() { [523.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.3, { type: 'triangle', gain: 0.13 })); },
  error() { tone(220, 0, 0.18, { type: 'sawtooth', gain: 0.12, slide: 110 }); },
};

/* ------------------------------------------------------------- particles */

const canvas = $('#fx');
const c2d = canvas.getContext('2d');
let particles = [];

function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}
sizeCanvas();
addEventListener('resize', sizeCanvas);

function burst(x, y, { count = 22, colors = ['#ffd34d', '#fff'], power = 9, gravity = 0.42, star = false } = {}) {
  if (reduced) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = power * (0.4 + Math.random());
    particles.push({
      x, y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 3,
      g: gravity,
      size: star ? 8 + Math.random() * 9 : 5 + Math.random() * 7,
      color: colors[(Math.random() * colors.length) | 0],
      life: 1,
      decay: 0.012 + Math.random() * 0.014,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      star,
    });
  }
  tick();
}

function confettiRain(colors) {
  if (reduced) return;
  for (let i = 0; i < 130; i++) {
    particles.push({
      x: Math.random() * innerWidth,
      y: -20 - Math.random() * innerHeight * 0.6,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 5,
      g: 0.08,
      size: 6 + Math.random() * 9,
      color: colors[(Math.random() * colors.length) | 0],
      life: 1,
      decay: 0.005 + Math.random() * 0.005,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.5,
      star: Math.random() < 0.3,
    });
  }
  tick();
}

let raf = null;
function tick() {
  if (raf) return;
  const step = () => {
    c2d.clearRect(0, 0, innerWidth, innerHeight);
    particles = particles.filter((p) => p.life > 0 && p.y < innerHeight + 60);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.99;
      p.rot += p.vr; p.life -= p.decay;
      c2d.save();
      c2d.translate(p.x, p.y);
      c2d.rotate(p.rot);
      c2d.globalAlpha = Math.max(0, Math.min(1, p.life));
      c2d.fillStyle = p.color;
      if (p.star) drawStar(p.size);
      else c2d.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      c2d.restore();
    }
    if (particles.length) {
      raf = requestAnimationFrame(step);
    } else {
      c2d.clearRect(0, 0, innerWidth, innerHeight);
      raf = null;
    }
  };
  raf = requestAnimationFrame(step);
}

function drawStar(r) {
  c2d.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r * 0.45 : r;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    c2d.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  c2d.closePath();
  c2d.fill();
}

function floater(x, y, text, extra) {
  const el = document.createElement('div');
  el.className = 'floater' + (extra ? ' ' + extra : '');
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

let comboOn = null;
let comboN = 0;
let comboTimer = null;

// Punti a raffica sullo stesso giocatore: la moneta sale di tono, come i combo
// di Mario. Si azzera dopo un secondo e mezzo o cambiando bersaglio.
function combo(target) {
  clearTimeout(comboTimer);
  if (target === null) { comboOn = null; comboN = 0; return 0; }
  comboN = target === comboOn ? comboN + 1 : 1;
  comboOn = target;
  comboTimer = setTimeout(() => { comboOn = null; comboN = 0; }, 1500);
  return comboN;
}

function buzz(pattern) {
  if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch { /* pazienza */ } }
}

function shockwave(col, bar) {
  if (reduced) return;
  const ring = document.createElement('div');
  ring.className = 'shock';
  ring.style.top = (col.querySelector('.bar').getBoundingClientRect().height
    - bar.height - 4) + 'px';
  col.querySelector('.bar').appendChild(ring);
  setTimeout(() => ring.remove(), 620);
}

function nudge() {
  if (reduced) return;
  const arena = $('#board');
  arena.animate(
    [{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'translateY(0)' }],
    { duration: 160, easing: 'ease-out' }
  );
}

function shake() {
  if (reduced) return;
  document.body.classList.remove('shake');
  void document.body.offsetWidth;
  document.body.classList.add('shake');
  setTimeout(() => document.body.classList.remove('shake'), 460);
}

function banner(name) {
  const el = document.createElement('div');
  el.className = 'banner';
  el.innerHTML = `<div class="banner-text">\u{1F451} <span class="hl">${name}</span><span class="sub">\u00E8 in testa! \u{1F3D6}\uFE0F</span></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2100);
}

function toast(msg, ms = 2400) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), ms);
}

/* ----------------------------------------------------------------- sky */

(function beachScene() {
  // nuvole e gabbiani che passano in cielo
  const box = $('#clouds');
  const glyphs = ['\u2601\uFE0F', '\u2601\uFE0F', '\uD83D\uDD4A\uFE0F', '\u2601\uFE0F', '\uD83E\uDE81'];
  for (let i = 0; i < 7; i++) {
    const el = document.createElement('div');
    el.className = 'cloud';
    el.textContent = glyphs[i % glyphs.length];
    el.style.top = 3 + Math.random() * 34 + '%';
    el.style.fontSize = 1.6 + Math.random() * 2.4 + 'rem';
    el.style.animationDuration = 34 + Math.random() * 45 + 's';
    el.style.animationDelay = -Math.random() * 60 + 's';
    box.appendChild(el);
  }

  // la fila di ombrelloni sulla sabbia
  const beach = $('#beach');
  ['\u26F1\uFE0F', '\uD83C\uDFD6\uFE0F', '\u26F1\uFE0F', '\uD83C\uDF34', '\u26F1\uFE0F', '\uD83E\uDD3D', '\u26F1\uFE0F']
    .forEach((g, i) => {
      const s = document.createElement('span');
      s.textContent = g;
      s.style.animationDelay = (i * 0.3) + 's';
      beach.appendChild(s);
    });
})();

/* ---------------------------------------------------------------- login */

let chosen = localStorage.getItem('vc_who');

(function buildWhoGrid() {
  const grid = $('#who-grid');
  PLAYERS.forEach((name) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'who' + (name === chosen ? ' on' : '');
    b.textContent = name;
    b.style.setProperty('--c', COLORS[name]);
    b.style.setProperty('--on', ON_COLORS[name]);
    b.addEventListener('click', () => {
      chosen = name;
      localStorage.setItem('vc_who', name);
      grid.querySelectorAll('.who').forEach((x) => x.classList.toggle('on', x === b));
      sfx.click();
    });
    grid.appendChild(b);
  });
})();

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-error');
  const btn = $('#login-btn');
  err.classList.remove('show');
  err.textContent = '';

  if (!chosen) {
    err.textContent = 'Prima dimmi chi sei!';
    err.classList.add('show');
    sfx.error();
    return;
  }

  btn.classList.add('loading');
  try {
    await api('/api/login', { method: 'POST', body: JSON.stringify({ code: $('#code').value, name: chosen }) });
    sfx.start();
    await enterGame(chosen);
  } catch (ex) {
    err.textContent = ex.message || 'Non ci siamo';
    err.classList.add('show');
    sfx.error();
    shake();
  } finally {
    btn.classList.remove('loading');
  }
});

/* ----------------------------------------------------------------- board */

function makeCol(name) {
  const col = document.createElement('div');
  col.className = 'col';
  col.dataset.name = name;
  col.style.setProperty('--c', COLORS[name]);
  col.style.setProperty('--on', ON_COLORS[name]);
  col.innerHTML = `
    <div class="bar">
      <div class="fill"><div class="cap"></div></div>
      <div class="score">0</div>
    </div>
    <div class="pill">
      <div class="pos">1</div>
      <div class="avatar">${name[0]}</div>
      <div class="name">${name}</div>
    </div>
    <div class="actions">
      <button class="minus" aria-label="Togli un punto a ${name}">\u2212</button>
      <button class="plus"  aria-label="Aggiungi un punto a ${name}">+</button>
    </div>`;

  // foto profilo: prima .jpg, poi .png, altrimenti resta l'iniziale
  const slug = name.toLowerCase();
  const img = new Image();
  img.alt = '';
  img.onload = () => col.querySelector('.avatar').appendChild(img);
  img.onerror = () => {
    if (img.dataset.retry) return;
    img.dataset.retry = '1';
    img.src = AVATAR_DIR + slug + '.png';
  };
  img.src = AVATAR_DIR + slug + '.jpg';

  col.querySelector('.plus').addEventListener('click', (e) => sendPoint(name, 1, e));
  col.querySelector('.minus').addEventListener('click', (e) => sendPoint(name, -1, e));

  state.cols.set(name, col);
  return col;
}

function render({ animate = true } = {}) {
  const board = $('#board');
  const max = Math.max(1, ...state.players.map((p) => p.points));
  // Classifica con pari merito: 5-3-3-1 diventa 1º, 2º, 2º, 4º.
  const rank = new Map();
  let prevPoints = null;
  let prevRank = 0;
  state.players.forEach((p, i) => {
    if (p.points !== prevPoints) { prevRank = i + 1; prevPoints = p.points; }
    rank.set(p.name, prevRank);
  });
  const leader = currentLeader();

  // Le colonne restano sempre nello stesso ordine: si confrontano a colpo d'occhio.
  PLAYERS.forEach((name) => {
    const col = state.cols.get(name) || makeCol(name);
    if (!col.isConnected) board.appendChild(col);

    const p = state.players.find((x) => x.name === name);
    const scoreEl = col.querySelector('.score');
    const prev = Number(scoreEl.textContent);

    // altezza della barra: un moncone visibile a 0, poi in proporzione al primo
    const h = p.points <= 0 ? 3 : 8 + 84 * (p.points / max);
    col.style.setProperty('--h', h.toFixed(2) + '%');
    col.classList.toggle('tall', h > 24);
    col.dataset.rank = rank.get(name);
    col.querySelector('.pos').textContent = rank.get(name);
    col.classList.toggle('zero', p.points <= 0);   // senza punti niente medaglia
    col.classList.toggle('top', name === leader);

    if (prev !== p.points) {
      scoreEl.textContent = p.points;
      if (animate && state.booted) {
        scoreEl.classList.remove('pop');
        void scoreEl.offsetWidth;
        scoreEl.classList.add('pop');
      }
    }
  });

  // il segnalino "TU"
  if (state.me && state.cols.has(state.me)) {
    const pill = state.cols.get(state.me).querySelector('.pill');
    if (!pill.querySelector('.me-dot')) {
      const dot = document.createElement('div');
      dot.className = 'me-dot';
      dot.textContent = 'TU';
      pill.appendChild(dot);
    }
  }

  placeCrown(animate);
}

/* ----------------------------------------------------------------- crown */

function placeCrown(animate) {
  const crown = $('#crown');
  const top = state.players[0];
  const tie = state.players[1] && state.players[1].points === top.points;

  if (!top || top.points <= 0 || tie) {
    crown.classList.remove('on');
    return;
  }

  const col = state.cols.get(top.name);
  const wrap = $('.board-wrap');
  if (!col || !wrap) return;

  const r = col.querySelector('.fill').getBoundingClientRect();
  const w = wrap.getBoundingClientRect();
  const crownW = crown.offsetWidth || 66;
  const x = r.left - w.left + r.width / 2 - crownW / 2;
  const y = r.top - w.top - 58;

  const first = !crown.classList.contains('on');
  const fromX = parseFloat(crown.style.left) || x;
  const fromY = parseFloat(crown.style.top) || y;

  crown.style.left = x + 'px';
  crown.style.top = y + 'px';
  crown.classList.add('on');

  if (first || reduced || !animate) return;

  const dx = fromX - x;
  const dy = fromY - y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

  // salto ad arco stile Super Mario
  crown.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(1) rotate(0deg)` },
      { transform: `translate(${dx / 2}px, ${dy / 2 - 70}px) scale(1.5) rotate(200deg)`, offset: 0.5 },
      { transform: 'translate(0,0) scale(1.18) rotate(380deg)', offset: 0.82 },
      { transform: 'translate(0,0) scale(1) rotate(360deg)' },
    ],
    { duration: 850, easing: 'cubic-bezier(.3,1.2,.4,1)' }
  );
}

/* ---------------------------------------------------------------- azioni */

let pending = 0;
let chain = Promise.resolve();

function sortPlayers() {
  state.players.sort(
    (a, b) => b.points - a.points || PLAYERS.indexOf(a.name) - PLAYERS.indexOf(b.name)
  );
}

function currentLeader() {
  const top = state.players[0];
  if (!top || top.points <= 0) return null;
  if (state.players[1] && state.players[1].points === top.points) return null;
  return top.name;
}

function celebrate(wasLeader) {
  const now = currentLeader();
  if (!state.booted || !now || now === wasLeader) return;
  sfx.fanfare();
  buzz([40, 60, 40, 60, 120]);
  shake();
  confettiRain([CONFETTI_HEX[now], ...BEACH_HEX]);
  banner(now);
}

function sendPoint(target, delta, event) {
  const col = state.cols.get(target);
  const fill = col.querySelector('.fill');
  const bar = fill.getBoundingClientRect();
  const cx = bar.left + bar.width / 2;
  const cy = bar.top;

  // ---- fuochi d'artificio, subito, senza aspettare il server --------------
  if (delta > 0) {
    const c = combo(target);
    sfx.coin(c);
    buzz(c > 3 ? [12, 30, 12] : 18);
    floater(cx, cy, '+1');
    if (c > 1) floater(cx + 34, cy + 26, `\u00D7${c}`, 'combo');
    burst(cx, cy, {
      colors: ['#ffd34d', '#fff6c2', '#ffffff', CONFETTI_HEX[target]],
      star: true, count: 18 + Math.min(c, 6) * 4, power: 8 + Math.min(c, 6),
    });
    shockwave(col, bar);
    col.classList.remove('pump');
    void col.offsetWidth;
    col.classList.add('pump');
    nudge();
  } else {
    combo(null);
    sfx.minus();
    buzz(35);
    floater(cx, cy, '\u22121', 'minus-f');
    burst(cx, cy, { colors: ['#8fd8ff', '#dff3ff'], count: 10, power: 6 });
    col.classList.remove('drop');
    void col.offsetWidth;
    col.classList.add('drop');
  }

  // ---- punteggio aggiornato all'istante ----------------------------------
  const wasLeader = currentLeader();
  const player = state.players.find((p) => p.name === target);
  if (player) {
    player.points += delta;
    sortPlayers();
    render();
    celebrate(wasLeader);
  }

  // ---- la chiamata al server va in coda: si puo' pestare a raffica --------
  pending++;
  chain = chain
    .then(() => api('/api/point', { method: 'POST', body: JSON.stringify({ target, delta }) }))
    .then((data) => { if (pending === 1) apply(data); })
    .catch((ex) => {
      if (ex.status === 401) return logout(true);
      toast('Ops, punto non salvato: riprova');
      sfx.error();
      return refresh();
    })
    .finally(() => { pending--; });
  return chain;
}

function apply(data) {
  const wasLeader = currentLeader();
  state.me = data.me || state.me;
  state.players = data.players;
  state.log = data.log || [];
  state.rev = data.rev;

  render();
  renderTicker();
  celebrate(wasLeader);
  state.booted = true;
}

let lastLogged = null;

function renderTicker() {
  const box = $('#ticker');
  const e = state.log[0];
  if (!e) { box.innerHTML = ''; lastLogged = null; return; }
  if (e.id === lastLogged) return;

  const first = lastLogged === null && !state.booted;
  lastLogged = e.id;
  if (first) return;            // all'apertura non riproponiamo la notizia vecchia

  const txt = e.actor === e.target
    ? (e.delta > 0 ? `${e.actor} si \u00E8 dato +1` : `${e.actor} si \u00E8 tolto 1`)
    : (e.delta > 0 ? `${e.actor} \u2192 +1 a ${e.target}` : `${e.actor} \u2192 \u22121 a ${e.target}`);

  box.innerHTML = `<span>${txt}</span>`;
  box.classList.remove('show');
  void box.offsetWidth;
  box.classList.add('show');
}

/* ------------------------------------------------------------- polling */

let poller = null;

async function refresh() {
  try {
    const data = await api('/api/state');
    if (data.rev !== state.rev) apply(data);
  } catch (ex) {
    if (ex.status === 401) logout(true);
  }
}

function startPolling() {
  stopPolling();
  poller = setInterval(() => { if (!document.hidden && !pending) refresh(); }, 2500);
}
function stopPolling() { clearInterval(poller); poller = null; }
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.me) refresh(); });

/* ---------------------------------------------------------- schermate */

async function enterGame(me) {
  state.me = me;
  $('#login').hidden = true;
  $('#game').hidden = false;
  $('#me-chip').textContent = me;
  $('#me-chip').style.color = TEXT_COLORS[me];

  const data = await api('/api/state');
  state.booted = false;
  apply(data);
  state.booted = true;
  startPolling();
}

async function logout(silent) {
  stopPolling();
  try { await api('/api/logout', { method: 'POST' }); } catch { /* ignora */ }
  state.me = null;
  state.rev = -1;
  state.booted = false;
  $('#game').hidden = true;
  $('#login').hidden = false;
  $('#crown').classList.remove('on');
  if (silent) toast('Sessione scaduta, rientra pure');
}

/* ------------------------------------------------------------- comandi */

$('#logout-btn').addEventListener('click', () => { sfx.click(); logout(); });

$('#sound-btn').addEventListener('click', (e) => {
  soundOn = !soundOn;
  localStorage.setItem('vc_sound', soundOn ? 'on' : 'off');
  e.currentTarget.textContent = soundOn ? '🔊' : '🔇';
  e.currentTarget.classList.toggle('off', !soundOn);
  if (soundOn) sfx.click();
});

$('#undo-btn').addEventListener('click', async () => {
  const last = state.log[0];
  if (!last) return toast('Non c\'è niente da annullare');
  sfx.click();
  try {
    apply(await api('/api/point', {
      method: 'POST',
      body: JSON.stringify({ target: last.target, delta: last.delta > 0 ? -1 : 1, reason: 'annulla' }),
    }));
    toast(`Annullato: ${last.delta > 0 ? '+1' : '−1'} a ${last.target}`);
  } catch { toast('Non sono riuscito ad annullare'); }
});

$('#reset-btn').addEventListener('click', async () => {
  const code = prompt(
    'Riparto da 0-0-0-0. Lo storico non viene cancellato (resta nel backup).\n'
    + 'Scrivi il codice vacanza per confermare:'
  );
  if (!code) return;
  try {
    apply(await api('/api/reset', { method: 'POST', body: JSON.stringify({ code }) }));
    state.booted = true;
    toast('Si riparte da zero. Lo storico è conservato.');
    sfx.start();
  } catch (ex) {
    toast(ex.message || 'Reset non riuscito');
    sfx.error();
  }
});

addEventListener('resize', () => placeCrown(false));

/* ---------------------------------------------------------------- avvio */

(async function boot() {
  $('#sound-btn').textContent = soundOn ? '🔊' : '🔇';
  $('#sound-btn').classList.toggle('off', !soundOn);
  try {
    const s = await api('/api/session');
    if (s.me) {
      chosen = s.me;
      await enterGame(s.me);
      return;
    }
  } catch { /* mostra il login */ }
  $('#login').hidden = false;
})();
