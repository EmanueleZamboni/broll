/* ============================================================================
   Vacanza Cup — versione Artifact.
   Stessa app del Worker, ma i punteggi li salva la pagina dentro di sé.
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

const SHELL = `
<div class="sky">
  <div class="sun"></div>
  <div class="clouds" id="clouds"></div>
  <div class="sea"><div class="wave w1"></div><div class="wave w2"></div><div class="wave w3"></div></div>
  <div class="sand"><div class="beach" id="beach"></div></div>
</div>

<canvas id="fx"></canvas>

<section id="login" class="screen">
  <div class="logo">
    <span class="logo-crown">\u{1F451}</span>
    <p class="kicker">⛱ Lido degli Estensi ⛱</p>
    <h1 class="logo-text"><span class="w">VACANZA</span><span class="w cup">CUP</span></h1>
    <p class="tagline">Chi vince porta la corona</p>
  </div>
  <div class="card-panel">
    <label class="field-label">Chi sei?</label>
    <div class="who-grid" id="who-grid"></div>
    <button type="button" class="btn-big" id="login-btn"><span>ENTRA</span></button>
    <p class="error" id="login-error" role="alert"></p>
  </div>
</section>

<section id="game" class="screen" hidden>
  <header class="topbar">
    <div class="brand"><span class="brand-crown">\u{1F451}</span> VACANZA&nbsp;CUP<small>Lido degli Estensi</small></div>
    <div class="topbar-right">
      <span class="me-chip" id="me-chip"></span>
      <button class="icon-btn" id="sound-btn" title="Audio" aria-label="Attiva o disattiva audio">\u{1F50A}</button>
      <button class="icon-btn" id="logout-btn" title="Cambia giocatore" aria-label="Cambia giocatore">⏻</button>
    </div>
  </header>

  <p class="note" id="note" hidden></p>

  <div class="board-wrap">
    <div class="crown" id="crown" aria-hidden="true">
      <div class="crown-inner">\u{1F451}</div>
      <div class="crown-shine"></div>
    </div>
    <div class="arena" id="board"></div>
  </div>

  <div class="ticker" id="ticker" aria-live="polite"></div>

  <footer class="footdock">
    <button class="mini-btn" id="undo-btn">↩︎ Annulla ultimo</button>
    <button class="mini-btn danger" id="reset-btn">⟲ Azzera tutto</button>
  </footer>
</section>

<div class="toast" id="toast" hidden></div>
`;

const $ = (sel) => document.querySelector(sel);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  me: null,
  points: Object.fromEntries(PLAYERS.map((n) => [n, 0])),
  log: [],
  v: 0,
  players: [],
  cols: new Map(),
  booted: false,
  readonly: false,
};

/* ================================================== salvataggio nella pagina */

let art = null;            // il namespace "artifact", quando arriva
let saveMode = 'files';    // 'files' → salva senza ricaricare | 'html' | 'off'
let saveTimer = null;
let savePending = false;

// Ogni punto porta un identificativo suo: serve per accorgersi, alla
// riapertura, se è finito davvero nel salvataggio o se si è perso per strada.
const newId = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

/* --- rete di sicurezza contro i punti persi -------------------------------
   Quando due telefoni salvano nello stesso istante, uno dei due perde: la
   piattaforma tiene la versione arrivata prima e ricarica gli altri. Per non
   buttare via quel punto lo si mette da parte nel telefono PRIMA di salvare;
   alla riapertura, se non compare nello storico, viene rimesso. */
const PENDING_KEY = 'vc_pending';
const PENDING_TTL = 5 * 60 * 1000;

function readPending() {
  try { return JSON.parse(sessionStorage.getItem(PENDING_KEY)) || []; }
  catch { return []; }
}
function writePending(list) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(list)); }
  catch { /* niente sessionStorage: si va avanti senza rete */ }
}
function rememberPending(ev) {
  const now = Date.now();
  writePending(readPending().filter((e) => now - e.ts < PENDING_TTL).concat(ev));
}

// Chiamata all'apertura: rimette i punti che non sono arrivati a destinazione.
function replayPending() {
  const now = Date.now();
  const recenti = readPending().filter((e) => now - e.ts < PENDING_TTL);
  const arrivati = new Set(state.log.map((e) => e.id).filter(Boolean));
  const persi = recenti.filter((e) => !arrivati.has(e.id));

  writePending(persi);
  if (!persi.length) return;

  persi.forEach((e) => {
    state.points[e.target] = (state.points[e.target] || 0) + e.delta;
    state.log.unshift(e);
  });
  state.log = state.log.slice(0, 40);
  state.v++;
  sortPlayers();
  render({ animate: false });
  toast(persi.length === 1
    ? 'Recuperato 1 punto che non era stato salvato'
    : `Recuperati ${persi.length} punti che non erano stati salvati`, 3500);
  save();
}

function snapshot() {
  return { v: state.v, points: { ...state.points }, log: state.log.slice(0, 40) };
}

function readEmbedded() {
  try { return JSON.parse(document.getElementById('state').textContent) || null; }
  catch { return null; }
}

// Lo stato vero sta in data/state.json quando esiste; il blocco dentro la
// pagina è la copia di riserva (e il punto di partenza la prima volta).
async function loadState() {
  const embedded = readEmbedded() || {};
  let best = embedded;
  try {
    const res = await fetch('./data/state.json', { cache: 'no-store' });
    if (res.ok) {
      const fromFile = await res.json();
      if (fromFile && (fromFile.v || 0) >= (embedded.v || 0)) best = fromFile;
    }
  } catch { /* il file non c'è ancora: va bene così */ }

  PLAYERS.forEach((n) => { state.points[n] = Number(best.points && best.points[n]) || 0; });
  state.log = Array.isArray(best.log) ? best.log : [];
  state.v = Number(best.v) || 0;
  sortPlayers();
}

function buildDoc(snap) {
  // ATTENZIONE: la piattaforma mette un suo piccolo <style> di reset prima del
  // nostro. Prendendo il foglio di stile con querySelector('style') si finisce
  // per ripubblicare quello, e la pagina resta senza grafica (successo davvero).
  // Quindi: per id, con ripiego sul <style> più lungo, e comunque non si
  // pubblica niente se quello che troviamo è troppo corto per essere l'app.
  const styles = Array.from(document.querySelectorAll('style'));
  const cssEl = document.getElementById('css')
    || styles.sort((a, b) => b.textContent.length - a.textContent.length)[0];
  const appEl = document.getElementById('app');
  const css = cssEl ? cssEl.textContent : '';
  const app = appEl ? appEl.textContent : '';
  if (css.length < 5000 || app.length < 5000) return null;

  const json = JSON.stringify(snap).replace(/</g, '\\u003c');
  const S = 'scr' + 'ipt';
  return [
    '<!doctype html>',
    '<html lang="it">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">',
    '<meta name="theme-color" content="#2bb3e8">',
    '<title>Vacanza Cup</title>',
    '<style id="css">' + css + '</style>',
    '</head>',
    '<body>',
    '<div id="root"></div>',
    '<' + S + ' type="application/json" id="state">' + json + '</' + S + '>',
    '<' + S + ' id="app">' + app + '</' + S + '>',
    '</body>',
    '</html>',
  ].join('\n');
}

function goReadonly() {
  if (state.readonly) return;
  state.readonly = true;
  document.body.classList.add('readonly');
  note('Stai guardando in sola lettura: i punti li può assegnare chi ha accesso in modifica.');
}

function note(msg) {
  const el = $('#note');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
}

// I punti si accumulano e partono in un colpo solo: pestare il + a raffica
// non deve produrre venti salvataggi.
function save() {
  if (!art || state.readonly || saveMode === 'off') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 1100);
}

async function persist() {
  if (!art || state.readonly || saveMode === 'off' || savePending) return;
  savePending = true;
  const snap = snapshot();

  try {
    if (saveMode === 'files') {
      await art.publish({ 'data/state.json': JSON.stringify(snap) });
    } else {
      const doc = buildDoc(snap);
      if (!doc) {
        saveMode = 'off';
        note('Salvataggio sospeso: non ritrovo il codice della pagina.');
        return;
      }
      await art.publish(doc);
    }
    // Se sono arrivati altri punti mentre salvavo, li salvo subito dopo.
    if (state.v !== snap.v) { savePending = false; return save(); }
  } catch (err) {
    const code = (err && err.code) || 'upstream_error';
    if (code === 'conflict') {
      // Qualcun altro ha salvato prima: la pagina si sta già ricaricando.
    } else if (code === 'not_writer' || code === 'not_granted' || code === 'consent_required') {
      goReadonly();
    } else if (code === 'rate_limited') {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 8000);
    } else if (saveMode === 'files') {
      saveMode = 'html';                       // la forma a file non è disponibile qui
      savePending = false;
      return persist();
    } else {
      saveMode = 'off';
      note('Il punteggio non si sta salvando: qui la pagina non può scrivere.');
    }
  } finally {
    savePending = false;
  }
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
  fanfare() {
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => tone(f, i * 0.08, 0.26, { gain: 0.16 }));
    [2093, 2637, 3136].forEach((f, i) => tone(f, 0.5 + i * 0.06, 0.35, { type: 'triangle', gain: 0.08 }));
  },
  start() { [523.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.3, { type: 'triangle', gain: 0.13 })); },
  error() { tone(220, 0, 0.18, { type: 'sawtooth', gain: 0.12, slide: 110 }); },
};

/* ------------------------------------------------------------- particelle */

let canvas = null;
let c2d = null;
let particles = [];

function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function burst(x, y, { count = 22, colors = ['#ffd34d', '#fff'], power = 9, gravity = 0.42, star = false } = {}) {
  if (reduced) return;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = power * (0.4 + Math.random());
    particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 3, g: gravity,
      size: star ? 8 + Math.random() * 9 : 5 + Math.random() * 7,
      color: colors[(Math.random() * colors.length) | 0],
      life: 1, decay: 0.012 + Math.random() * 0.014,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4, star,
    });
  }
  tick();
}

function confettiRain(colors) {
  if (reduced) return;
  for (let i = 0; i < 130; i++) {
    particles.push({
      x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * 0.6,
      vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 5, g: 0.08,
      size: 6 + Math.random() * 9, color: colors[(Math.random() * colors.length) | 0],
      life: 1, decay: 0.005 + Math.random() * 0.005,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.5, star: Math.random() < 0.3,
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
    if (particles.length) raf = requestAnimationFrame(step);
    else { c2d.clearRect(0, 0, innerWidth, innerHeight); raf = null; }
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

/* ------------------------------------------------------- effetti e combo */

let comboOn = null;
let comboN = 0;
let comboTimer = null;

// Punti a raffica sullo stesso giocatore: la moneta sale di tono, come i
// combo di Mario. Si azzera dopo un secondo e mezzo o cambiando bersaglio.
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
  const track = col.querySelector('.bar');
  const ring = document.createElement('div');
  ring.className = 'shock';
  ring.style.top = (track.getBoundingClientRect().height - bar.height - 4) + 'px';
  track.appendChild(ring);
  setTimeout(() => ring.remove(), 620);
}

function nudge() {
  if (reduced) return;
  $('#board').animate(
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
  el.innerHTML = `<div class="banner-text">\u{1F451} <span class="hl">${name}</span><span class="sub">è in testa! \u{1F3D6}️</span></div>`;
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

/* --------------------------------------------------------------- spiaggia */

function beachScene() {
  const box = $('#clouds');
  const glyphs = ['☁️', '☁️', '\u{1F54A}️', '☁️', '\u{1FA81}'];
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
  const beach = $('#beach');
  ['⛱️', '\u{1F3D6}️', '⛱️', '\u{1F334}', '⛱️', '\u{1F93D}', '⛱️']
    .forEach((g, i) => {
      const s = document.createElement('span');
      s.textContent = g;
      s.style.animationDelay = (i * 0.3) + 's';
      beach.appendChild(s);
    });
}

/* ------------------------------------------------------------------ board */

function sortPlayers() {
  state.players = PLAYERS.map((name) => ({ name, points: state.points[name] }))
    .sort((a, b) => b.points - a.points || PLAYERS.indexOf(a.name) - PLAYERS.indexOf(b.name));
}

function currentLeader() {
  const top = state.players[0];
  if (!top || top.points <= 0) return null;
  if (state.players[1] && state.players[1].points === top.points) return null;
  return top.name;
}

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
      <button class="minus" aria-label="Togli un punto a ${name}">−</button>
      <button class="plus"  aria-label="Aggiungi un punto a ${name}">+</button>
    </div>`;

  // Le foto profilo sono incorporate nel CSS (una per giocatore).

  col.querySelector('.plus').addEventListener('click', (e) => addPoint(name, 1, e));
  col.querySelector('.minus').addEventListener('click', (e) => addPoint(name, -1, e));

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

function placeCrown(animate) {
  const crown = $('#crown');
  const leader = currentLeader();
  if (!leader) { crown.classList.remove('on'); return; }

  const col = state.cols.get(leader);
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

function celebrate(wasLeader) {
  const now = currentLeader();
  if (!state.booted || !now || now === wasLeader) return;
  sfx.fanfare();
  buzz([40, 60, 40, 60, 120]);
  shake();
  confettiRain([CONFETTI_HEX[now], ...BEACH_HEX]);
  banner(now);
}

/* ------------------------------------------------------------------ punti */

function addPoint(target, delta, event) {
  if (state.readonly) { toast('Sola lettura: non puoi assegnare punti'); return; }

  const col = state.cols.get(target);
  const fill = col.querySelector('.fill');
  const bar = fill.getBoundingClientRect();
  const cx = bar.left + bar.width / 2;
  const cy = bar.top;

  if (delta > 0) {
    const c = combo(target);
    sfx.coin(c);
    buzz(c > 3 ? [12, 30, 12] : 18);
    floater(cx, cy, '+1');
    if (c > 1) floater(cx + 34, cy + 26, `×${c}`, 'combo');
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
    floater(cx, cy, '−1', 'minus-f');
    burst(cx, cy, { colors: ['#8fd8ff', '#dff3ff'], count: 10, power: 6 });
    col.classList.remove('drop');
    void col.offsetWidth;
    col.classList.add('drop');
  }

  const wasLeader = currentLeader();
  const ev = { id: newId(), actor: state.me, target, delta, ts: Date.now() };
  state.points[target] += delta;
  state.log.unshift(ev);
  state.log = state.log.slice(0, 40);
  state.v++;
  sortPlayers();
  render();
  celebrate(wasLeader);
  showLastLog();
  rememberPending(ev);     // prima di salvare, non dopo
  save();
}

/* ------------------------------------------------------------------- log */

let lastLogged = null;

function showLastLog() {
  const box = $('#ticker');
  const e = state.log[0];
  if (!e) { box.innerHTML = ''; lastLogged = null; return; }
  if (e.ts === lastLogged) return;
  lastLogged = e.ts;

  const txt = e.actor === e.target
    ? (e.delta > 0 ? `${e.actor} si è dato +1` : `${e.actor} si è tolto 1`)
    : (e.delta > 0 ? `${e.actor} → +1 a ${e.target}` : `${e.actor} → −1 a ${e.target}`);

  box.innerHTML = `<span>${txt}</span>`;
  box.classList.remove('show');
  void box.offsetWidth;
  box.classList.add('show');
}

/* -------------------------------------------------------------- schermate */

function enterGame(me) {
  state.me = me;
  localStorage.setItem('vc_who', me);
  $('#login').hidden = true;
  $('#game').hidden = false;
  $('#me-chip').textContent = me;
  $('#me-chip').style.color = TEXT_COLORS[me];
  state.booted = false;
  render({ animate: false });
  state.booted = true;
  lastLogged = state.log[0] ? state.log[0].ts : null;   // niente notizie vecchie all'apertura
}

/* ------------------------------------------------------------------ avvio */

function wireUp() {
  canvas = $('#fx');
  c2d = canvas.getContext('2d');
  sizeCanvas();
  addEventListener('resize', () => { sizeCanvas(); placeCrown(false); });

  beachScene();

  let chosen = localStorage.getItem('vc_who');
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
      grid.querySelectorAll('.who').forEach((x) => x.classList.toggle('on', x === b));
      sfx.click();
    });
    grid.appendChild(b);
  });

  $('#login-btn').addEventListener('click', () => {
    if (!chosen) {
      const err = $('#login-error');
      err.textContent = 'Prima dimmi chi sei!';
      err.classList.add('show');
      sfx.error();
      shake();
      return;
    }
    sfx.start();
    enterGame(chosen);
  });

  $('#logout-btn').addEventListener('click', () => {
    sfx.click();
    $('#game').hidden = true;
    $('#login').hidden = false;
    $('#crown').classList.remove('on');
  });

  $('#sound-btn').addEventListener('click', (e) => {
    soundOn = !soundOn;
    localStorage.setItem('vc_sound', soundOn ? 'on' : 'off');
    e.currentTarget.textContent = soundOn ? '\u{1F50A}' : '\u{1F507}';
    e.currentTarget.classList.toggle('off', !soundOn);
    if (soundOn) sfx.click();
  });
  $('#sound-btn').textContent = soundOn ? '\u{1F50A}' : '\u{1F507}';
  $('#sound-btn').classList.toggle('off', !soundOn);

  $('#undo-btn').addEventListener('click', () => {
    const last = state.log[0];
    if (!last) { toast('Non c\'è niente da annullare'); return; }
    if (state.readonly) { toast('Sola lettura: non puoi annullare'); return; }
    sfx.click();
    const wasLeader = currentLeader();
    const ev = { id: newId(), actor: state.me, target: last.target, delta: -last.delta, ts: Date.now() };
    state.points[last.target] += ev.delta;
    state.log.unshift(ev);
    state.log = state.log.slice(0, 40);
    state.v++;
    sortPlayers();
    render();
    celebrate(wasLeader);
    toast(`Annullato: ${last.delta > 0 ? '+1' : '−1'} a ${last.target}`);
    rememberPending(ev);
    save();
  });

  $('#reset-btn').addEventListener('click', () => {
    if (state.readonly) { toast('Sola lettura: non puoi azzerare'); return; }
    if (!confirm('Azzero TUTTI i punteggi. Sicuro?')) return;
    PLAYERS.forEach((n) => { state.points[n] = 0; });
    state.log = [];
    state.v++;
    writePending([]);
    sortPlayers();
    state.booted = false;
    render();
    state.booted = true;
    toast('Punteggi azzerati. Si riparte da zero!');
    sfx.start();
    save();
  });
}

(async function boot() {
  document.getElementById('root').innerHTML = SHELL;
  wireUp();
  await loadState();
  render({ animate: false });

  const me = localStorage.getItem('vc_who');
  if (me && PLAYERS.includes(me)) enterGame(me);

  // La capability arriva dopo: fino ad allora la pagina funziona lo stesso.
  try {
    art = window.claude && window.claude.use ? await window.claude.use('artifact') : null;
  } catch { art = null; }
  if (!art) {
    note('Qui i punteggi non vengono salvati: apri il link dell\'artifact per tenerli.');
    return;
  }
  replayPending();
})();
