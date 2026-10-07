'use strict';

(() => {
  const D = window.ARENA_DATA;
  const { SPONSORS, VENUES, CHARACTERS, PICKUPS, GOAL_REWARD, BOOSTERS, REVIVE, SKINS, UPGRADE_COSTS, MAX_UPGRADE, COACH, COACH_TIPS } = D;

  const STATS = [
    { key: 'tempo', name: 'Tempo' },
    { key: 'jump', name: 'Sprungkraft' },
    { key: 'shield', name: 'Schild-Dauer' },
    { key: 'radius', name: 'Sammelradius' },
  ];

  // ---------- Grundeinstellungen ----------
  const VENUE_LENGTH = 320;     // Meter pro Stadion
  const METERS_PER_UNIT = 0.6;  // Welt-Einheit (= eine Spurbreite) in Metern
  const Z_NEAR = -1.2;
  const Z_FAR = 64;             // Sichtweite in Welt-Einheiten
  const Z_SPAWN = 58;
  const ZC = 4.2;               // Kamera-Abstand hinter der Figur
  const PUZZLE_PIECES = 6;
  const PUZZLE_REWARD = { points: 1000, taler: 100 };
  const OUTLINE = '#1b1530';
  const FONT = "'Arial Black', 'Trebuchet MS', system-ui, sans-serif";
  const TEST = /[?&]test\b/.test(location.search);

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  // ---------- Hilfsfunktionen ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const fmt = (n) => Math.floor(n).toLocaleString('de-DE');
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function hash(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = n + (n << 3);
    n ^= n >>> 4;
    n = Math.imul(n, 0x27d4eb2d);
    n ^= n >>> 15;
    return n >>> 0;
  }
  const shadeCache = new Map();
  function shade(hex, amt) {
    const key = hex + amt;
    let v = shadeCache.get(key);
    if (v) return v;
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map((x) => x + x).join('');
    const n = parseInt(c, 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (amt < 0) { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; } else { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    v = `rgb(${r | 0},${g | 0},${b | 0})`;
    shadeCache.set(key, v);
    return v;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // ---------- Optionale Charakterbilder ----------
  const images = {};
  for (const ch of CHARACTERS) {
    if (!ch.image) continue;
    const img = new Image();
    img.onload = () => { images[ch.id] = img; refreshUi(); };
    img.src = ch.image;
  }

  // ---------- Spielstand (localStorage) ----------
  const SAVE_KEY = 'arenaRush.save.v3';
  const STAT_DEFAULTS = {
    runs: 0, totalCoins: 0, totalScarves: 0, boosters: 0, trophies: 0, goalsScored: 0,
    jumps: 0, ducks: 0, iceMeters: 0, bestScore: 0, bestDistance: 0, duels: 0, puzzles: 0,
  };
  const charById = (id) => CHARACTERS.find((c) => c.id === id);

  function defaultSave() {
    return {
      best: 0, taler: 0, tokens: 0, stats: Object.assign({}, STAT_DEFAULTS),
      unlocked: [], upgrades: {}, xp: {}, skins: {}, puzzle: [],
      selected: ['luis', 'daniel'],
      settings: { coach: true },
      coachSeen: {}, coachIdx: 0,   // wie oft welcher Trainer-Tipp schon kam (Lernphase)
    };
  }
  function loadSave() {
    const d = defaultSave();
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s === 'object') {
        d.best = Number(s.best) || 0;
        d.taler = Number(s.taler) || 0;
        d.tokens = Math.min(Math.max(Math.floor(Number(s.tokens)) || 0, 0), REVIVE.max);
        d.stats = Object.assign(d.stats, s.stats);
        if (Array.isArray(s.unlocked)) d.unlocked = s.unlocked.filter((id) => charById(id));
        for (const k of ['upgrades', 'xp', 'skins']) if (s[k] && typeof s[k] === 'object') d[k] = s[k];
        if (Array.isArray(s.puzzle)) d.puzzle = s.puzzle.filter((i) => i >= 0 && i < PUZZLE_PIECES);
        if (Array.isArray(s.selected)) d.selected = s.selected.slice(0, 2);
        if (s.settings && typeof s.settings === 'object') d.settings = Object.assign(d.settings, s.settings);
        if (s.coachSeen && typeof s.coachSeen === 'object') d.coachSeen = s.coachSeen;
        d.coachIdx = Number(s.coachIdx) || 0;
      }
    } catch (e) { /* defekter Spielstand: neu beginnen */ }
    return d;
  }
  const save = loadSave();
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* Speicher nicht verfügbar */ }
  }

  const isUnlocked = (ch) => !!ch.starter || save.unlocked.includes(ch.id);
  ['luis', 'daniel'].forEach((def, slot) => {
    const ch = charById(save.selected[slot]);
    if (!ch || !isUnlocked(ch)) save.selected[slot] = def;
  });

  const specialsUnlocked = () => CHARACTERS.filter((c) => !c.starter && c.id !== 'lex' && isUnlocked(c)).length;
  const statValue = (key) => (key === 'specials' ? specialsUnlocked() : save.stats[key] || 0);
  const upLevel = (ch, k) => (save.upgrades[ch.id] && save.upgrades[ch.id][k]) || 0;
  const statTotal = (ch, k) => ch.base[k] + upLevel(ch, k);
  const xpFor = (L) => 250 * (L - 1) * L;
  function charLevel(ch) {
    const xp = save.xp[ch.id] || 0;
    let L = 1;
    while (L < 10 && xp >= xpFor(L + 1)) L++;
    return L;
  }
  function checkUnlocks() {
    const newly = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const ch of CHARACTERS) {
        if (!isUnlocked(ch) && ch.goal && statValue(ch.goal.stat) >= ch.goal.value) {
          save.unlocked.push(ch.id);
          newly.push(ch);
          changed = true;
        }
      }
    }
    return newly;
  }

  // Skins
  const skinState = (ch) => save.skins[ch.id] || (save.skins[ch.id] = { owned: ['home'], active: 'home' });
  const activeSkin = (ch) => (save.skins[ch.id] && save.skins[ch.id].active) || 'home';
  const ownsSkin = (ch, id) => id === 'home' || (save.skins[ch.id] && save.skins[ch.id].owned.includes(id));
  function skinColors(ch, skinId) {
    const c = ch.jersey.colors;
    if (skinId === 'away') return [c[1], c[0]].concat(c.slice(2));
    if (skinId === 'gold') return ['#f2c230', '#141414', '#fff1a8', '#ffffff'];
    return c;
  }
  // Alle Skins einer Figur: allgemeine Skins + eigene Zusatz-Skins (z. B. Luis mit Hockeyschläger)
  const skinsFor = (ch) => SKINS.concat(ch.skins || []);
  function look(ch, skinId) {
    const id = skinId || activeSkin(ch);
    const def = skinsFor(ch).find((s) => s.id === id) || {};
    const l = Object.assign({}, ch, { jersey: { pattern: ch.jersey.pattern, colors: skinColors(ch, id) }, skin_: id });
    if (def.extra) l.extra = def.extra;
    return l;
  }

  // ---------- Bildschirmgröße & Perspektive ----------
  let W = 0, H = 0, dpr = 1, L0 = 100, HY = 0, PY = 0;
  const camX = 0;   // feste Kamera: Spuren bleiben ruhig an ihrem Platz
  let resizePending = true;
  let dprCap = 2;   // maximale Pixeldichte; wird auf langsamen Geräten automatisch gesenkt
  // Größe nur übernehmen, wenn sie sich wirklich geändert hat (wird vor dem nächsten Bild ausgeführt)
  function applyResize() {
    resizePending = false;
    const nw = window.innerWidth, nh = window.innerHeight;
    const nd = Math.min(window.devicePixelRatio || 1, dprCap);
    if (nw === W && nh === H && nd === dpr) return;
    W = nw; H = nh; dpr = nd;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    L0 = Math.min(W * 0.29, H * 0.2, 230);
    HY = H * 0.3;
    PY = H * 0.86;
  }
  const requestResize = () => { resizePending = true; feedTop = null; };
  let feedTop = null;   // y-Position der kleinen Meldungen (unter dem Pause-Knopf), wird bei Bedarf gemessen
  // Bildratenunabhängige Glättung: Anteil, um den ein Wert in dt Sekunden auf sein Ziel zugeht
  const smooth = (rate, dt) => 1 - Math.exp(-rate * dt);
  const sc = (z) => (L0 * ZC) / (Math.max(z, Z_NEAR) + ZC);
  const gy = (z) => HY + ((PY - HY) * ZC) / (Math.max(z, Z_NEAR) + ZC);
  const proj = (x, y, z) => { const s = sc(z); return [W / 2 + (x - camX) * s, gy(z) - y * s]; };

  // ---------- Spielzustand ----------
  let game = null;
  let mode = 'solo';   // 'solo' | 'duo'
  let turn = 1;
  let results = [];
  let pendingUnlocks = [];

  const currentCharId = () => save.selected[mode === 'duo' ? turn - 1 : 0];

  function runParams(ch) {
    const a = ch.ability.id;
    const t = statTotal(ch, 'tempo'), j = statTotal(ch, 'jump'), s = statTotal(ch, 'shield'), r = statTotal(ch, 'radius');
    const beat = a === 'beatdrop' ? 1.5 : 1;
    return {
      ability: a,
      laneRate: 10 + t * 1.5,
      jumpDur: 0.56 + j * 0.035,
      jumpPeak: 1.0 + j * 0.05,
      shieldDur: (3 + s * 0.7) * (a === 'abwehr' ? 2 : 1) * beat,
      springDur: (6 + j * 0.5) * beat,
      magnetDur: (6 + r * 0.5) * beat,
      megafonDur: 8 * beat,
      magnet: (0.12 + r * 0.1) * (a === 'fangesang' ? 2 : 1),
      speedMult: (a === 'turbo' ? 1.12 : 1) * (a === 'frost' ? 0.85 : 1),
      scoreMult: (1 + (t - 3) * 0.04) * (1 + (charLevel(ch) - 1) * 0.03)
        * (a === 'torjaeger' ? 1.25 : 1) * (a === 'turbo' ? 1.5 : 1) * (a === 'legende' ? 1.5 : 1),
    };
  }

  function newGame(state, ch) {
    const g = {
      state, ch, P: ch ? runParams(ch) : null, look: ch ? look(ch) : null,
      time: 0, speed: 0, units: 0, dist: 0, points: 0, score: 0, taler: 0,
      coins: 0, scarves: 0, trophies: 0, boostersGot: 0, goals: 0, jumps: 0, ducks: 0, iceMeters: 0, puzzleGot: 0,
      venue: 0, pendingVenue: 0, eventDone: new Set(), event: null,
      nextRow: 1.4, objects: [], fx: [], feed: [], confetti: [],
      crashT: 0, crashText: '', menuT: 0, revives: 0, reviveSpawned: false,
      banner: { sub: 'Willkommen im', text: VENUES[0].name, t: 2.6 },
      fairplay: !!ch && ch.ability.id === 'fairplay_shield',
      player: { lane: 1, x: 0, jumpT: 0, jumpDur: 1, jumpPeak: 1, jumpBase: 0, airJumps: 0, duckT: 0, h: 0 },
      boost: { spring: 0, magnet: 0, shield: 0, megafon: 0 },
      coach: { text: '', lines: null, t: 0, cd: 0, level: 0, nextGeneral: rand(20, 28), said: new Set(), started: false },
      crashKind: null,
    };
    if (ch && ch.ability.id === 'legende') g.boost.shield = 3;
    return g;
  }

  // ---------- Steuerung ----------
  function act(a) {
    const g = game;
    if (!g || g.state !== 'run') return;
    const p = g.player;
    if (a === 'left') p.lane = Math.max(0, p.lane - 1);
    else if (a === 'right') p.lane = Math.min(2, p.lane + 1);
    else if (a === 'up') {
      if (g.event && g.event.phase === 'carry' && g.event.goal && g.event.goal.z < 44) shoot();
      else jump();
    } else if (a === 'down') {
      if (p.duckT <= 0) g.ducks++;
      p.duckT = 0.65;
      p.jumpT = 0;
      p.h = 0;
    }
  }

  function jump() {
    const g = game, p = g.player, P = g.P;
    const springs = g.boost.spring > 0;
    const dur = P.jumpDur * (springs ? 1.3 : 1);
    const peak = P.jumpPeak * (springs ? 1.75 : 1);
    if (p.jumpT <= 0) {
      Object.assign(p, { jumpT: dur, jumpDur: dur, jumpPeak: peak, jumpBase: 0, duckT: 0 });
      p.airJumps = P.ability === 'doppelsprung' ? 1 : 0;
      g.jumps++;
    } else if (p.airJumps > 0) {
      p.airJumps--;
      Object.assign(p, { jumpT: dur, jumpDur: dur, jumpPeak: peak, jumpBase: p.h });
      g.jumps++;
    }
  }

  const KEYS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ' ': 'up',
    a: 'left', d: 'right', w: 'up', s: 'down',
  };
  window.addEventListener('keydown', (e) => {
    if (!game) return;
    if ((e.key === 'Escape' || e.key === 'p') && (game.state === 'run' || game.state === 'pause')) {
      e.preventDefault();
      if (game.state === 'run') pauseGame(); else resumeGame();
      return;
    }
    if (game.state === 'run' && KEYS[e.key]) {
      e.preventDefault();
      if (e.repeat) return;   // gedrückt gehaltene Taste zählt nur einmal
      act(KEYS[e.key]);
    }
  });

  // Wischen: genau eine Aktion pro Finger-Berührung
  const SWIPE_MIN = 26;
  let touch = null;
  const findTouch = (list) => touch && [...list].find((t) => t.identifier === touch.id);
  function swipe(t) {
    const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return false;
    touch.fired = true;
    if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? 'right' : 'left');
    else act(dy > 0 ? 'down' : 'up');
    return true;
  }
  window.addEventListener('touchstart', (e) => {
    if (!game || game.state !== 'run' || touch) return;   // weiterer Finger startet keinen neuen Wisch
    if (e.target.closest && e.target.closest('button')) return;
    const t = e.changedTouches[0];
    touch = { id: t.identifier, x: t.clientX, y: t.clientY, fired: false };
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!touch) return;
    e.preventDefault();
    const t = findTouch(e.changedTouches);
    if (t && !touch.fired) swipe(t);
  }, { passive: false });
  window.addEventListener('touchend', (e) => {
    const t = findTouch(e.changedTouches);
    if (!t) return;
    if (!touch.fired) swipe(t);   // sehr schneller Wisch ohne touchmove-Ereignis
    touch = null;
  });
  window.addEventListener('touchcancel', (e) => { if (findTouch(e.changedTouches)) touch = null; });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game && game.state === 'run') pauseGame();
  });

  // ---------- Spiellogik ----------
  const TYPES = {
    ad: { hit: 'low', d: 0.35 }, hurdle: { hit: 'low', d: 0.3 },
    ball: { hit: 'low', d: 0.5 }, puck: { hit: 'low', d: 0.3 }, bball: { hit: 'low', d: 0.5 },
    banner: { hit: 'high', d: 0.35 },
    mower: { hit: 'block', d: 1.4 }, icemachine: { hit: 'block', d: 1.6 },
    cleaners: { hit: 'block', d: 1.0 }, bench: { hit: 'block', d: 1.3 },
    coin: { collect: true }, ticket: { collect: true }, scarf: { collect: true }, medal: { collect: true },
    jersey: { collect: true }, trophy: { collect: true }, goldball: { collect: true }, puzzle: { collect: true },
    spring: { collect: true }, magnet: { collect: true }, shield: { collect: true }, megafon: { collect: true },
    dropball: { collect: true }, revive: { collect: true },
    gate: {}, goal: {}, shot: {},
  };
  const MOVER_BOOST = { ball: 0.5, puck: 0.8, bball: 0.4, mower: 0.25, icemachine: 0.15 };
  const BANNER_TEXTS = ['OLÉ!', 'TOOOR!', 'HOPP!', 'LAUF!', 'GO GO GO!', 'ARENA!', 'JAAA!'];
  const CRASH_TEXTS = ['AUTSCH!', 'FOUL!', 'UFF!', 'ROTE KARTE!', 'ABPFIFF!'];

  function addObj(type, lane, z, extra) {
    const o = Object.assign({ type, lane, x: lane - 1, z, t: Math.random() * 10, air: 0 }, extra);
    if (MOVER_BOOST[type]) o.boost = MOVER_BOOST[type];
    game.objects.push(o);
    return o;
  }

  function addCoinLine(lane, z, type = 'coin', n = 6) {
    for (let k = 0; k < n; k++) addObj(type, lane, z + k * 1.4);
  }

  // Taler-Bogen über einem Hindernis, den man im Sprung einsammelt
  function addCoinArc(lane, z) {
    for (let k = -2; k <= 2; k++) addObj('coin', lane, z + k * 0.9, { air: 1.15 * Math.cos((k / 2.6) * (Math.PI / 2)) + 0.25 });
  }

  function pickObstacle(kind) {
    const r = Math.random();
    const low = kind === 'football' ? ['ad', 'hurdle'] : ['ad'];
    const block = kind === 'football' ? ['mower', 'bench', 'cleaners']
      : kind === 'ice' ? ['icemachine', 'bench', 'cleaners'] : ['cleaners', 'bench'];
    const mover = kind === 'football' ? 'ball' : kind === 'ice' ? 'puck' : 'bball';
    if (r < 0.26) return pick(low);
    if (r < 0.48) return 'banner';
    if (r < 0.76) return pick(block);
    return mover;
  }

  // Prüft, ob ein bewegtes Hindernis auf dem Weg zum Spieler ein anderes Hindernis einholen würde
  function laneBusy(lane, minZ) {
    return game.objects.some((o) => (lane < 0 || o.lane === lane) && TYPES[o.type] && TYPES[o.type].hit && o.z > minZ && !o.dead);
  }
  function safeMover(type, lane) {
    const b = MOVER_BOOST[type];
    if (!b) return type;
    const catchZ = Z_SPAWN / (1 + b) - 3;
    const isBlock = TYPES[type].hit === 'block';
    // Blockierende Fahrzeuge dürfen gar keine Reihe einholen, Bälle/Pucks keine in ihrer Spur
    if (laneBusy(isBlock ? -1 : lane, catchZ)) return isBlock ? 'bench' : 'ad';
    return type;
  }

  function obstacleExtra(type) {
    if (type === 'ad') return { sp: Math.floor(Math.random() * SPONSORS.length) };
    if (type === 'banner') return { text: pick(BANNER_TEXTS), pal: Math.floor(Math.random() * 2) };
    if (type === 'bench') return { team: pick(['#d63031', '#2e86de', '#8e44ad', '#e67e22']) };
    return {};
  }

  function maybeBonus(lane, z) {
    const g = game, r = Math.random();
    const puzzleMissing = save.puzzle.length < PUZZLE_PIECES && g.puzzleGot < 2;
    // Comeback-Token: ganz selten, höchstens einer pro Lauf
    if (r < REVIVE.rare && !g.reviveSpawned) { g.reviveSpawned = true; return addObj('revive', lane, z, { air: 0.4 }); }
    if (r < 0.035 && puzzleMissing) return addObj('puzzle', lane, z, { air: 0.4 });
    if (r < 0.12) return addObj(pick(['spring', 'magnet', 'shield', 'megafon']), lane, z, { air: 0.4 });
    if (r < 0.16) return addObj('trophy', lane, z, { air: 0.4 });
    if (r < 0.2) return addObj('goldball', lane, z, { air: 0.4 });
    if (r < 0.27) return addObj('jersey', lane, z, { air: 0.4 });
    if (r < 0.36) return addObj('medal', lane, z, { air: 0.4 });
    return addCoinLine(lane, z, Math.random() < 0.3 ? 'ticket' : 'coin', 4);
  }

  function spawnRow(kind) {
    const g = game;
    const lanes = shuffle([0, 1, 2]);
    const z = Z_SPAWN;
    if (Math.random() < 0.2) {
      addCoinLine(lanes[0], z, Math.random() < 0.25 ? 'scarf' : 'coin', 7);
      maybeBonus(lanes[1], z + 3);
      return;
    }
    const count = Math.random() < Math.min(0.25 + g.time / 120, 0.6) ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const type = safeMover(pickObstacle(kind), lanes[i]);
      addObj(type, lanes[i], z, obstacleExtra(type));
      if (TYPES[type].hit === 'low' && !MOVER_BOOST[type] && Math.random() < 0.4) addCoinArc(lanes[i], z);
    }
    if (Math.random() < 0.55) addCoinLine(lanes[2], z, Math.random() < 0.2 ? 'scarf' : 'coin', 5);
    else maybeBonus(lanes[2], z);
  }

  // ----- Torschuss-Event: in jedem Stadion einmal -----
  function startBallEvent(kind) {
    const g = game;
    const lane = Math.floor(Math.random() * 3);
    g.event = { phase: 'drop', kind, lane };
    addObj('dropball', lane, Z_SPAWN + 6, { kind, air: 8 });
    g.banner = {
      sub: 'Schnapp ihn dir!',
      text: kind === 'basket' ? 'Basketball von oben!' : kind === 'ice' ? 'Puck von oben!' : 'Ball von oben!',
      t: 2.2,
    };
  }

  function startCarry() {
    const g = game, ev = g.event;
    ev.phase = 'carry';
    ev.goal = addObj('goal', 1, Z_SPAWN, { kind: ev.kind, keeperX: 0, keeperLane: 1, keeperT: 0.6, fade: 0 });
    fxText(ev.kind === 'basket' ? 'Ab zum Korb!' : 'Ab aufs Tor!', '#ffffff', 26);
  }

  function shoot() {
    const g = game, p = g.player, ev = g.event;
    ev.phase = 'shot';
    ev.shot = addObj('shot', p.lane, 0.5, { kind: ev.kind, sx: p.x, tx: p.lane - 1, k: 0 });
  }

  function endEvent() {
    const g = game;
    g.event = null;
    g.nextRow = 0.5;
  }

  function updateEvent(dt) {
    const g = game, ev = g.event;
    if (!ev) return;
    const goal = ev.goal;
    if (goal) {
      // Während der Ball fliegt, ändert der Torwart sein Ziel nicht mehr (fair)
      if (ev.phase !== 'shot') goal.keeperT -= dt;
      if (goal.keeperT <= 0) {
        const options = [0, 1, 2].filter((l) => l !== goal.keeperLane);
        goal.keeperLane = pick(options);
        goal.keeperT = rand(0.5, 0.85);
      }
      goal.keeperX += ((goal.keeperLane - 1) - goal.keeperX) * smooth(7, dt);
    }
    if (ev.phase === 'carry' && goal && goal.z < 5) {
      fxText('Chance vertan!', '#ffffff', 24);
      goal.fade = 0.01;
      endEvent();
    }
    if (ev.phase === 'shot') {
      const s = ev.shot;
      s.k = Math.min(1, s.k + dt / 0.5);
      s.z = lerp(0.5, goal.z, s.k);
      s.x = lerp(s.sx, s.tx, s.k);
      s.air = ev.kind === 'basket' ? lerp(0.6, 2.6, s.k) + Math.sin(Math.PI * s.k) * 1.6
        : ev.kind === 'ice' ? 0.12 : 0.3 + Math.sin(Math.PI * s.k) * 0.6;
      if (s.k >= 1) {
        const saved = goal.keeperLane - 1 === s.tx;
        s.dead = true;
        goal.fade = 0.01;
        if (saved) {
          fxText(ev.kind === 'basket' ? 'GEBLOCKT!' : 'GEHALTEN!', '#ff6b6b', 34);
        } else {
          const mult = g.P.ability === 'torjaeger' ? 2 : 1;
          addPoints(GOAL_REWARD.points * mult);
          g.taler += GOAL_REWARD.taler * mult;
          g.goals++;
          goal.scored = true;
          fxText(ev.kind === 'basket' ? 'KORB!' : 'TOOOR!', '#ffd23f', 52);
          fxText(`+${fmt(GOAL_REWARD.points * mult * g.P.scoreMult)} · +${GOAL_REWARD.taler * mult} Taler`, '#ffffff', 20);
          burstConfetti(W / 2, H * 0.35, 90);
        }
        endEvent();
      }
    }
  }

  function addPoints(n) {
    const g = game;
    g.points += n * g.P.scoreMult * (g.boost.megafon > 0 ? 2 : 1);
  }

  // Große Einblendungen (Tor, Puzzle komplett …) erscheinen oben am Horizont – nie über der Laufbahn
  // vor der Figur, damit man ankommende Hindernisse immer sieht. Mehrere stapeln sich nach unten.
  function fxText(text, color, size = 22) {
    const below = game.fx.filter((f) => f.t > 0.5).reduce((sum, f) => sum + f.size + 8, 0);
    game.fx.push({ text, color, size, x: W / 2, y: H * 0.17 + 84 + size / 2 + below, t: 1.2, max: 1.2 });
  }

  // Kleine Meldungen (Sammelobjekte, Booster) als kurze Liste oben rechts unter der Taler-Anzeige
  function fxSmall(text, color = '#ffd23f') {
    const feed = game.feed;
    feed.unshift({ text, color, t: 1.6, max: 1.6 });
    if (feed.length > 4) feed.length = 4;
  }

  function burstConfetti(x, y, n) {
    const cols = ['#ffd000', '#00a650', '#ffffff', '#141414', '#ff6a00', '#4fc3f7'];
    for (let i = 0; i < n; i++) {
      game.confetti.push({
        x, y, vx: rand(-260, 260), vy: rand(-520, -120), r: rand(3, 7),
        c: pick(cols), rot: rand(0, 6), vr: rand(-8, 8), t: rand(1.4, 2.4),
      });
    }
  }

  function collect(o) {
    const g = game, P = g.P;
    o.dead = true;
    const pk = PICKUPS[o.type];
    if (pk) {
      let mult = P.ability === 'goldhand' ? 1.5 : 1;
      let lucky = false;
      if (P.ability === 'joker' && o.type !== 'coin' && Math.random() < 0.25) { mult *= 3; lucky = true; }
      addPoints(pk.points * mult);
      g.taler += pk.taler * (lucky ? 3 : 1);
      if (o.type === 'coin') g.coins++;
      if (o.type === 'scarf') g.scarves++;
      if (o.type === 'trophy') g.trophies++;
      if (o.type === 'dropball') { startCarry(); return; }
      if (o.type !== 'coin' && o.type !== 'ticket') {
        fxSmall(`${lucky ? 'GLÜCK! ' : ''}${pk.name} +${fmt(pk.points * mult * P.scoreMult * (g.boost.megafon > 0 ? 2 : 1))}`);
      }
      return;
    }
    if (o.type === 'revive') {
      if (save.tokens < REVIVE.max) save.tokens++;
      persist();
      fxText(`${REVIVE.icon} COMEBACK-TOKEN!`, '#7fd7ff', 30);
      fxText('Belebt dich nach einem Crash wieder', '#ffffff', 16);
      burstConfetti(W / 2, H * 0.35, 50);
      return;
    }
    if (o.type === 'puzzle') {
      const missing = [...Array(PUZZLE_PIECES).keys()].filter((i) => !save.puzzle.includes(i));
      if (!missing.length) return;
      save.puzzle.push(pick(missing));
      g.puzzleGot++;
      if (save.puzzle.length >= PUZZLE_PIECES) {
        save.puzzle = [];
        save.stats.puzzles++;
        addPoints(PUZZLE_REWARD.points);
        g.taler += PUZZLE_REWARD.taler;
        fxText('PUZZLE KOMPLETT!', '#ffd23f', 34);
        fxText(`+${fmt(PUZZLE_REWARD.points * P.scoreMult)} · +${PUZZLE_REWARD.taler} Taler`, '#ffffff', 20);
        burstConfetti(W / 2, H * 0.35, 70);
      } else {
        fxSmall(`Puzzleteil ${save.puzzle.length}/${PUZZLE_PIECES}`, '#7fe0ff');
      }
      persist();
      return;
    }
    // Booster
    g.boostersGot++;
    const durs = { spring: P.springDur, magnet: P.magnetDur, shield: P.shieldDur, megafon: P.megafonDur };
    g.boost[o.type] = durs[o.type];
    fxSmall(BOOSTERS[o.type].icon + ' ' + BOOSTERS[o.type].name, '#7fe0ff');
    coachSay('boost-' + o.type, COACH_TIPS.boost[o.type], { max: 2, prio: true });
  }

  function resolveHit(o, info) {
    const g = game, p = g.player, P = g.P;
    if (((o.type === 'ball' || o.type === 'bball') && P.ability === 'parade') || (o.type === 'puck' && P.ability === 'puckfaenger')) {
      o.dead = true;
      addPoints(25);
      fxSmall('Gefangen! +25', '#7CFFB2');
      return;
    }
    if (info.hit === 'low' && p.h > 0.35) { o.passed = true; return; }
    if (info.hit === 'block' && p.h > 1.15) { o.passed = true; return; }
    if (info.hit === 'high' && p.duckT > 0) { o.passed = true; return; }
    if (info.hit === 'low' && P.ability === 'brecher' && o.type !== 'puck') {
      o.dead = true; fxSmall('KRACH! Bande umgerannt', '#ffd000'); return;
    }
    if (g.boost.shield > 0 || (TEST && window.__arenaGod)) {
      o.dead = true; fxSmall('BOING! Schild hält', '#7fd7ff'); return;
    }
    if (g.fairplay) {
      g.fairplay = false;
      g.boost.shield = Math.max(g.boost.shield, 1.2);
      o.dead = true;
      fxText('FAIRPLAY-SCHUTZ!', '#7CFFB2', 26);
      coachSay('fairplay', COACH_TIPS.fairplay, { max: 2, prio: true });
      return;
    }
    crash(MOVER_BOOST[o.type] > 0.3 ? 'mover' : info.hit);
  }

  // ---------- Trainer-Tipps ----------
  // key: Kennung des Tipps · max: wie oft er insgesamt (über alle Läufe) kommt
  // prio: wichtig (Warnung/Torschuss), darf die Pause zwischen zwei Tipps überspringen
  // level: 2 = Torschuss, 1 = Warnung/Booster, 0 = allgemein. Ein Tipp unterbricht einen anderen nur,
  // wenn er wichtiger ist oder der alte schon mindestens 1,5 s zu sehen war.
  const COACH_SHOW = 3.4;
  function coachSay(key, text, { max = Infinity, prio = false, level = prio ? 1 : 0 } = {}) {
    const g = game, c = g && g.coach;
    if (!c || !text || !save.settings.coach || g.state !== 'run') return false;
    if (c.said.has(key) && !key.startsWith('warn-')) return false;   // pro Lauf nur einmal
    if (!prio && c.cd > 0) return false;
    if (c.t > 0 && level <= c.level && COACH_SHOW - c.t < 1.5) return false;
    if (c.t > 0 && level < c.level) return false;
    if ((save.coachSeen[key] || 0) >= max) return false;
    save.coachSeen[key] = (save.coachSeen[key] || 0) + 1;
    c.said.add(key);
    c.text = text.replace('{name}', g.ch.name.split(' ')[0]);
    c.lines = null;
    c.level = level;
    c.t = COACH_SHOW;
    c.cd = 4.5;
    return true;
  }

  function updateCoach(dt) {
    const g = game, c = g.coach, p = g.player;
    if (c.t > 0) c.t = Math.max(0, c.t - dt);
    if (c.cd > 0) c.cd -= dt;
    c.nextGeneral -= dt;
    if (!save.settings.coach) return;

    // Begrüßung
    if (!c.started && g.time > 0.6) {
      c.started = true;
      if (save.stats.runs < 3) coachSay('start-new', COACH_TIPS.startNew, { max: 3, prio: true });
      else coachSay('start-pro', pick(COACH_TIPS.startPro), { prio: true });
    }
    if (g.time > 5 && save.stats.runs < 3) coachSay('start-new2', COACH_TIPS.startNew2, { max: 3 });

    // Warnung vor dem nächsten Hindernis in der eigenen Spur (nur in der Lernphase)
    for (const o of g.objects) {
      if (o.coached || o.dead || o.passed) continue;
      const info = TYPES[o.type];
      if (!info || !info.hit || Math.abs(o.x - p.x) > 0.45 || o.z < 9 || o.z > 17) continue;
      o.coached = true;
      const kind = MOVER_BOOST[o.type] > 0.3 ? 'mover' : info.hit;
      if (coachSay('warn-' + kind, COACH_TIPS[kind], { max: 3, prio: true })) break;
    }

    // Torschuss-Event
    const ev = g.event;
    if (ev && ev.phase === 'drop') coachSay('drop', COACH_TIPS.drop, { max: 3, prio: true, level: 2 });
    if (ev && ev.phase === 'carry' && ev.goal && ev.goal.z < 44) coachSay('shoot', COACH_TIPS.shoot, { max: 5, prio: true, level: 2 });

    // Puzzleteil in Sicht
    if (g.objects.some((o) => o.type === 'puzzle' && !o.dead && o.z < 22 && o.z > 4)) coachSay('puzzle', COACH_TIPS.puzzle, { max: 3 });

    // Tempo
    if (g.time > 60) coachSay('speed', COACH_TIPS.speed, { max: 3 });

    // Allgemeine Tipps in Ruhephasen
    if (c.nextGeneral <= 0 && c.cd <= 0 && !ev) {
      const list = COACH_TIPS.general;
      const idx = save.coachIdx % list.length;
      if (coachSay('gen-' + idx, list[idx])) save.coachIdx++;
      c.nextGeneral = rand(24, 34);
    }
  }

  function crash(kind) {
    const g = game;
    g.state = 'crash';
    g.crashKind = kind;
    g.coach.t = 0;   // laufenden Tipp ausblenden, der Trainer-Tipp kommt im Game-over-Bildschirm
    g.crashT = 1.1;
    g.crashText = pick(CRASH_TEXTS);
    if (navigator.vibrate) navigator.vibrate(160);
  }

  function update(dt) {
    const g = game, p = g.player, P = g.P;
    g.time += dt;
    g.speed = (13 + Math.min(g.time / 100, 1) * 15) * P.speedMult;
    const du = g.speed * dt;
    g.units += du;
    const m = du * METERS_PER_UNIT;
    g.dist += m;

    // Nächstes Stadion: Eingangstor erscheint, beim Durchlaufen wechselt die Kulisse
    const vi = Math.floor(g.dist / VENUE_LENGTH) % VENUES.length;
    if (vi !== g.pendingVenue) {
      g.pendingVenue = vi;
      addObj('gate', 1, Z_SPAWN, { venue: vi });
    }
    const venue = VENUES[g.venue];
    const ice = venue.kind === 'ice';
    if (ice) g.iceMeters += m;
    g.points += m * P.scoreMult * (g.boost.megafon > 0 ? 2 : 1) * (ice && P.ability === 'eis' ? 1.5 : 1);

    // Spieler
    p.x += ((p.lane - 1) - p.x) * smooth(P.laneRate, dt);
    if (Math.abs((p.lane - 1) - p.x) < 0.002) p.x = p.lane - 1;   // sauber einrasten, kein Restzittern
    if (p.jumpT > 0) {
      p.jumpT = Math.max(0, p.jumpT - dt);
      const k = 1 - p.jumpT / p.jumpDur;
      p.h = p.jumpT > 0 ? p.jumpBase * (1 - k) + p.jumpPeak * Math.sin(Math.PI * k) : 0;
    }
    if (p.duckT > 0) p.duckT = Math.max(0, p.duckT - dt);
    for (const k in g.boost) if (g.boost[k] > 0) g.boost[k] = Math.max(0, g.boost[k] - dt);

    // Torschuss-Event einmal pro Stadion
    const inst = Math.floor(g.dist / VENUE_LENGTH);
    if (!g.event && !g.eventDone.has(inst) && g.dist - inst * VENUE_LENGTH > VENUE_LENGTH * 0.35 && g.venue === vi) {
      g.eventDone.add(inst);
      startBallEvent(venue.kind);
    }

    // Neue Reihen
    if (!g.event) {
      g.nextRow -= dt;
      if (g.nextRow <= 0) {
        spawnRow(VENUES[g.pendingVenue].kind);
        g.nextRow = rand(0.75, 1.25) - Math.min(g.time / 220, 0.2);
      }
    }

    // Objekte bewegen & prüfen
    const R = g.boost.magnet > 0 ? Math.max(P.magnet * 2.5, 2.3) : P.magnet;
    for (const o of g.objects) {
      if (o.type === 'shot') continue;
      o.z -= du * (1 + (o.boost || 0));
      o.t += dt;
      if (o.fade) o.fade = Math.min(1, o.fade + dt * 1.8);
      if (o.dead) continue;
      if (o.type === 'gate' && o.z <= 0 && !o.passed) {
        o.passed = true;
        g.venue = o.venue;
        g.banner = { sub: 'Willkommen im', text: VENUES[o.venue].name, t: 2.6 };
        const kind = VENUES[o.venue].kind;
        if (kind === 'ice' || kind === 'basket') coachSay('venue-' + kind, COACH_TIPS[kind], { max: 2 });
        continue;
      }
      if (o.type === 'dropball') o.air = o.z > 16 ? (o.z - 16) * 0.4 : Math.abs(Math.sin(o.z * 0.9)) * 0.45;
      const info = TYPES[o.type];
      if (!info) continue;
      if (info.collect) {
        if (o.type !== 'dropball' && o.z < 7 && o.z > -0.6 && Math.abs(p.x - o.x) < R + 0.35) {
          o.x += (p.x - o.x) * smooth(10, dt);
          o.air += (p.h + 0.3 - o.air) * smooth(6, dt);
          o.z -= o.z * smooth(5, dt);
        }
        if (Math.abs(p.x - o.x) < 0.42 && Math.abs(o.z) < 0.6 && Math.abs(o.air - p.h) < (o.type === 'dropball' ? 1.4 : 0.8)) {
          collect(o);
        }
        continue;
      }
      // Treffer nach sichtbarer Position: Figur muss wirklich (fast) in der Spur des Hindernisses sein
      if (!info.hit || o.passed || Math.abs(o.x - p.x) > 0.45) continue;
      if (Math.abs(o.z) > info.d / 2 + 0.35) continue;
      resolveHit(o, info);
      if (g.state !== 'run') return;
    }

    updateEvent(dt);
    updateCoach(dt);

    // Aufräumen
    g.objects = g.objects.filter((o) => {
      if (o.z < -3 || (o.fade >= 1) || (o.dead && o.type !== 'goal')) {
        if (o.type === 'dropball' && !o.dead && g.event && g.event.phase === 'drop') {
          fxText('Verpasst!', '#ffffff', 24);
          endEvent();
        }
        return false;
      }
      return true;
    });

    g.score = Math.floor(g.points);
    updateFx(dt);
    updateHud();
  }

  function updateFx(dt) {
    const g = game;
    for (const f of g.fx) f.t -= dt;   // bleiben ruhig an ihrem Platz und blenden aus
    g.fx = g.fx.filter((f) => f.t > 0);
    for (const f of g.feed) f.t -= dt;
    g.feed = g.feed.filter((f) => f.t > 0);
    for (const c of g.confetti) {
      c.t -= dt; c.vy += 700 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
    }
    g.confetti = g.confetti.filter((c) => c.t > 0 && c.y < H + 20);
    if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
  }

  // ---------- Läufe, Duell, Ergebnisse ----------
  function startMatch(m) {
    mode = m;
    turn = 1;
    results = [];
    pendingUnlocks = [];
    startRun();
  }

  function startRun() {
    const ch = charById(currentCharId());
    game = newGame('run', ch);   // frische Werte: Figur, Hindernisse, Booster, Effekte, Event
    // Eingaben und Zeitmessung vollständig zurücksetzen
    touch = null;
    acc = 0;
    last = performance.now();
    hudCache = {};
    ui.boosts.innerHTML = '';
    ui.hudPlayer.classList.toggle('hidden', mode !== 'duo');
    ui.hudPlayer.textContent = 'Spieler ' + turn + ' · ' + ch.name;
    ui.hudPlayer.style.background = mode === 'duo' ? (turn === 1 ? '#ff9f00' : '#7a32ff') : '';
    $('hud-best').textContent = fmt(save.best);
    show(null);
  }

  // ---------- Comeback-Token: Wiederbelebung nach einem Crash ----------
  const canBuyToken = () => save.tokens < REVIVE.max && save.taler >= REVIVE.price;

  // Nach dem Crash: Angebot zum Wiederbeleben, sonst direkt das Ende des Laufs
  function afterCrash() {
    const g = game;
    if (g.revives < REVIVE.perRun && (save.tokens > 0 || canBuyToken())) {
      g.state = 'revive';
      renderRevive();
      show('revive');
    } else {
      g.state = 'done';
      endRun();
    }
  }

  function renderRevive() {
    const g = game;
    $('revive-left').textContent = `Noch ${REVIVE.perRun - g.revives}× pro Lauf möglich`;
    $('revive-score').textContent = fmt(g.score);
    const has = save.tokens > 0;
    $('revive-have').textContent = `${REVIVE.icon} Token: ${save.tokens}`;
    const use = $('btn-revive-use');
    use.textContent = has ? `${REVIVE.icon} Token einsetzen & weiterlaufen` : `${REVIVE.icon} Token kaufen (${fmt(REVIVE.price)} 🪙) & weiterlaufen`;
    use.disabled = !has && !canBuyToken();
  }

  function reviveNow() {
    const g = game;
    if (!g || g.state !== 'revive') return;
    if (save.tokens > 0) save.tokens--;
    else if (canBuyToken()) save.taler -= REVIVE.price;
    else return;
    persist();
    g.revives++;
    // Gefahr in der Nähe wegräumen, kurz unverwundbar, dann geht's weiter
    for (const o of g.objects) {
      const info = TYPES[o.type];
      if (info && info.hit && o.z < 16 && o.z > -4) o.dead = true;
    }
    const p = g.player;
    p.jumpT = 0; p.h = 0; p.duckT = 0;
    g.boost.shield = Math.max(g.boost.shield, 3);
    g.crashKind = null;
    g.crashT = 0;
    g.state = 'run';
    touch = null;
    acc = 0;
    last = performance.now();
    show(null);
    fxText('COMEBACK!', '#7fd7ff', 36);
    burstConfetti(W / 2, H * 0.35, 60);
  }

  function giveUp() {
    if (!game || game.state !== 'revive') return;
    game.state = 'done';
    endRun();
  }

  function buyToken() {
    if (!canBuyToken()) return;
    save.taler -= REVIVE.price;
    save.tokens++;
    persist();
    renderStart();
    updateTalerLabels();
  }

  function endRun() {
    const g = game, ch = g.ch, s = g.score;
    const st = save.stats;
    st.runs++;
    st.totalCoins += g.coins;
    st.totalScarves += g.scarves;
    st.boosters += g.boostersGot;
    st.trophies += g.trophies;
    st.goalsScored += g.goals;
    st.jumps += g.jumps;
    st.ducks += g.ducks;
    st.iceMeters += Math.floor(g.iceMeters);
    st.bestScore = Math.max(st.bestScore, s);
    st.bestDistance = Math.max(st.bestDistance, Math.floor(g.dist));
    if (mode === 'duo' && turn === 2) st.duels++;

    const newBest = s > save.best;
    if (newBest) save.best = s;
    save.taler += g.taler;
    const levelBefore = charLevel(ch);
    const xpGain = Math.floor(s / 2);
    save.xp[ch.id] = (save.xp[ch.id] || 0) + xpGain;
    const levelAfter = charLevel(ch);
    const unlocked = checkUnlocks();
    persist();

    const notes = unlocked.map((c) => `🔓 Neu freigeschaltet: ${c.name}!`);
    if (levelAfter > levelBefore) notes.unshift(`⭐ ${ch.name} ist jetzt Level ${levelAfter}!`);
    const result = { score: s, dist: Math.floor(g.dist), taler: g.taler, goals: g.goals, ch };

    if (mode === 'solo') {
      $('over-title').textContent = g.crashText === 'ROTE KARTE!' ? 'Rote Karte!' : pick(['Abpfiff!', 'Autsch, Foul!', 'Ab in die Kabine!', 'Schiri, das war nix!']);
      $('over-score').textContent = fmt(s);
      $('over-new').hidden = !newBest;
      $('over-dist').textContent = fmt(g.dist);
      $('over-coins').textContent = fmt(g.taler);
      $('over-trophies').textContent = g.trophies;
      $('over-goals').textContent = g.goals;
      $('over-earn').textContent = `+${fmt(g.taler)} Arena-Taler · +${fmt(xpGain)} XP für ${ch.name}`;
      setNotes('over-unlocks', notes);
      const tip = save.settings.coach && g.crashKind ? COACH_TIPS.crash[g.crashKind] : '';
      $('over-coach').hidden = !tip;
      $('over-coach-text').textContent = tip || '';
      $('over-coach-name').textContent = `🧢 ${COACH.name}:`;
      show('over');
    } else if (turn === 1) {
      results[0] = result;
      pendingUnlocks = notes;
      $('handover-score').textContent = fmt(s);
      setNotes('handover-unlocks', notes);
      show('handover');
    } else {
      results[1] = result;
      showResult(pendingUnlocks.concat(notes));
    }
    game = newGame('menu', null);
  }

  function setNotes(id, notes) {
    $(id).innerHTML = notes.map((n) => `<div>${escapeHtml(n)}</div>`).join('');
  }

  function showResult(notes) {
    const [r1, r2] = results;
    for (const [i, r] of [[1, r1], [2, r2]]) {
      const box = $('result-box-' + i);
      box.innerHTML = `<canvas></canvas><span>Spieler ${i} · ${escapeHtml(r.ch.name)}</span><b>${fmt(r.score)}</b>`
        + `<small>${fmt(r.dist)} m · ${r.goals} Tore · ${fmt(r.taler)} Taler</small>`;
      renderPreview(box.querySelector('canvas'), r.ch, 64);
      const other = i === 1 ? r2 : r1;
      box.classList.toggle('win', r.score > other.score);
    }
    $('result-title').textContent = r1.score === r2.score ? 'Unentschieden!'
      : (r1.score > r2.score ? 'Spieler 1 gewinnt!' : 'Spieler 2 gewinnt!');
    setNotes('result-unlocks', notes);
    show('result');
    if (r1.score !== r2.score && game) burstConfetti(W / 2, H * 0.25, 80);
  }

  function pauseGame() {
    if (!game || game.state !== 'run') return;
    game.state = 'pause';
    show('pause');
  }
  function resumeGame() {
    if (!game || game.state !== 'pause') return;
    game.state = 'run';
    touch = null;
    acc = 0;
    last = performance.now();
    show(null);
  }

  // ---------- Oberfläche ----------
  const ui = {
    hud: $('hud'), hudPlayer: $('hud-player'), boosts: $('hud-boosts'),
    screens: {
      start: $('screen-start'), chars: $('screen-chars'), over: $('screen-over'),
      handover: $('screen-handover'), result: $('screen-result'), pause: $('screen-pause'), revive: $('screen-revive'),
    },
  };
  let currentScreen = 'start';

  function show(name) {
    currentScreen = name;
    for (const key in ui.screens) ui.screens[key].classList.toggle('hidden', key !== name);
    ui.hud.classList.toggle('hidden', name !== null && name !== 'pause');
    if (name === 'start') renderStart();
    if (name === 'handover') renderHandover();
    updateTalerLabels();
    const btn = name && ui.screens[name].querySelector('button.primary');
    if (btn) btn.focus({ preventScroll: true });
  }

  function updateTalerLabels() {
    for (const el of document.querySelectorAll('.taler')) el.textContent = fmt(save.taler);
  }

  let hudCache = {};
  function setText(el, key, val) {
    if (hudCache[key] !== val) { hudCache[key] = val; el.textContent = val; }
  }
  function updateHud() {
    const g = game;
    setText($('hud-score'), 'score', fmt(g.score));
    setText($('hud-taler'), 'taler', fmt(g.taler));
    setText($('hud-trophies'), 'trophies', String(g.trophies));
    const parts = [];
    for (const k in g.boost) if (g.boost[k] > 0) parts.push(`${BOOSTERS[k].icon} ${Math.ceil(g.boost[k])}`);
    if (g.fairplay) parts.push('🤝 Fairplay');
    if (save.tokens > 0) parts.push(`${REVIVE.icon} ×${save.tokens}`);
    const html = parts.map((p) => `<span>${p}</span>`).join('');
    if (hudCache.boosts !== html) { hudCache.boosts = html; ui.boosts.innerHTML = html; }
  }

  function renderPreview(cv, ch, size, skinId, locked) {
    const r = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = size * r;
    cv.height = size * r;
    cv.style.width = cv.style.height = size + 'px';
    const c = cv.getContext('2d');
    c.setTransform(r, 0, 0, r, 0, 0);
    c.clearRect(0, 0, size, size);
    c.translate(size / 2, size * 0.96);
    drawChar(c, size * 0.4, look(ch, skinId), { front: true });
    if (locked) {
      c.setTransform(r, 0, 0, r, 0, 0);
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(15,18,40,0.88)';
      c.fillRect(0, 0, size, size);
      c.globalCompositeOperation = 'source-over';
    }
  }

  function renderStart() {
    const ch = charById(save.selected[0]);
    renderPreview($('start-char'), ch, 84);
    $('start-char-name').textContent = ch.name;
    $('start-char-level').textContent = `Level ${charLevel(ch)} · ${ch.role}`;
    $('start-char-ability').textContent = `${ch.ability.name}: ${ch.ability.desc}`;
    $('start-best').textContent = fmt(save.best);
    $('start-tokens').textContent = save.tokens;
    $('btn-buy-token').textContent = save.tokens >= REVIVE.max ? 'voll' : `kaufen (${fmt(REVIVE.price)} 🪙)`;
    $('btn-buy-token').disabled = !canBuyToken();
    $('sponsor-line').innerHTML = 'Präsentiert von ' + SPONSORS.map((s) => `<b>${escapeHtml(s.name)}</b>`).join(' &amp; ');
    renderPuzzle();
  }

  function renderPuzzle() {
    const el = $('puzzle');
    el.innerHTML = '';
    for (let i = 0; i < PUZZLE_PIECES; i++) {
      const piece = document.createElement('i');
      piece.style.backgroundPosition = `${(i % 3) * 50}% ${Math.floor(i / 3) * 100}%`;
      if (!save.puzzle.includes(i)) piece.classList.add('missing');
      el.appendChild(piece);
    }
    $('puzzle-count').textContent = `${save.puzzle.length}/${PUZZLE_PIECES}`;
  }

  function renderHandover() {
    const ch = charById(save.selected[1]);
    renderPreview($('p2-char'), ch, 84);
    $('p2-char-name').textContent = ch.name;
    $('p2-char-ability').textContent = `${ch.ability.name}: ${ch.ability.desc}`;
  }

  // ----- Charaktermenü -----
  let charsSlot = 0, charsReturn = 'start', viewId = 'luis';

  function openChars(slot, ret) {
    charsSlot = slot;
    charsReturn = ret;
    viewId = save.selected[slot];
    $('char-msg').textContent = '';
    renderChars();
    show('chars');
  }

  function renderChars() {
    const slotEl = $('chars-slot');
    slotEl.textContent = charsSlot === 1 ? 'Auswahl für Spieler 2' : '';
    slotEl.classList.toggle('hidden', charsSlot !== 1);

    const grid = $('char-grid');
    grid.innerHTML = '';
    for (const ch of CHARACTERS) {
      const locked = !isUnlocked(ch);
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = ch.id;
      b.className = 'char-btn' + (ch.id === viewId ? ' viewing' : '') + (locked ? ' locked' : '')
        + (ch.starter ? ' starter' : '') + (save.selected[charsSlot] === ch.id ? ' chosen' : '');
      b.setAttribute('aria-label', ch.name + (locked ? ' (gesperrt)' : ''));
      const cv = document.createElement('canvas');
      const label = document.createElement('span');
      label.textContent = locked ? '🔒 ' + ch.name.split(' ')[0] : ch.name.split(' ')[0];
      b.append(cv, label);
      grid.appendChild(b);
      renderPreview(cv, ch, 52, null, locked);
    }

    const ch = charById(viewId);
    const locked = !isUnlocked(ch);
    const L = charLevel(ch), xp = save.xp[ch.id] || 0;
    const xpPct = L >= 10 ? 100 : Math.round(((xp - xpFor(L)) / (xpFor(L + 1) - xpFor(L))) * 100);
    let html = `<div class="detail-top"><canvas id="detail-cv"></canvas><div>`
      + `<h3>${escapeHtml(ch.name)} <span class="tag ${ch.starter ? 'start' : 'special'}">${ch.starter ? 'Start' : 'Spezial'}</span></h3>`
      + `<div class="level">${escapeHtml(ch.role)} · Level ${L} · ${fmt(xp)} XP</div><div class="xpbar"><i style="width:${xpPct}%"></i></div>`
      + `<p class="ability"><b>${escapeHtml(ch.ability.name)}:</b> ${escapeHtml(ch.ability.desc)}</p></div></div>`;

    html += '<div class="stats">';
    for (const st of STATS) {
      const base = ch.base[st.key], up = upLevel(ch, st.key);
      const bar = Array.from({ length: 10 }, (_, i) => `<i class="${i < base ? 'base' : i < base + up ? 'up' : ''}"></i>`).join('');
      let btn;
      if (up >= MAX_UPGRADE) btn = '<span class="max">MAX</span>';
      else {
        const cost = UPGRADE_COSTS[up];
        btn = `<button type="button" data-up="${st.key}" ${locked || save.taler < cost ? 'disabled' : ''}>⬆ ${fmt(cost)} Taler</button>`;
      }
      html += `<div class="stat"><span class="stat-name">${st.name} <small>${base + up}/10</small></span><div class="bar">${bar}</div><div class="up-btns">${btn}</div></div>`;
    }
    html += '</div>';

    html += '<div class="skins"><div class="skins-title">Skins</div><div class="skin-row">';
    for (const sk of skinsFor(ch)) {
      const owned = ownsSkin(ch, sk.id), active = activeSkin(ch) === sk.id;
      const label = active ? 'aktiv' : owned ? 'anziehen' : `${fmt(sk.price)} Taler`;
      const dis = locked || (!owned && save.taler < sk.price) ? 'disabled' : '';
      html += `<button type="button" class="skin-btn${active ? ' active' : ''}" data-skin="${sk.id}" ${dis}><canvas data-skin-cv="${sk.id}"></canvas><span>${sk.name}</span><small>${label}</small></button>`;
    }
    html += '</div></div>';

    if (locked) {
      const v = statValue(ch.goal.stat);
      const pct = Math.min(100, Math.round((v / ch.goal.value) * 100));
      html += `<div class="goal"><p>🔒 <b>Freischalten:</b> ${escapeHtml(ch.goal.text)}</p>`
        + `<div class="progress"><i style="width:${pct}%"></i></div><small>${fmt(Math.min(v, ch.goal.value))} / ${fmt(ch.goal.value)}</small>`
        + `<button type="button" data-buy="1" ${save.taler < ch.price ? 'disabled' : ''}>Oder sofort für ${fmt(ch.price)} Arena-Taler</button></div>`;
    }

    const detail = $('char-detail');
    detail.innerHTML = html;
    renderPreview($('detail-cv'), ch, 96, null, locked);
    for (const cv of detail.querySelectorAll('[data-skin-cv]')) renderPreview(cv, ch, 44, cv.dataset.skinCv, locked);

    const sel = $('btn-char-select');
    const isChosen = save.selected[charsSlot] === ch.id;
    sel.disabled = locked || isChosen;
    sel.textContent = locked ? 'Noch gesperrt' : isChosen ? 'Ausgewählt ✓' : `${ch.name} auswählen`;
    updateTalerLabels();
  }

  $('char-grid').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    viewId = b.dataset.id;
    $('char-msg').textContent = '';
    renderChars();
  });

  $('char-detail').addEventListener('click', (e) => {
    const ch = charById(viewId);
    const upBtn = e.target.closest('[data-up]');
    const skinBtn = e.target.closest('[data-skin]');
    const buyBtn = e.target.closest('[data-buy]');
    const msg = $('char-msg');
    if (upBtn && !upBtn.disabled) {
      const key = upBtn.dataset.up, lvl = upLevel(ch, key), cost = UPGRADE_COSTS[lvl];
      if (lvl >= MAX_UPGRADE || save.taler < cost) return;
      save.taler -= cost;
      (save.upgrades[ch.id] = save.upgrades[ch.id] || {})[key] = lvl + 1;
      persist();
      msg.textContent = `${STATS.find((s) => s.key === key).name} verbessert!`;
      renderChars();
    } else if (skinBtn && !skinBtn.disabled) {
      const id = skinBtn.dataset.skin, sk = skinsFor(ch).find((s) => s.id === id), st = skinState(ch);
      if (!st.owned.includes(id)) {
        if (save.taler < sk.price) return;
        save.taler -= sk.price;
        st.owned.push(id);
        msg.textContent = `Skin „${sk.name}“ gekauft!`;
      } else {
        msg.textContent = `Skin „${sk.name}“ angezogen.`;
      }
      st.active = id;
      persist();
      renderChars();
    } else if (buyBtn && !buyBtn.disabled) {
      if (save.taler < ch.price || isUnlocked(ch)) return;
      save.taler -= ch.price;
      save.unlocked.push(ch.id);
      checkUnlocks();
      persist();
      msg.textContent = `${ch.name} freigeschaltet!`;
      renderChars();
    }
  });

  $('btn-char-select').addEventListener('click', () => {
    const ch = charById(viewId);
    if (!isUnlocked(ch)) return;
    save.selected[charsSlot] = ch.id;
    persist();
    show(charsReturn);
  });
  $('btn-chars-back').addEventListener('click', () => show(charsReturn));

  $('btn-solo').addEventListener('click', () => startMatch('solo'));
  $('btn-duo').addEventListener('click', () => startMatch('duo'));
  $('btn-chars').addEventListener('click', () => openChars(0, 'start'));
  $('btn-restart').addEventListener('click', () => startMatch('solo'));
  $('btn-over-chars').addEventListener('click', () => openChars(0, 'start'));
  $('btn-over-menu').addEventListener('click', () => show('start'));
  $('btn-p2-chars').addEventListener('click', () => openChars(1, 'handover'));
  $('btn-p2').addEventListener('click', () => { turn = 2; startRun(); });
  $('btn-rematch').addEventListener('click', () => startMatch('duo'));
  $('btn-result-menu').addEventListener('click', () => show('start'));
  $('btn-revive-use').addEventListener('click', reviveNow);
  $('btn-revive-quit').addEventListener('click', giveUp);
  $('btn-buy-token').addEventListener('click', buyToken);
  $('btn-pause').addEventListener('click', pauseGame);
  $('btn-resume').addEventListener('click', resumeGame);
  $('btn-quit').addEventListener('click', () => { game = newGame('menu', null); show('start'); });
  const coachToggle = $('opt-coach');
  coachToggle.checked = save.settings.coach;
  coachToggle.addEventListener('change', () => { save.settings.coach = coachToggle.checked; persist(); });

  function refreshUi() {
    if (currentScreen === 'start') renderStart();
    else if (currentScreen === 'chars') renderChars();
    else if (currentScreen === 'handover') renderHandover();
  }

  // ---------- Zeichen-Grundformen ----------
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function ell(c, x, y, rx, ry) {
    c.beginPath();
    c.ellipse(x, y, Math.max(rx, 0.1), Math.max(ry, 0.1), 0, 0, Math.PI * 2);
  }
  function fs(c, fill, lw) {
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (lw) { c.lineWidth = lw; c.strokeStyle = OUTLINE; c.stroke(); }
  }
  function comicText(c, text, x, y, size, fill, maxW) {
    c.font = `900 ${size}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = Math.max(2, size * 0.2);
    c.strokeStyle = OUTLINE;
    c.strokeText(text, x, y, maxW);
    c.fillStyle = fill;
    c.fillText(text, x, y, maxW);
  }

  // ---------- Charaktere zeichnen ----------
  // Füße bei (0,0), Größe u. front = Ansicht von vorn (Menü), sonst von hinten (im Lauf).
  function drawChar(c, u, ch, o = {}) {
    const img = images[ch.id];
    if (img) {
      const h = u * 2.1, w = (h * img.width) / img.height;
      c.drawImage(img, -w / 2, -h + (o.bob || 0), w, h);
      return;
    }
    const front = !!o.front, run = o.run || 0, bw = ch.build || 1;
    const rx = u * 0.5 * bw, ry = u * 0.6, cy = -u * 0.98;
    const lw = Math.max(1, u * 0.07);
    const col = ch.jersey.colors;
    c.lineJoin = 'round';
    c.lineCap = 'round';

    if (ch.extra === 'stick' && !front) drawStick(c, u, rx, cy, run, 1);
    if (ch.style === 'ponytail' && front) { ell(c, rx * 0.85, cy - ry * 0.55, u * 0.1, u * 0.24); fs(c, ch.hair, lw); }

    // Beine mit Stutzen und Schuhen
    for (const s of [-1, 1]) {
      const lift = (s < 0 ? run : -run) * u * 0.08;
      const lx = s * u * 0.2 * bw;
      rr(c, lx - u * 0.09, -u * 0.44 - lift, u * 0.18, u * 0.38, u * 0.07);
      fs(c, ch.skin, lw);
      rr(c, lx - u * 0.09, -u * 0.26 - lift, u * 0.18, u * 0.2, u * 0.05);
      fs(c, col[0] === '#141414' ? '#141414' : '#ffffff', lw);
      c.fillStyle = col[1];
      c.fillRect(lx - u * 0.085, -u * 0.25 - lift, u * 0.17, u * 0.04);
      if (o.springs) {
        c.strokeStyle = '#c9ccd6';
        c.lineWidth = u * 0.04;
        c.beginPath();
        for (let k = 0; k <= 4; k++) c.lineTo(lx + (k % 2 ? u * 0.08 : -u * 0.08), -lift + k * u * 0.05);
        c.stroke();
      }
      ell(c, lx, -u * 0.05 - lift + (o.springs ? u * 0.2 : 0), u * 0.15, u * 0.08);
      fs(c, '#f5f5f5', lw);
      c.fillStyle = col.length > 1 ? col[1] : '#00a650';
      c.fillRect(lx - u * 0.1, -u * 0.07 - lift + (o.springs ? u * 0.2 : 0), u * 0.2, u * 0.03);
    }

    // Arme
    for (const s of [-1, 1]) {
      const sw = (s < 0 ? -run : run) * u * 0.09;
      ell(c, s * (rx + u * 0.05), cy + u * 0.16 + sw, u * 0.11, u * 0.14);
      fs(c, ch.gloves || ch.skin, lw);
    }

    // Körper (Kopf und Rumpf als eine Comic-Form)
    c.save();
    ell(c, 0, cy, rx, ry);
    c.fillStyle = ch.skin;
    c.fill();
    c.clip();
    drawJersey(c, u, ch, rx, ry, cy);
    // Comic-Schatten an der Seite
    c.fillStyle = 'rgba(0,0,0,0.12)';
    ell(c, rx * 0.75, cy, rx * 0.5, ry * 1.1);
    c.fill();
    c.restore();
    ell(c, 0, cy, rx, ry);
    fs(c, null, lw);

    if (front) drawFace(c, u, ch, cy, rx, lw);
    else drawBackPrint(c, u, ch, cy, ry);
    drawHair(c, u, ch, cy, rx, ry, front, run, lw);

    if (ch.extra === 'stick' && front) drawStick(c, u, rx, cy, run, -1);
    if (ch.extra === 'chain') {
      c.strokeStyle = '#f5c518';
      c.lineWidth = u * 0.05;
      c.beginPath();
      c.arc(0, cy + ry * 0.05, rx * 0.55, 0.2 * Math.PI, 0.8 * Math.PI);
      c.stroke();
      if (front) comicText(c, '$', 0, cy + ry * 0.62, u * 0.22, '#f5c518');
    }
    if (ch.extra === 'megaphone') {
      c.save();
      c.translate(rx + u * 0.12, cy + u * 0.05);
      c.rotate(-0.6);
      c.beginPath();
      c.moveTo(0, -u * 0.06); c.lineTo(u * 0.32, -u * 0.18); c.lineTo(u * 0.32, u * 0.18); c.lineTo(0, u * 0.06);
      c.closePath();
      fs(c, '#ffffff', lw);
      c.fillStyle = '#d63031';
      c.fillRect(u * 0.26, -u * 0.16, u * 0.06, u * 0.32);
      c.restore();
    }
    if (ch.extra === 'headphones') {
      c.strokeStyle = OUTLINE;
      c.lineWidth = u * 0.07;
      c.beginPath();
      c.arc(0, cy - ry * 0.25, rx * 0.95, Math.PI * 1.05, Math.PI * 1.95);
      c.stroke();
      for (const s of [-1, 1]) { rr(c, s * rx - u * 0.1, cy - ry * 0.35, u * 0.2, u * 0.28, u * 0.08); fs(c, '#7a32ff', lw); }
    }
    if (ch.extra === 'whistle') {
      // Trillerpfeife an einem Band
      c.strokeStyle = '#d63031';
      c.lineWidth = u * 0.035;
      c.beginPath(); c.moveTo(-rx * 0.45, cy + ry * 0.14); c.quadraticCurveTo(0, cy + ry * 0.55, rx * 0.15, cy + ry * 0.4); c.stroke();
      rr(c, rx * 0.08, cy + ry * 0.36, u * 0.2, u * 0.11, u * 0.05);
      fs(c, '#c9ccd6', lw * 0.7);
    }
  }

  // Trainer-Sprechblase unten links (ruhig ein- und ausgeblendet, ohne Wackeln)
  function wrapLines(text, maxW, maxLines) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      const rest = lines.slice(maxLines - 1).join(' ');
      lines.length = maxLines - 1;
      lines.push(rest);
    }
    return lines;
  }

  function drawCoach() {
    const c = game.coach;
    if (!c || c.t <= 0 || !save.settings.coach || game.state === 'menu') return;
    const alpha = Math.min(1, c.t * 3, (COACH_SHOW - c.t) * 6);
    const size = 58, x = 10, y = H - size - 14;
    const bx = x + size + 10, bw = Math.min(W - bx - 10, 360), fontSize = W < 360 ? 13 : 14;
    ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
    if (!c.lines || c.linesW !== bw) { c.lines = wrapLines(c.text, bw - 22, 3); c.linesW = bw; }
    const bh = Math.max(size, 26 + c.lines.length * (fontSize + 4));
    const by = y + size - bh;
    ctx.save();
    ctx.globalAlpha = alpha;
    // Porträt
    ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.save();
    ctx.beginPath(); ctx.arc(x + size / 2, y + size / 2, size / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.translate(x + size / 2, y + size + 16);
    drawChar(ctx, 30, COACH.look, { front: true });
    ctx.restore();
    // Sprechblase mit Spitze zum Trainer
    rr(ctx, bx, by, bw, bh, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + 1, y + size - 30); ctx.lineTo(bx - 10, y + size - 18); ctx.lineTo(bx + 1, y + size - 14); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fill();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.font = `800 11px system-ui, sans-serif`;
    ctx.fillStyle = '#00a650';
    ctx.fillText(COACH.name.toUpperCase() + ' RUFT:', bx + 11, by + 8);
    ctx.font = `800 ${fontSize}px system-ui, sans-serif`;
    ctx.fillStyle = '#1b1530';
    c.lines.forEach((l, i) => ctx.fillText(l, bx + 11, by + 23 + i * (fontSize + 4)));
    ctx.restore();
  }

  // Luis' Hockeyschläger (schwarz mit gelbem Tape)
  function drawStick(c, u, rx, cy, run, side) {
    const hx = side * (rx + u * 0.05), hy = cy + u * 0.18;
    c.lineCap = 'round';
    c.strokeStyle = OUTLINE;
    c.lineWidth = u * 0.13;
    c.beginPath(); c.moveTo(hx, hy - u * 0.25); c.lineTo(hx + side * u * 0.3, -u * 0.08); c.stroke();
    c.strokeStyle = '#1b1b1b';
    c.lineWidth = u * 0.07;
    c.beginPath(); c.moveTo(hx, hy - u * 0.25); c.lineTo(hx + side * u * 0.3, -u * 0.08); c.stroke();
    c.strokeStyle = '#ffd000';
    c.lineWidth = u * 0.03;
    c.beginPath(); c.moveTo(hx + side * u * 0.08, hy - u * 0.1); c.lineTo(hx + side * u * 0.14, hy); c.stroke();
    rr(c, hx + side * u * 0.3 - (side > 0 ? 0 : u * 0.34), -u * 0.12, u * 0.34, u * 0.1, u * 0.04);
    fs(c, '#e8e8e8', u * 0.05);
  }

  function drawJersey(c, u, ch, rx, ry, cy) {
    const jt = cy + ry * 0.14, jb = cy + ry, jh = jb - jt;
    const [a, b, d = a, e = b] = ch.jersey.colors;
    c.fillStyle = a;
    c.fillRect(-rx, jt, rx * 2, jh);
    switch (ch.jersey.pattern) {
      case 'stripes': {
        const n = 7, w = (rx * 2) / n;
        for (let i = 1; i < n; i += 2) { c.fillStyle = i % 4 === 1 ? b : d; c.fillRect(-rx + i * w, jt, w, jh); }
        break;
      }
      case 'hoops': {
        const n = 4, h = jh / n;
        for (let i = 1; i < n; i += 2) { c.fillStyle = i % 4 === 1 ? b : d; c.fillRect(-rx, jt + i * h, rx * 2, h); }
        break;
      }
      case 'half': c.fillStyle = b; c.fillRect(0, jt, rx, jh); break;
      case 'sash':
        c.save();
        c.translate(0, jt + jh / 2);
        c.rotate(-0.6);
        c.fillStyle = b; c.fillRect(-rx * 2, -jh * 0.17, rx * 4, jh * 0.34);
        if (d !== a) { c.fillStyle = d; c.fillRect(-rx * 2, -jh * 0.05, rx * 4, jh * 0.1); }
        c.restore();
        break;
      case 'chevron':
        c.fillStyle = b;
        c.beginPath();
        c.moveTo(-rx, jt + jh * 0.1); c.lineTo(0, jt + jh * 0.5); c.lineTo(rx, jt + jh * 0.1);
        c.lineTo(rx, jt + jh * 0.35); c.lineTo(0, jt + jh * 0.75); c.lineTo(-rx, jt + jh * 0.35);
        c.closePath(); c.fill();
        break;
      case 'checker': {
        const s = rx * 0.4;
        for (let ix = 0; ix * s < rx * 2; ix++) for (let iy = 0; iy * s < jh; iy++) {
          if ((ix + iy) % 2) { c.fillStyle = b; c.fillRect(-rx + ix * s, jt + iy * s, s, s); }
        }
        break;
      }
      case 'shoulders': c.fillStyle = b; c.fillRect(-rx, jt, rx * 2, jh * 0.3); break;
      case 'jacket':
        // Offene Jacke: goldene Schultern, weißes Shirt in der Mitte, goldene Reißverschlusskanten
        c.fillStyle = b; c.fillRect(-rx, jt, rx * 2, jh * 0.26);
        c.fillStyle = d; c.fillRect(-rx * 0.26, jt, rx * 0.52, jh);
        c.fillStyle = b; c.fillRect(-rx * 0.3, jt, rx * 0.06, jh); c.fillRect(rx * 0.24, jt, rx * 0.06, jh);
        c.fillStyle = d; c.fillRect(-rx, jt + jh * 0.5, rx * 0.12, jh * 0.5); c.fillRect(rx * 0.88, jt + jh * 0.5, rx * 0.12, jh * 0.5);
        break;
      case 'luis':
        // Weiß mit grünen V-Flächen, schwarzen Kanten und gelben Akzenten
        for (const s of [-1, 1]) {
          c.fillStyle = b;
          c.beginPath();
          c.moveTo(s * rx, jt); c.lineTo(s * rx * 0.18, jt); c.lineTo(s * rx * 0.5, jb); c.lineTo(s * rx, jb);
          c.closePath(); c.fill();
          c.strokeStyle = d; c.lineWidth = u * 0.06;
          c.beginPath(); c.moveTo(s * rx * 0.18, jt); c.lineTo(s * rx * 0.5, jb); c.stroke();
          c.strokeStyle = e; c.lineWidth = u * 0.025;
          c.beginPath(); c.moveTo(s * rx * 0.1, jt); c.lineTo(s * rx * 0.42, jb); c.stroke();
        }
        break;
      default: break;
    }
    // Hose
    c.fillStyle = ch.jersey.pattern === 'luis' ? '#141414'
      : ch.jersey.pattern === 'jacket' ? a : shade(b === '#ffffff' ? a : b, -0.35);
    c.fillRect(-rx, cy + ry * 0.78, rx * 2, ry * 0.3);
    // Kragen
    c.strokeStyle = OUTLINE;
    c.lineWidth = u * 0.05;
    c.beginPath(); c.moveTo(-rx, jt); c.lineTo(rx, jt); c.stroke();
  }

  function drawFace(c, u, ch, cy, rx, lw) {
    const ey = cy - u * 0.26, ex = u * 0.16;
    if (ch.shades) {
      // Sportliche, blau verspiegelte Sonnenbrille
      rr(c, -u * 0.36, ey - u * 0.1, u * 0.72, u * 0.2, u * 0.09);
      fs(c, '#141414', lw * 0.8);
      for (const s of [-1, 1]) {
        const grd = c.createLinearGradient(s * ex - u * 0.12, ey - u * 0.08, s * ex + u * 0.12, ey + u * 0.08);
        grd.addColorStop(0, '#7fe0ff');
        grd.addColorStop(0.5, ch.shades);
        grd.addColorStop(1, '#1440a0');
        rr(c, s * ex - u * 0.13, ey - u * 0.07, u * 0.26, u * 0.14, u * 0.06);
        c.fillStyle = grd; c.fill();
      }
      c.fillStyle = 'rgba(255,255,255,0.8)';
      c.fillRect(-ex - u * 0.08, ey - u * 0.05, u * 0.06, u * 0.02);
    } else {
      for (const s of [-1, 1]) {
        ell(c, s * ex, ey, u * 0.11, u * 0.13); fs(c, '#ffffff', lw * 0.6);
        ell(c, s * ex + u * 0.02, ey + u * 0.02, u * 0.06, u * 0.07); fs(c, '#1b1530');
        ell(c, s * ex + u * 0.04, ey - u * 0.01, u * 0.02, u * 0.02); fs(c, '#ffffff');
      }
      if (ch.style === 'goggles') {
        for (const s of [-1, 1]) { ell(c, s * ex, ey - u * 0.22, u * 0.1, u * 0.07); fs(c, '#7fe0ff', lw * 0.6); }
      }
    }
    if (ch.brows || ch.shades) {
      c.strokeStyle = OUTLINE;
      c.lineWidth = u * 0.045;
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(s * (ex + u * 0.1), ey - u * 0.16); c.lineTo(s * (ex - u * 0.08), ey - u * 0.13); c.stroke();
      }
    }
    // Wangen
    c.fillStyle = 'rgba(255,110,110,0.25)';
    for (const s of [-1, 1]) { ell(c, s * u * 0.28, cy - u * 0.08, u * 0.07, u * 0.045); c.fill(); }
    // Mund
    const my = cy - u * 0.05;
    c.strokeStyle = OUTLINE;
    c.lineWidth = u * 0.045;
    switch (ch.mouth) {
      case 'grin':
      case 'tongue':
        c.beginPath(); c.moveTo(-u * 0.13, my - u * 0.02); c.quadraticCurveTo(0, my + u * 0.14, u * 0.13, my - u * 0.02); c.closePath();
        fs(c, '#5a1a1a', u * 0.035);
        c.fillStyle = '#ffffff'; c.fillRect(-u * 0.09, my - u * 0.015, u * 0.18, u * 0.03);
        if (ch.mouth === 'tongue') { ell(c, u * 0.03, my + u * 0.06, u * 0.05, u * 0.035); fs(c, '#ff7b9c'); }
        break;
      case 'open': ell(c, 0, my + u * 0.02, u * 0.06, u * 0.07); fs(c, '#5a1a1a', u * 0.035); break;
      case 'smirk':
        c.beginPath(); c.moveTo(-u * 0.1, my + u * 0.02); c.quadraticCurveTo(u * 0.02, my + u * 0.08, u * 0.13, my - u * 0.03); c.stroke();
        break;
      default:
        c.beginPath(); c.arc(0, my - u * 0.04, u * 0.1, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
    }
  }

  function drawBackPrint(c, u, ch, cy, ry) {
    const jt = cy + ry * 0.14;
    comicText(c, ch.name.split(' ')[0].toUpperCase(), 0, jt + ry * 0.16, u * 0.13, '#ffffff', u * 0.8);
    comicText(c, ch.num, 0, jt + ry * 0.5, u * 0.32, '#ffffff');
    if (ch.shades) {
      // Brillenbügel von hinten
      c.strokeStyle = '#141414';
      c.lineWidth = u * 0.05;
      c.beginPath(); c.moveTo(-u * 0.46, cy - u * 0.26); c.quadraticCurveTo(0, cy - u * 0.2, u * 0.46, cy - u * 0.26); c.stroke();
    }
  }

  function drawHair(c, u, ch, cy, rx, ry, front, run, lw) {
    const top = cy - ry;
    c.fillStyle = ch.hair;
    switch (ch.style) {
      case 'short': {
        // Kurze, wuschelige hellbraune Haare
        c.beginPath();
        c.moveTo(-rx * 0.98, top + ry * 0.62);
        c.quadraticCurveTo(-rx * 1.05, top - u * 0.05, 0, top - u * 0.06);
        c.quadraticCurveTo(rx * 1.05, top - u * 0.05, rx * 0.98, top + ry * 0.62);
        if (front) {
          for (let i = 6; i >= 0; i--) {
            const x = -rx * 0.85 + (i / 6) * rx * 1.7;
            c.lineTo(x + rx * 0.12, top + ry * (0.42 + (i % 2) * 0.12));
            c.lineTo(x, top + ry * 0.35);
          }
        } else {
          c.quadraticCurveTo(0, top + ry * 0.9, -rx * 0.98, top + ry * 0.62);
        }
        c.closePath();
        fs(c, ch.hair, lw);
        c.strokeStyle = shade(ch.hair, 0.3);
        c.lineWidth = u * 0.03;
        for (let i = -2; i <= 2; i++) {
          c.beginPath(); c.moveTo(i * u * 0.12, top + u * 0.02); c.lineTo(i * u * 0.14 + u * 0.04, top + u * 0.14); c.stroke();
        }
        break;
      }
      case 'cap':
      case 'tophat': {
        c.beginPath(); c.ellipse(0, top + ry * 0.4, rx * 0.98, ry * 0.45, 0, Math.PI, 0); c.closePath();
        fs(c, ch.style === 'tophat' ? ch.hair : ch.cap, lw);
        if (ch.style === 'tophat') {
          rr(c, -rx * 0.62, top - u * 0.5, rx * 1.24, u * 0.6, u * 0.04); fs(c, ch.cap, lw);
          c.fillStyle = '#f5c518'; c.fillRect(-rx * 0.6, top - u * 0.02, rx * 1.2, u * 0.08);
          ell(c, 0, top + u * 0.1, rx * 0.95, u * 0.08); fs(c, ch.cap, lw);
        } else if (front) {
          ell(c, 0, top + ry * 0.4, rx * 0.8, u * 0.08); fs(c, shade(ch.cap, -0.2), lw);
        } else {
          c.fillStyle = ch.skin; c.fillRect(-u * 0.07, top + ry * 0.25, u * 0.14, u * 0.07);
        }
        break;
      }
      case 'helmet':
        c.beginPath(); c.ellipse(0, top + ry * 0.5, rx * 1.03, ry * 0.6, 0, Math.PI, 0); c.closePath();
        fs(c, ch.helmet, lw);
        c.fillStyle = shade(ch.helmet, 0.4); c.fillRect(-u * 0.04, top + u * 0.02, u * 0.08, ry * 0.45);
        if (front) {
          c.strokeStyle = '#9aa0a8'; c.lineWidth = u * 0.03;
          for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * u * 0.1, cy - u * 0.38); c.lineTo(i * u * 0.1, cy + u * 0.05); c.stroke(); }
          c.beginPath(); c.moveTo(-u * 0.25, cy - u * 0.15); c.lineTo(u * 0.25, cy - u * 0.15); c.stroke();
        }
        break;
      case 'bun':
      case 'ponytail':
      case 'braids':
        c.beginPath(); c.ellipse(0, top + ry * 0.35, rx * 0.95, ry * 0.42, 0, Math.PI, 0); c.closePath();
        fs(c, ch.hair, lw);
        if (ch.style === 'bun') { ell(c, 0, top - u * 0.08, u * 0.14, u * 0.12); fs(c, ch.hair, lw); }
        if (ch.style === 'ponytail' && !front) { rr(c, -u * 0.08, top + u * 0.1, u * 0.16, u * 0.5 + run * u * 0.04, u * 0.08); fs(c, ch.hair, lw); }
        if (ch.style === 'braids') for (const s of [-1, 1]) { ell(c, s * rx * 1.02, top + ry * 0.6, u * 0.08, u * 0.18); fs(c, ch.hair, lw); }
        break;
      case 'bald':
        c.fillStyle = 'rgba(255,255,255,0.45)'; ell(c, -rx * 0.35, top + u * 0.12, u * 0.1, u * 0.05); c.fill();
        rr(c, -rx * 0.97, top + ry * 0.32, rx * 1.94, u * 0.1, u * 0.04); fs(c, ch.band, lw * 0.7);
        break;
      case 'mohawk':
        c.beginPath();
        c.moveTo(-u * 0.08, top + u * 0.2);
        for (let i = 0; i < 4; i++) { c.lineTo(-u * 0.06 + i * u * 0.04, top - u * 0.16 + (i % 2) * u * 0.06); }
        c.lineTo(u * 0.08, top + u * 0.2); c.closePath();
        fs(c, ch.hair, lw);
        break;
      case 'clown':
        for (const s of [-1, 1]) {
          for (let k = 0; k < 3; k++) { ell(c, s * (rx * 0.9 + k * u * 0.05), top + ry * 0.3 + k * u * 0.1, u * 0.14, u * 0.12); fs(c, s < 0 ? ch.hair : ch.hair2, lw); }
        }
        break;
      case 'beanie':
        c.beginPath(); c.ellipse(0, top + ry * 0.42, rx * 0.98, ry * 0.5, 0, Math.PI, 0); c.closePath();
        fs(c, ch.cap, lw);
        rr(c, -rx * 0.98, top + ry * 0.3, rx * 1.96, u * 0.12, u * 0.04); fs(c, '#ffffff', lw * 0.7);
        ell(c, 0, top - u * 0.06, u * 0.1, u * 0.1); fs(c, '#ffffff', lw);
        break;
      case 'goggles':
        c.beginPath(); c.ellipse(0, top + ry * 0.3, rx * 0.9, ry * 0.36, 0, Math.PI, 0); c.closePath();
        fs(c, ch.hair, lw);
        c.fillStyle = '#ff6a00'; c.fillRect(-rx, top + ry * 0.36, rx * 2, u * 0.06);
        break;
      case 'bucket':
        c.beginPath();
        c.moveTo(-rx * 0.7, top + ry * 0.3); c.lineTo(-rx * 0.55, top - u * 0.12); c.lineTo(rx * 0.55, top - u * 0.12); c.lineTo(rx * 0.7, top + ry * 0.3);
        c.closePath(); fs(c, ch.cap, lw);
        c.fillStyle = '#ffffff'; c.fillRect(-rx * 0.62, top + u * 0.04, rx * 1.24, u * 0.06);
        ell(c, 0, top + ry * 0.32, rx * 1.05, u * 0.08); fs(c, ch.cap, lw);
        break;
      case 'crown':
        c.beginPath();
        c.moveTo(-rx * 0.6, top + u * 0.12); c.lineTo(-rx * 0.6, top - u * 0.18); c.lineTo(-rx * 0.3, top - u * 0.02);
        c.lineTo(0, top - u * 0.24); c.lineTo(rx * 0.3, top - u * 0.02); c.lineTo(rx * 0.6, top - u * 0.18); c.lineTo(rx * 0.6, top + u * 0.12);
        c.closePath(); fs(c, '#f5c518', lw);
        ell(c, 0, top - u * 0.02, u * 0.04, u * 0.04); fs(c, '#e84393');
        break;
      default: break;
    }
  }

  // ---------- Stadion zeichnen ----------
  function poly(pts, fill) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.moveTo(pts[i][0], pts[i][1]);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }
  // Fläche zwischen zwei Querschnittpunkten über einen z-Bereich
  function strip(x1, y1, x2, y2, za, zb, fill) {
    poly([proj(x1, y1, za), proj(x2, y2, za), proj(x2, y2, zb), proj(x1, y1, zb)], fill);
  }
  const groundQuad = (x1, x2, za, zb, fill) => strip(x1, 0, x2, 0, za, zb, fill);
  function lineAcross(z, w, x1, x2, fill) {
    if (z + w < Z_NEAR || z - w > Z_FAR) return;
    groundQuad(x1, x2, Math.max(z - w / 2, Z_NEAR), z + w / 2, fill);
  }
  function lineAlong(x, w, za, zb, fill) {
    za = Math.max(za, Z_NEAR); zb = Math.min(zb, Z_FAR);
    if (zb <= za) return;
    groundQuad(x - w / 2, x + w / 2, za, zb, fill);
  }
  function groundRing(cx, cz, r, w, fill, a0 = 0, a1 = Math.PI * 2) {
    if (cz + r < Z_NEAR || cz - r > Z_FAR) return;
    const n = 30, outer = [], inner = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const ca = Math.cos(a), sa = Math.sin(a);
      outer.push(proj(cx + ca * (r + w / 2), 0, Math.max(cz + sa * (r + w / 2), Z_NEAR)));
      inner.push(proj(cx + ca * (r - w / 2), 0, Math.max(cz + sa * (r - w / 2), Z_NEAR)));
    }
    poly(outer.concat(inner.reverse()), fill);
  }
  function groundDisc(cx, cz, r, fill) {
    if (cz + r < Z_NEAR || cz - r > Z_FAR) return;
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(proj(cx + Math.cos(a) * r, 0, Math.max(cz + Math.sin(a) * r, Z_NEAR)));
    }
    poly(pts, fill);
  }
  function groundText(text, z, size, fill) {
    if (z < 0.5 || z > 50) return;
    const [x, y] = proj(0, 0, z);
    const s = sc(z);
    const squash = (gy(z - 0.5) - gy(z + 0.5)) / s;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, squash);
    ctx.font = `900 ${size * s}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fill;
    ctx.fillText(text, 0, 0, 3.3 * s);
    ctx.restore();
  }

  // Unbewegte Ebenen (Himmel, Licht, Dunst) werden einmal vorgezeichnet und danach nur noch kopiert.
  // Das spart pro Bild viel Rechenzeit, besonders auf Handys.
  const layerCache = new Map();
  function cachedLayer(key, w, h, scale, paint) {
    const id = `${key}|${W}x${H}@${dpr}`;
    let cv = layerCache.get(id);
    if (!cv) {
      if (layerCache.size > 16) layerCache.clear();
      cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * scale));
      cv.height = Math.max(1, Math.round(h * scale));
      const c = cv.getContext('2d');
      c.scale(scale, scale);
      paint(c);
      layerCache.set(id, cv);
    }
    return cv;
  }

  function drawSky(v) {
    ctx.fillStyle = v.sky[1];
    ctx.fillRect(0, 0, W, H);
    const h = HY + 40;
    ctx.drawImage(cachedLayer('sky-' + v.id, W, h, dpr, (c) => paintSky(c, v, h)), 0, 0, W, h);
  }

  function paintSky(c, v, h) {
    const grd = c.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, v.sky[0]);
    grd.addColorStop(1, v.sky[1]);
    c.fillStyle = grd;
    c.fillRect(0, 0, W, h);
    if (v.kind === 'football') {
      c.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 40; i++) {
        const n = hash(i * 977 + 13);
        c.fillRect((n % 1000) / 1000 * W, ((n >> 10) % 1000) / 1000 * HY * 0.7, 1.5, 1.5);
      }
    } else {
      // Hallendach mit Trägern, die zum Fluchtpunkt laufen
      c.strokeStyle = 'rgba(255,255,255,0.07)';
      c.lineWidth = 2;
      for (let i = -6; i <= 6; i++) {
        c.beginPath(); c.moveTo(W / 2 + i * W * 0.2, 0); c.lineTo(W / 2 + i * 6, HY - 10); c.stroke();
      }
      for (let k = 1; k < 5; k++) {
        const y = HY * (1 - 1 / (k + 0.6));
        c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
      }
      // Hängende Lampen
      c.fillStyle = 'rgba(255,250,220,0.9)';
      for (let i = -3; i <= 3; i++) {
        c.beginPath(); c.arc(W / 2 + i * W * 0.13, HY * 0.25, 3, 0, Math.PI * 2); c.fill();
      }
    }
  }

  function drawBackStand(v, spon, t) {
    const z = Z_FAR + 4;
    poly([proj(-9, 0, z), proj(9, 0, z), proj(9, 5, z), proj(-9, 5, z)], v.seats);
    // Fans auf der Gegentribüne als feine Punkte
    const s = sc(z);
    const [x0, y0] = proj(-9, 0, z);
    for (let row = 0; row < 9; row++) {
      for (let i = 0; i < 60; i++) {
        const h = hash(row * 131 + i * 17 + 7);
        if (h % 6 === 0) continue;
        const pal = v.fans[(i >> 3) % v.fans.length];
        ctx.fillStyle = pal[h % pal.length];
        const bounce = (h % 4 === 0) ? Math.max(0, Math.sin(t * 7 + i)) * s * 0.15 : 0;
        ctx.fillRect(x0 + (i + 0.2) * (18 / 60) * s, y0 - (row + 0.6) * (5 / 9) * s - bounce, s * 0.2, s * 0.3);
      }
    }
    // Anzeigetafel mit Stadionname und Werbepartner
    const [jx0, jy0] = proj(-6.5, 12.5, z);
    const [jx1, jy1] = proj(6.5, 6, z);
    ctx.fillStyle = '#111';
    ctx.fillRect(jx0 - 3, jy0 - 3, jx1 - jx0 + 6, jy1 - jy0 + 6);
    ctx.fillStyle = spon.bg;
    ctx.fillRect(jx0, jy0, jx1 - jx0, jy1 - jy0);
    const jw = jx1 - jx0, jh = jy1 - jy0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = spon.fg;
    ctx.font = `900 ${Math.max(6, jh * 0.3)}px ${FONT}`;
    ctx.fillText(Math.floor(t / 4) % 2 ? spon.name.toUpperCase() : v.name.toUpperCase(), jx0 + jw / 2, jy0 + jh * 0.38, jw * 0.92);
    ctx.font = `700 ${Math.max(5, jh * 0.2)}px system-ui, sans-serif`;
    ctx.fillText(game.state === 'run' || game.state === 'crash' ? `PUNKTE ${fmt(game.score)}` : 'ARENA RUSH', jx0 + jw / 2, jy0 + jh * 0.75, jw * 0.9);
  }

  // Tribüne seitlich: Sitzreihen mit sitzenden, jubelnden Fans
  const TIERS = 9;
  let FAN_DEPTH = 46;   // wie weit nach hinten einzelne Fans gezeichnet werden (wird bei langsamen Geräten verringert)
  function drawSideStand(v, t, side) {
    const units = game.units;
    const A = [2.5, 0.6], B = [7.0, 4.6];
    const zb = Z_FAR + 4;
    // Stirnwand
    strip(side * 2.5, 0, side * 2.5, A[1], Z_NEAR, zb, '#2c2f3a');
    // Sitzflächen-Schräge
    strip(side * A[0], A[1], side * B[0], B[1], Z_NEAR, zb, v.seats);
    // Treppenaufgänge
    const AISLE = 14;
    for (let n = Math.floor((units + Z_NEAR) / AISLE); n * AISLE - units < Z_FAR; n++) {
      const za = n * AISLE - units;
      if (za + 0.8 < Z_NEAR) continue;
      strip(side * A[0], A[1], side * B[0], B[1], Math.max(za, Z_NEAR), za + 0.8, '#9aa0ab');
    }
    // Reihenkanten
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let i = 1; i < TIERS; i++) {
      const k = i / TIERS;
      const x = side * lerp(A[0], B[0], k), y = lerp(A[1], B[1], k);
      const p0 = proj(x, y, Z_NEAR), p1 = proj(x, y, zb);
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    }
    // Fans (von oben nach unten und von hinten nach vorne, damit sich Figuren richtig überlappen)
    const SEAT = 0.55;
    for (let i = TIERS - 1; i >= 0; i--) {
      const k = (i + 0.5) / TIERS;
      const fx = side * lerp(A[0], B[0], k), fy = lerp(A[1], B[1], k);
      const off = i % 2 ? SEAT / 2 : 0;
      const kMax = Math.floor((units + FAN_DEPTH) / SEAT), kMin = Math.ceil((units + 0.8) / SEAT);
      for (let n = kMax; n >= kMin; n--) {
        const wz = n * SEAT + off;
        if (wz % AISLE < 1.0) continue;
        const z = wz - units;
        const h = hash(n * 37 + i * 101 + (side > 0 ? 7919 : 0));
        if (h % 9 === 0) continue;   // freie Plätze
        const s = sc(z);
        const px = W / 2 + (fx - camX) * s;
        if (px < -20 || px > W + 20) continue;
        const py = gy(z) - fy * s;
        const pal = v.fans[Math.floor(wz / AISLE) % v.fans.length];
        const shirt = pal[h % pal.length];
        drawFan(px, py, s, shirt, pal, h, wz, t);
      }
    }
    // Fahnen über mehrere Reihen
    for (let n = Math.floor(units / AISLE); n * AISLE - units < 46; n++) {
      if (hash(n * 53 + (side > 0 ? 3 : 1)) % 3) continue;
      const za = n * AISLE + 4 - units;
      if (za < 1) continue;
      const pal = v.fans[n % v.fans.length];
      const wave = Math.sin(t * 3 + n) * 0.15;
      for (let s2 = 0; s2 < pal.length; s2++) {
        const k0 = 0.35 + (s2 / pal.length) * 0.35, k1 = 0.35 + ((s2 + 1) / pal.length) * 0.35;
        poly([
          proj(side * lerp(A[0], B[0], k0), lerp(A[1], B[1], k0) + 0.3 + wave, za),
          proj(side * lerp(A[0], B[0], k1), lerp(A[1], B[1], k1) + 0.3 + wave, za),
          proj(side * lerp(A[0], B[0], k1), lerp(A[1], B[1], k1) + 0.3 - wave, za + 3.5),
          proj(side * lerp(A[0], B[0], k0), lerp(A[1], B[1], k0) + 0.3 - wave, za + 3.5),
        ], pal[s2]);
      }
    }
    // Rückwand und Dach
    strip(side * B[0], B[1], side * 7.3, 6.8, Z_NEAR, zb, shade(v.roof, 0.15));
    strip(side * 7.3, 6.8, side * 4.6, 7.8, Z_NEAR, zb, v.roof);
    // Flutlicht-Strahler an der Dachkante
    if (v.kind === 'football') {
      for (let n = Math.floor(units / 8); n * 8 - units < Z_FAR; n++) {
        const z = n * 8 - units;
        if (z < 0.5) continue;
        const [lx, ly] = proj(side * 4.7, 7.7, z);
        const s = sc(z);
        ctx.fillStyle = '#fffbe6';
        ctx.fillRect(lx - s * 0.3, ly - s * 0.08, s * 0.6, s * 0.16);
      }
    }
  }

  const FAN_SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
  // Sitzender Comic-Fan: Oberkörper, Kopf, manchmal Arme hoch oder Schal
  function drawFan(px, py, s, shirt, pal, h, wz, t) {
    const bw = s * 0.34, bh = s * 0.3;
    const skin = FAN_SKINS[(h >> 3) % FAN_SKINS.length];
    // Weit entfernte Fans: nur zwei kleine Rechtecke (spart viel Rechenzeit)
    if (bw < 3) {
      ctx.fillStyle = shirt; ctx.fillRect(px - bw / 2, py - bh, bw, bh);
      ctx.fillStyle = skin; ctx.fillRect(px - bw * 0.3, py - bh - s * 0.18, bw * 0.6, s * 0.16);
      return;
    }
    const ola = Math.sin(wz * 0.22 - t * 3.2) > 0.88;          // La-Ola-Welle
    const cheer = ola || (h % 5 === 0 && Math.sin(t * 6 + (h % 40)) > 0.4);
    const lift = cheer ? s * 0.1 : 0;
    const y = py - lift;
    ctx.fillStyle = shirt;
    // Arme
    if (cheer) {
      ctx.fillRect(px - bw * 0.55, y - bh * 1.7, bw * 0.18, bh * 1.0);
      ctx.fillRect(px + bw * 0.37, y - bh * 1.7, bw * 0.18, bh * 1.0);
    }
    // Oberkörper
    ctx.fillRect(px - bw / 2, y - bh, bw, bh);
    // Kopf (runde Formen nur bei nahen Fans, wo man sie auch sieht)
    const hr = s * 0.11, hy = y - bh - s * 0.1;
    const hairCol = h % 3 === 0 ? pal[(h >> 5) % pal.length] : '#3b2a1e';
    if (bw > 7) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(px + bw * 0.2, y - bh, bw * 0.3, bh);
      ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(px, hy, hr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = hairCol; ctx.beginPath(); ctx.arc(px, hy - s * 0.02, hr, Math.PI, 0); ctx.fill();
    } else {
      ctx.fillStyle = skin; ctx.fillRect(px - hr, hy - hr, hr * 2, hr * 2);
      ctx.fillStyle = hairCol; ctx.fillRect(px - hr, hy - hr, hr * 2, hr * 0.8);
    }
    // Hochgehaltener Fan-Schal
    if (h % 7 === 1 && bw > 4) {
      const sw = bw * 1.6, sy = y - bh - s * 0.32;
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = pal[k % pal.length];
        ctx.fillRect(px - sw / 2 + (k * sw) / 4, sy, sw / 4 + 0.5, s * 0.07);
      }
    }
  }

  // Werbebanden mit LED-Flächen (Werbepartner wechseln alle paar Sekunden)
  const BOARD_X = 2.15, BOARD_H = 0.55, PANEL = 7;
  function drawBoards(v, t, side) {
    const units = game.units;
    const x = side * BOARD_X;
    const contents = SPONSORS.concat([{ name: 'ARENA RUSH', bg: '#0b1640', fg: '#ffd23f' }]);
    for (let n = Math.floor((units + Z_NEAR) / PANEL); n * PANEL - units < Z_FAR; n++) {
      const za = Math.max(n * PANEL - units, Z_NEAR), zb = Math.min((n + 1) * PANEL - units, Z_FAR);
      if (zb <= za) continue;
      const item = contents[((n + Math.floor(t / 3)) % contents.length + contents.length) % contents.length];
      const kick = v.kind === 'ice' ? '#ffd000' : shade(item.bg, -0.3);
      poly([proj(x, 0, za), proj(x, BOARD_H, za), proj(x, BOARD_H, zb), proj(x, 0, zb)], item.bg);
      poly([proj(x, 0, za), proj(x, 0.1, za), proj(x, 0.1, zb), proj(x, 0, zb)], kick);
      // Oberkante
      poly([proj(x, BOARD_H, za), proj(x + side * 0.12, BOARD_H, za), proj(x + side * 0.12, BOARD_H, zb), proj(x, BOARD_H, zb)], '#e8ecf2');
      const zm = (za + zb) / 2;
      if (zb - za > 3 && zm > 0.5 && zm < 40) {
        const pN = proj(x, 0.32, za + 0.5), pF = proj(x, 0.32, zb - 0.5);
        const [a, b] = side < 0 ? [pN, pF] : [pF, pN];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        ctx.save();
        ctx.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
        ctx.rotate(ang);
        ctx.font = `900 ${Math.max(5, sc(zm) * 0.3)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = item.fg;
        ctx.fillText(item.name.toUpperCase(), 0, 0, len * 0.92);
        ctx.restore();
      }
    }
    // Plexiglas über der Eishockey-Bande
    if (v.kind === 'ice') {
      strip(x, BOARD_H, x, BOARD_H + 0.9, Z_NEAR, Z_FAR, 'rgba(190,225,255,0.18)');
    }
  }

  function drawGround(v, spon) {
    const units = game.units;
    groundQuad(-2.3, 2.3, Z_NEAR, Z_FAR + 4, v.apron);
    const half = v.kind === 'football' ? 1.75 : 2.15;
    const SL = 5;
    for (let k = Math.floor((units + Z_NEAR) / SL); k * SL - units < Z_FAR; k++) {
      const za = Math.max(k * SL - units, Z_NEAR), zb = Math.min((k + 1) * SL - units, Z_FAR + 4);
      if (zb > za) groundQuad(-half, half, za, zb, k % 2 ? v.ground[0] : v.ground[1]);
    }
    if (v.kind === 'basket') {
      for (let i = -7; i <= 7; i++) lineAlong(i * 0.3, 0.015, Z_NEAR, Z_FAR, 'rgba(90,50,20,0.18)');
    }
    if (v.kind === 'ice') {
      // Kratzspuren im Eis
      for (let n = Math.floor(units / 3); n * 3 - units < 40; n++) {
        const h = hash(n * 31 + 5);
        const z = n * 3 - units + (h % 100) / 50;
        const x = ((h >> 8) % 400) / 100 - 2;
        lineAcross(z, 0.02, x, x + 0.6, 'rgba(120,160,200,0.25)');
      }
    }
    drawMarkings(v, spon);
    // Spurlinien (gestrichelt)
    const laneCol = v.kind === 'ice' ? 'rgba(60,110,190,0.25)' : 'rgba(255,255,255,0.28)';
    for (let n = Math.floor(units / 3); n * 3 - units < Z_FAR; n++) {
      const za = n * 3 - units;
      for (const x of [-0.5, 0.5]) lineAlong(x, 0.045, za, za + 1.5, laneCol);
    }
  }

  function drawMarkings(v, spon) {
    const units = game.units, PER = 60;
    const white = 'rgba(255,255,255,0.9)';
    for (let n = Math.floor((units - 40) / PER); n * PER - units < Z_FAR + 35; n++) {
      const base = n * PER - units;
      const sp = SPONSORS[(n % SPONSORS.length + SPONSORS.length) % SPONSORS.length];
      if (v.kind === 'football') {
        lineAcross(base, 0.08, -1.75, 1.75, white);
        groundRing(0, base, 1.0, 0.08, white);
        groundDisc(0, base, 0.08, white);
        groundText(sp.name.toUpperCase(), base - 2.4, 0.42, 'rgba(255,255,255,0.5)');
        const gl = base + 30;
        lineAcross(gl, 0.08, -1.75, 1.75, white);
        lineAlong(-1.3, 0.08, gl - 3.2, gl, white);
        lineAlong(1.3, 0.08, gl - 3.2, gl, white);
        lineAcross(gl - 3.2, 0.08, -1.3, 1.3, white);
        lineAlong(-0.6, 0.08, gl - 1.2, gl, white);
        lineAlong(0.6, 0.08, gl - 1.2, gl, white);
        lineAcross(gl - 1.2, 0.08, -0.6, 0.6, white);
        groundDisc(0, gl - 2.2, 0.07, white);
        groundRing(0, gl - 2.2, 0.9, 0.08, white, Math.PI + 0.75, Math.PI * 2 - 0.75);
      } else if (v.kind === 'ice') {
        lineAcross(base, 0.24, -2.15, 2.15, 'rgba(214,47,58,0.85)');
        groundRing(0, base, 1.0, 0.07, 'rgba(43,95,217,0.85)');
        groundDisc(0, base, 0.1, 'rgba(43,95,217,0.85)');
        groundText(sp.name.toUpperCase(), base - 2.3, 0.42, sp.bg === '#141414' ? 'rgba(20,20,20,0.55)' : 'rgba(255,106,0,0.6)');
        for (const d of [-9, 9]) lineAcross(base + d, 0.24, -2.15, 2.15, 'rgba(43,95,217,0.85)');
        for (const d of [-18, 18]) for (const x of [-0.95, 0.95]) {
          groundRing(x, base + d, 0.7, 0.05, 'rgba(214,47,58,0.8)');
          groundDisc(x, base + d, 0.09, 'rgba(214,47,58,0.8)');
        }
        lineAcross(base + 28, 0.05, -2.15, 2.15, 'rgba(214,47,58,0.8)');
        groundRing(0, base + 28, 0.3, 0.6, 'rgba(120,180,255,0.5)', Math.PI, Math.PI * 2);
      } else {
        lineAcross(base, 0.06, -2.15, 2.15, white);
        groundDisc(0, base, 0.9, sp.bg === '#141414' ? 'rgba(20,20,20,0.35)' : 'rgba(255,106,0,0.45)');
        groundRing(0, base, 0.9, 0.06, white);
        groundText(sp.short, base, 0.5, sp.fg);
        const kz = base + 30;
        groundQuad(-0.8, 0.8, kz - 2.8, kz, 'rgba(91,42,168,0.75)');
        lineAlong(-0.8, 0.06, kz - 2.8, kz, white);
        lineAlong(0.8, 0.06, kz - 2.8, kz, white);
        lineAcross(kz - 2.8, 0.06, -0.8, 0.8, white);
        groundRing(0, kz - 2.8, 0.8, 0.06, white, Math.PI, Math.PI * 2);
        groundRing(0, kz, 2.9, 0.06, white, Math.PI + 0.65, Math.PI * 2 - 0.65);
        lineAcross(kz, 0.06, -2.15, 2.15, white);
      }
    }
    if (v.kind === 'football') {
      lineAlong(-1.75, 0.08, Z_NEAR, Z_FAR, white);
      lineAlong(1.75, 0.08, Z_NEAR, Z_FAR, white);
    }
  }

  function drawFog(v) {
    const yTop = HY - 20, h = gy(26) - yTop;
    const layer = cachedLayer('fog-' + v.id, W, h, 0.5, (c) => {
      const grd = c.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, v.sky[1] + 'cc');
      grd.addColorStop(1, v.sky[1] + '00');
      c.fillStyle = grd;
      c.fillRect(0, 0, W, h);
    });
    ctx.drawImage(layer, 0, yTop, W, h);
  }

  function drawLights(v) {
    if (v.kind !== 'football') return;
    // Weiches Licht: in niedriger Auflösung vorgezeichnet, beim Kopieren hochskaliert
    const h = H * 0.7;
    const layer = cachedLayer('lights', W, h, 0.25, (c) => {
      for (const fx of [0.06, 0.94]) {
        const g = c.createRadialGradient(W * fx, H * 0.04, 0, W * fx, H * 0.04, H * 0.6);
        g.addColorStop(0, 'rgba(255,250,225,0.28)');
        g.addColorStop(1, 'rgba(255,250,225,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, W, h);
      }
    });
    ctx.drawImage(layer, 0, 0, W, h);
  }

  // ---------- Objekte (Sprites; 100 Einheiten = 1 Spurbreite) ----------
  const LW = 4;

  function shadow(c, w) {
    ell(c, 0, 0, w, w * 0.16);
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fill();
  }

  function box3d(c, x, y, w, h, depth, fill) {
    // Vorderseite + Oberseite (leicht nach hinten versetzt)
    c.beginPath();
    c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w - depth * 0.6, y - depth); c.lineTo(x + depth * 0.6, y - depth);
    c.closePath();
    fs(c, shade(fill, 0.25), LW);
    rr(c, x, y, w, h, 4);
    fs(c, fill, LW);
  }

  const SPRITES = {
    ad(c, o) {
      const sp = SPONSORS[o.sp || 0];
      shadow(c, 46);
      // Bande als LED-Werbetafel auf Füßen, mit rot-weißem Warnstreifen (= Hindernis, drüberspringen)
      for (const s of [-1, 1]) { rr(c, s * 32 - 5, -6, 10, 6, 2); fs(c, '#555b66', LW / 2); }
      box3d(c, -42, -44, 84, 38, 12, sp.bg);
      rr(c, -37, -40, 74, 24, 3); fs(c, shade(sp.bg, -0.35), LW / 2);
      c.strokeStyle = sp.fg; c.lineWidth = 2; c.stroke();
      comicText(c, sp.short, 0, -31, 15, sp.fg, 68);
      const sub = sp.name.indexOf(' ') > 0 ? sp.name.slice(sp.name.indexOf(' ') + 1) : 'ARENA RUSH';
      comicText(c, sub.toUpperCase(), 0, -21, 6.5, '#ffffff', 68);
      for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#ff3b3b'; c.fillRect(-42 + i * 14, -13, 14, 7); }
      rr(c, -42, -13, 84, 7, 2); fs(c, null, LW / 2);
    },
    hurdle(c) {
      shadow(c, 44);
      for (const s of [-1, 1]) { rr(c, s * 38 - 4, -46, 8, 46, 3); fs(c, '#f5f5f5', LW); }
      for (let i = 0; i < 6; i++) {
        rr(c, -42 + i * 14, -48, 14, 12, 0);
        fs(c, i % 2 ? '#ffffff' : '#ff3b3b');
      }
      rr(c, -42, -48, 84, 12, 3); fs(c, null, LW);
    },
    banner(c, o) {
      const pal = o.pal ? ['#141414', '#ffd000'] : ['#00a650', '#ffffff'];
      ell(c, 0, 0, 50, 6); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fill();
      for (const s of [-1, 1]) { rr(c, s * 46 - 4, -150, 8, 150, 3); fs(c, '#d0d4dc', LW); }
      const wave = Math.sin(o.t * 4) * 3;
      c.beginPath();
      c.moveTo(-48, -150); c.quadraticCurveTo(0, -150 + wave, 48, -150);
      c.lineTo(48, -104); c.quadraticCurveTo(0, -104 + wave, -48, -104);
      c.closePath();
      fs(c, pal[0], LW);
      c.fillStyle = pal[1];
      c.fillRect(-46, -112, 92, 5);
      comicText(c, o.text, 0, -128 + wave / 2, 18, pal[1] === '#ffffff' ? '#ffffff' : '#ffd000', 88);
    },
    mower(c, o) {
      shadow(c, 48);
      for (const s of [-1, 1]) { ell(c, s * 34, -14, 13, 14); fs(c, '#222', LW); ell(c, s * 34, -14, 5, 5); fs(c, '#888'); }
      rr(c, -40, -58, 80, 40, 10); fs(c, '#2fa84f', LW);
      c.fillStyle = shade('#2fa84f', 0.3); c.fillRect(-34, -54, 68, 6);
      rr(c, -16, -80, 32, 24, 6); fs(c, '#1b1b1b', LW);
      // Fahrer
      ell(c, 0, -96, 17, 19); fs(c, '#f1c27d', LW);
      c.beginPath(); c.ellipse(0, -104, 18, 10, 0, Math.PI, 0); c.closePath(); fs(c, '#ff8a00', LW);
      ell(c, -6, -94, 3, 3); fs(c, OUTLINE); ell(c, 6, -94, 3, 3); fs(c, OUTLINE);
      for (const s of [-1, 1]) { ell(c, s * 24, -40, 6, 5); fs(c, '#fff6a0', LW / 2); }
      // Grasschnipsel
      c.strokeStyle = '#7ed957'; c.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const a = o.t * 9 + i * 1.3;
        c.beginPath(); c.moveTo(-30 + i * 15, -8 - (a % 1) * 30); c.lineTo(-26 + i * 15, -14 - (a % 1) * 30); c.stroke();
      }
    },
    icemachine(c, o) {
      shadow(c, 52);
      for (const s of [-1, 1]) { ell(c, s * 34, -12, 12, 12); fs(c, '#222', LW); }
      box3d(c, -46, -92, 92, 80, 14, '#e8f2ff');
      c.fillStyle = '#2e86de'; c.fillRect(-44, -60, 88, 12);
      comicText(c, 'EIS', 0, -78, 16, '#2e86de');
      rr(c, -44, -20, 88, 10, 3); fs(c, '#9aa4b2', LW);
      ell(c, 0, -118, 15, 17); fs(c, '#ffdbac', LW);
      c.beginPath(); c.ellipse(0, -126, 16, 9, 0, Math.PI, 0); c.closePath(); fs(c, '#2e86de', LW);
      ell(c, 30, -110, 6, 6); fs(c, Math.sin(o.t * 10) > 0 ? '#ff9f1a' : '#7a4a10', LW / 2);
    },
    cleaners(c, o) {
      shadow(c, 50);
      // Eimer und Warnschild
      rr(c, -10, -26, 20, 26, 4); fs(c, '#2e86de', LW);
      c.beginPath(); c.moveTo(0, -60); c.lineTo(14, -30); c.lineTo(-14, -30); c.closePath(); fs(c, '#ffd000', LW);
      comicText(c, '!', 0, -40, 14, '#141414');
      for (const s of [-1, 1]) {
        const x = s * 30, sw = Math.sin(o.t * 6 + s) * 10;
        // Wischmopp
        c.strokeStyle = '#8b5a2b'; c.lineWidth = 5;
        c.beginPath(); c.moveTo(x + s * 10, -70); c.lineTo(x + sw, -6); c.stroke();
        ell(c, x + sw, -4, 14, 6); fs(c, '#f0f0f0', LW / 2);
        // Person mit Warnweste
        ell(c, x, -52, 17, 24); fs(c, '#ffdbac', LW);
        c.save(); ell(c, x, -52, 17, 24); c.clip();
        c.fillStyle = '#ffe600'; c.fillRect(x - 18, -46, 36, 30);
        c.fillStyle = '#ff8c00'; c.fillRect(x - 18, -38, 36, 4);
        c.restore();
        ell(c, x, -52, 17, 24); fs(c, null, LW);
        c.beginPath(); c.ellipse(x, -70, 15, 8, 0, Math.PI, 0); c.closePath(); fs(c, '#555', LW);
        ell(c, x - 5, -64, 2.5, 2.5); fs(c, OUTLINE); ell(c, x + 5, -64, 2.5, 2.5); fs(c, OUTLINE);
      }
      // Seifenblasen
      c.strokeStyle = 'rgba(180,220,255,0.9)'; c.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const y = -20 - ((o.t * 30 + i * 18) % 70);
        c.beginPath(); c.arc(-20 + i * 14, y, 4, 0, Math.PI * 2); c.stroke();
      }
    },
    bench(c, o) {
      shadow(c, 54);
      // Spielerbank der Gegner mit Plexiglas-Dach
      rr(c, -50, -34, 100, 12, 3); fs(c, '#6b4a2b', LW);
      for (let i = -1; i <= 1; i++) {
        const x = i * 30, bob = Math.sin(o.t * 3 + i) * 2;
        ell(c, x, -48 + bob, 13, 17); fs(c, '#ffdbac', LW);
        c.save(); ell(c, x, -48 + bob, 13, 17); c.clip();
        c.fillStyle = o.team; c.fillRect(x - 14, -44 + bob, 28, 20);
        c.restore();
        ell(c, x, -48 + bob, 13, 17); fs(c, null, LW);
        c.strokeStyle = OUTLINE; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(x - 7, -58 + bob); c.lineTo(x - 2, -56 + bob); c.moveTo(x + 7, -58 + bob); c.lineTo(x + 2, -56 + bob); c.stroke();
      }
      for (const s of [-1, 1]) { rr(c, s * 50 - 3, -100, 6, 100, 2); fs(c, '#9aa0a8', LW / 2); }
      c.beginPath();
      c.moveTo(-54, -100); c.quadraticCurveTo(0, -122, 54, -100); c.lineTo(54, -94); c.quadraticCurveTo(0, -114, -54, -94);
      c.closePath();
      c.fillStyle = 'rgba(170,215,255,0.55)'; c.fill(); c.lineWidth = LW; c.strokeStyle = OUTLINE; c.stroke();
      rr(c, -30, -96, 60, 14, 4); fs(c, o.team, LW / 2);
      comicText(c, 'GÄSTE', 0, -89, 10, '#ffffff', 56);
    },
    ball(c, o) {
      const bounce = Math.abs(Math.sin(o.t * 7)) * 18;
      dangerRing(c, o);
      drawBall(c, 0, -22 - bounce, 22, 'football', o.t * 12, false, true);
      speedLines(c, -22 - bounce);
    },
    bball(c, o) {
      const bounce = Math.abs(Math.sin(o.t * 6)) * 22;   // flach halten: passt zur Sprung-Kollision
      dangerRing(c, o);
      drawBall(c, 0, -22 - bounce, 22, 'basket', o.t * 8, false, true);
    },
    puck(c, o) {
      dangerRing(c, o);
      drawPuck(c, 0, -2, 'danger');
      speedLines(c, -10);
    },
    coin(c, o) {
      const y = -30 - o.air * 100 + Math.sin(o.t * 4) * 3;
      const sx = Math.abs(Math.cos(o.t * 3)) * 0.8 + 0.2;
      if (o.air < 0.3) shadow(c, 10);
      c.save(); c.translate(0, y); c.scale(sx, 1);
      ell(c, 0, 0, 15, 15); fs(c, '#ffc928', LW);
      ell(c, 0, 0, 10, 10); fs(c, '#ffdf6b');
      comicText(c, 'A', 0, 1, 12, '#c98a00');
      c.restore();
    },
    ticket(c, o) { floating(c, o, () => { rr(c, -20, -12, 40, 24, 3); fs(c, '#ff5ea8', LW); c.fillStyle = '#ffffff'; c.fillRect(6, -10, 2, 20); comicText(c, 'TICKET', -6, 0, 7, '#ffffff', 22); }); },
    scarf(c, o) {
      floating(c, o, () => {
        c.rotate(-0.3);
        const cols = ['#141414', '#ffd000', '#00a650', '#ffffff'];
        for (let i = 0; i < 6; i++) { c.fillStyle = cols[i % 4]; c.fillRect(-36 + i * 12, -9, 12.5, 18); }
        rr(c, -36, -9, 72, 18, 3); fs(c, null, LW);
        c.strokeStyle = '#ffd000'; c.lineWidth = 2;
        for (const s of [-1, 1]) for (let k = -1; k <= 1; k++) { c.beginPath(); c.moveTo(s * 36, k * 5); c.lineTo(s * 44, k * 5); c.stroke(); }
      });
    },
    medal(c, o) {
      floating(c, o, () => {
        c.fillStyle = '#00a650'; c.beginPath(); c.moveTo(-10, -26); c.lineTo(0, -6); c.lineTo(10, -26); c.closePath(); c.fill();
        ell(c, 0, 6, 15, 15); fs(c, '#ffc928', LW);
        comicText(c, '1', 0, 7, 14, '#c98a00');
      });
    },
    jersey(c, o) {
      floating(c, o, () => {
        c.beginPath();
        c.moveTo(-14, -22); c.lineTo(-30, -12); c.lineTo(-22, 0); c.lineTo(-16, -4); c.lineTo(-16, 22);
        c.lineTo(16, 22); c.lineTo(16, -4); c.lineTo(22, 0); c.lineTo(30, -12); c.lineTo(14, -22); c.quadraticCurveTo(0, -12, -14, -22);
        c.closePath(); fs(c, '#ffffff', LW);
        c.fillStyle = '#00a650'; c.fillRect(-16, -6, 32, 6);
        comicText(c, '10', 0, 10, 12, '#141414');
      });
    },
    trophy(c, o) {
      floating(c, o, () => {
        c.beginPath(); c.moveTo(-20, -30); c.lineTo(20, -30); c.quadraticCurveTo(20, 2, 0, 6); c.quadraticCurveTo(-20, 2, -20, -30); c.closePath();
        fs(c, '#ffc928', LW);
        for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 22, -18, 8, 0, Math.PI * 2); c.lineWidth = 5; c.strokeStyle = OUTLINE; c.stroke(); c.lineWidth = 3; c.strokeStyle = '#ffc928'; c.stroke(); }
        rr(c, -5, 4, 10, 12, 2); fs(c, '#ffc928', LW);
        rr(c, -16, 14, 32, 9, 3); fs(c, '#6b4a2b', LW);
        c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(-12, -26, 4, 18);
      });
    },
    revive(c, o) {
      floating(c, o, () => {
        // Blauer Diamant: leuchtender Schein, Kontur, helle Facetten
        const pulse = 1 + Math.sin(o.t * 6) * 0.08;
        c.scale(pulse, pulse);
        ell(c, 0, 0, 30, 30); c.fillStyle = 'rgba(80,190,255,0.30)'; c.fill();
        const pts = (list) => { c.beginPath(); list.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
        pts([[-22, -8], [-12, -22], [12, -22], [22, -8], [0, 22]]);
        fs(c, '#2e9bff', LW);
        pts([[-22, -8], [22, -8], [0, 22]]); c.fillStyle = '#1a6fe0'; c.fill();
        pts([[-12, -22], [-5, -8], [-22, -8]]); c.fillStyle = '#7fd0ff'; c.fill();
        pts([[12, -22], [5, -8], [22, -8]]); c.fillStyle = '#5ab8ff'; c.fill();
        pts([[-12, -22], [12, -22], [5, -8], [-5, -8]]); c.fillStyle = '#b8e8ff'; c.fill();
        pts([[-22, -8], [-12, -22], [12, -22], [22, -8], [0, 22]]); c.lineWidth = LW; c.strokeStyle = OUTLINE; c.stroke();
        sparkle(c, o.t);
        sparkle(c, o.t + 1.7);
      });
    },
    goldball(c, o) {
      floating(c, o, () => {
        drawBall(c, 0, 0, 20, VENUES[game.venue].kind === 'basket' ? 'basket' : 'football', o.t * 4, true);
        sparkle(c, o.t);
      });
    },
    puzzle(c, o) {
      floating(c, o, () => {
        c.beginPath();
        c.moveTo(-18, -18); c.lineTo(-4, -18); c.arc(0, -18, 6, Math.PI, 0); c.lineTo(18, -18);
        c.lineTo(18, -4); c.arc(18, 0, 6, -Math.PI / 2, Math.PI / 2); c.lineTo(18, 18);
        c.lineTo(-18, 18); c.closePath();
        fs(c, '#7fe0ff', LW);
        comicText(c, '?', 0, 2, 16, '#ffffff');
        sparkle(c, o.t);
      });
    },
    spring(c, o) {
      floating(c, o, () => {
        // Fußballschuh mit Sprungfeder und Flügel-Federn
        c.strokeStyle = '#c9ccd6'; c.lineWidth = 4;
        c.beginPath(); for (let k = 0; k <= 5; k++) c.lineTo(k % 2 ? 8 : -8, 6 + k * 4); c.stroke();
        c.beginPath(); c.moveTo(-24, 6); c.quadraticCurveTo(-26, -14, -8, -16); c.lineTo(6, -16); c.quadraticCurveTo(10, -4, 26, 0); c.lineTo(26, 6); c.closePath();
        fs(c, '#00a650', LW);
        c.fillStyle = '#ffd000'; c.fillRect(-20, 0, 44, 4);
        for (const s of [-1, 1]) {
          c.save(); c.translate(-20, -10); c.rotate(-0.6 + s * 0.25 + Math.sin(o.t * 8) * 0.15);
          ell(c, -12, 0, 14, 5); fs(c, '#ffffff', LW / 2); c.restore();
        }
      });
    },
    magnet(c, o) {
      floating(c, o, () => {
        c.lineWidth = 14; c.strokeStyle = OUTLINE;
        c.beginPath(); c.arc(0, -4, 16, Math.PI, 0); c.lineTo(16, 16); c.moveTo(-16, -4); c.lineTo(-16, 16); c.stroke();
        c.lineWidth = 9; c.strokeStyle = '#e74c3c';
        c.beginPath(); c.arc(0, -4, 16, Math.PI, 0); c.lineTo(16, 10); c.moveTo(-16, -4); c.lineTo(-16, 10); c.stroke();
        c.fillStyle = '#dfe6ee'; c.fillRect(-20.5, 8, 9, 9); c.fillRect(11.5, 8, 9, 9);
      });
    },
    shield(c, o) {
      floating(c, o, () => {
        ell(c, 0, 0, 24, 24); c.fillStyle = 'rgba(80,190,255,0.35)'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#7fe0ff'; c.stroke();
        c.beginPath(); c.moveTo(0, -14); c.lineTo(12, -9); c.quadraticCurveTo(12, 8, 0, 15); c.quadraticCurveTo(-12, 8, -12, -9); c.closePath();
        fs(c, '#2e86de', LW);
        comicText(c, '★', 0, 0, 12, '#ffffff');
      });
    },
    megafon(c, o) {
      floating(c, o, () => {
        c.beginPath(); c.moveTo(-18, -6); c.lineTo(14, -18); c.lineTo(14, 18); c.lineTo(-18, 6); c.closePath(); fs(c, '#ffffff', LW);
        rr(c, -26, -7, 10, 14, 3); fs(c, '#d63031', LW);
        comicText(c, '×2', 0, -32, 14, '#ffd000');
      });
    },
    dropball(c, o) {
      const y = -24 - o.air * 100;
      const k = clamp(1 - o.air / 8, 0.2, 1);
      ell(c, 0, 0, 24 * k, 5 * k); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
      if (o.air > 0.6) {
        c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(0, y - 30); c.lineTo(0, y - 60); c.stroke();
      }
      ell(c, 0, y, 40, 40); c.fillStyle = 'rgba(255,230,120,0.25)'; c.fill();
      if (o.kind === 'ice') drawPuck(c, 0, y + 6, 'gold');
      else drawBall(c, 0, y, 24, o.kind === 'basket' ? 'basket' : 'football', o.t * 5);
      sparkle(c, o.t, y);
    },
    shot(c, o) {
      const y = -20 - o.air * 100;
      ell(c, 0, 0, 16, 4); c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
      if (o.kind === 'ice') { ell(c, 0, y, 20, 8); fs(c, '#111', LW); }
      else drawBall(c, 0, y, 20, o.kind === 'basket' ? 'basket' : 'football', o.t * 20);
    },
    goal(c, o) {
      if (o.fade) c.globalAlpha *= 1 - o.fade;
      const kind = o.kind;
      if (kind === 'basket') {
        rr(c, -8, -300, 16, 300, 4); fs(c, '#555b66', LW);
        rr(c, -110, -330, 220, 130, 8); fs(c, 'rgba(255,255,255,0.85)', LW);
        rr(c, -36, -270, 72, 52, 2); c.lineWidth = 5; c.strokeStyle = '#e74c3c'; c.stroke();
        ell(c, 0, -205, 34, 8); c.lineWidth = 6; c.strokeStyle = '#ff6a00'; c.stroke();
        c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2;
        for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 10, -205); c.lineTo(i * 6, -165); c.stroke(); }
      } else {
        const w = kind === 'ice' ? 120 : 150, h = kind === 'ice' ? 90 : 130;
        const col = kind === 'ice' ? '#e33' : '#ffffff';
        c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(-w, -h, w * 2, h);
        c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.5;
        for (let x = -w; x <= w; x += 15) { c.beginPath(); c.moveTo(x, -h); c.lineTo(x, 0); c.stroke(); }
        for (let y = -h; y <= 0; y += 15) { c.beginPath(); c.moveTo(-w, y); c.lineTo(w, y); c.stroke(); }
        for (const s of [-1, 1]) { rr(c, s * w - 6, -h, 12, h, 3); fs(c, col, LW); }
        rr(c, -w - 6, -h - 6, w * 2 + 12, 12, 3); fs(c, col, LW);
      }
      // Torwart bzw. Verteidiger
      const kx = o.keeperX * 100;
      const jumpK = Math.abs(Math.sin(o.t * 5)) * (kind === 'basket' ? 30 : 8);
      c.save();
      c.translate(kx, -jumpK);
      drawKeeper(c, kind);
      c.restore();
      if (o.scored) comicText(c, kind === 'basket' ? 'KORB!' : 'TOR!', 0, -170, 40, '#ffd23f');
    },
    gate(c, o) {
      const v = VENUES[o.venue], sp = SPONSORS[v.sponsor];
      for (const s of [-1, 1]) {
        rr(c, s * 230 - 18, -330, 36, 330, 6); fs(c, '#3b3f4a', LW);
        c.fillStyle = sp.fg; c.fillRect(s * 230 - 12, -320, 24, 8);
      }
      rr(c, -260, -400, 520, 90, 14); fs(c, sp.bg, LW);
      comicText(c, 'WILLKOMMEN IM', 0, -380, 18, '#ffffff', 480);
      comicText(c, v.name.toUpperCase(), 0, -345, 34, sp.fg, 490);
      for (let i = 0; i < 16; i++) {
        ell(c, -240 + i * 32, -404, 4, 4);
        c.fillStyle = (i + Math.floor(o.t * 6)) % 2 ? '#ffffff' : sp.fg; c.fill();
      }
    },
  };

  function floating(c, o, draw) {
    const y = -36 - o.air * 100 + Math.sin(o.t * 4) * 4;
    if (o.air < 0.6) shadow(c, 14);
    ell(c, 0, y, 30, 30); c.fillStyle = 'rgba(255,240,150,0.18)'; c.fill();
    c.save(); c.translate(0, y); draw(); c.restore();
  }

  function sparkle(c, t, y = 0) {
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const a = t * 2 + i * 2.1, r = 30;
      const s = 3 + Math.sin(t * 6 + i) * 2;
      c.save(); c.translate(Math.cos(a) * r, y + Math.sin(a) * r * 0.6); c.rotate(Math.PI / 4);
      c.fillRect(-s / 2, -s / 2, s, s); c.restore();
    }
  }

  function speedLines(c, y) {
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 3;
    for (const x of [-14, 0, 14]) { c.beginPath(); c.moveTo(x, y - 30); c.lineTo(x, y - 48); c.stroke(); }
  }

  // Puck: 'danger' = rot mit bösen Augen (Hindernis), 'gold' = goldener Bonus-Puck, sonst schwarz
  function drawPuck(c, x, y, mode) {
    const side = mode === 'danger' ? '#7a1010' : mode === 'gold' ? '#c98a00' : '#111';
    const top = mode === 'danger' ? '#e53935' : mode === 'gold' ? '#ffd23f' : '#2b2b2b';
    c.save(); c.translate(x, y);
    ell(c, 0, -6, 24, 9); fs(c, side, LW);
    ell(c, 0, -10, 24, 9); fs(c, top, LW);
    if (mode === 'danger') {
      c.fillStyle = '#ffffff';
      ell(c, -8, -11, 5, 4.5); c.fill(); ell(c, 8, -11, 5, 4.5); c.fill();
      c.fillStyle = '#111';
      ell(c, -7, -10.5, 2.2, 2.4); c.fill(); ell(c, 7, -10.5, 2.2, 2.4); c.fill();
      c.strokeStyle = '#111'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(-14, -17); c.lineTo(-4, -13); c.stroke();
      c.beginPath(); c.moveTo(14, -17); c.lineTo(4, -13); c.stroke();
    }
    c.restore();
  }

  // Rot pulsierender Warnring am Boden: Bälle und Pucks als Hindernis sind gefährlich, kein Bonus
  function dangerRing(c, o) {
    shadow(c, 20);
    const a = 0.45 + Math.sin(o.t * 10) * 0.2;
    c.save();
    ell(c, 0, 0, 30, 10);
    c.strokeStyle = `rgba(255,50,50,${a})`; c.lineWidth = 4; c.stroke();
    c.restore();
  }

  // danger = gefährlicher Ball (rot getönt mit bösen Augen), damit er nicht wie ein Bonus aussieht
  function drawBall(c, x, y, r, kind, rot, gold, danger) {
    c.save();
    c.translate(x, y);
    ell(c, 0, 0, r, r);
    if (danger) {
      fs(c, kind === 'basket' ? '#b3261e' : '#e53935', LW);
      c.save(); ell(c, 0, 0, r, r); c.clip(); c.rotate(rot);
      c.strokeStyle = '#4a0d0d'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.moveTo(0, -r); c.lineTo(0, r); c.stroke();
      c.restore();
      // böse Augen
      c.fillStyle = '#ffffff';
      ell(c, -r * 0.35, -r * 0.1, r * 0.22, r * 0.26); c.fill();
      ell(c, r * 0.35, -r * 0.1, r * 0.22, r * 0.26); c.fill();
      c.fillStyle = '#111';
      ell(c, -r * 0.3, -r * 0.05, r * 0.1, r * 0.12); c.fill();
      ell(c, r * 0.3, -r * 0.05, r * 0.1, r * 0.12); c.fill();
      c.strokeStyle = '#111'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-r * 0.62, -r * 0.5); c.lineTo(-r * 0.12, -r * 0.28); c.stroke();
      c.beginPath(); c.moveTo(r * 0.62, -r * 0.5); c.lineTo(r * 0.12, -r * 0.28); c.stroke();
      c.restore();
      return;
    }
    if (kind === 'basket') {
      fs(c, gold ? '#ffc928' : '#ff8a1f', LW);
      c.save(); ell(c, 0, 0, r, r); c.clip(); c.rotate(rot);
      c.strokeStyle = OUTLINE; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(-r, 0); c.lineTo(r, 0); c.moveTo(0, -r); c.lineTo(0, r); c.stroke();
      c.beginPath(); c.arc(-r * 1.2, 0, r, -0.9, 0.9); c.stroke();
      c.beginPath(); c.arc(r * 1.2, 0, r, Math.PI - 0.9, Math.PI + 0.9); c.stroke();
      c.restore();
    } else {
      fs(c, gold ? '#ffd23f' : '#ffffff', LW);
      c.save(); ell(c, 0, 0, r, r); c.clip(); c.rotate(rot);
      c.fillStyle = gold ? '#c98a00' : '#1b1b1b';
      const pent = (px, py, pr) => {
        c.beginPath();
        for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; c.lineTo(px + Math.cos(a) * pr, py + Math.sin(a) * pr); }
        c.closePath(); c.fill();
      };
      pent(0, 0, r * 0.35);
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; pent(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95, r * 0.3); }
      if (!gold) { c.fillStyle = '#00a650'; c.fillRect(-r, r * 0.45, r * 2, r * 0.12); }
      c.restore();
    }
    c.fillStyle = 'rgba(255,255,255,0.55)';
    ell(c, -r * 0.35, -r * 0.4, r * 0.25, r * 0.15); c.fill();
    c.restore();
  }

  function drawKeeper(c, kind) {
    const jersey = '#d63031';
    for (const s of [-1, 1]) {
      ell(c, s * 34, -70, 12, 14); fs(c, kind === 'ice' ? '#ffffff' : '#ff8a00', LW);
      rr(c, s * 12 - 7, -30, 14, 30, 5); fs(c, kind === 'ice' ? '#ffffff' : '#2d3436', LW);
    }
    ell(c, 0, -62, 30, 38); fs(c, '#f1c27d', LW);
    c.save(); ell(c, 0, -62, 30, 38); c.clip();
    c.fillStyle = jersey; c.fillRect(-32, -58, 64, 40);
    c.restore();
    ell(c, 0, -62, 30, 38); fs(c, null, LW);
    if (kind === 'ice') {
      c.beginPath(); c.ellipse(0, -84, 30, 18, 0, Math.PI, 0); c.closePath(); fs(c, '#dfe6ee', LW);
      c.strokeStyle = '#888'; c.lineWidth = 2;
      for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 8, -84); c.lineTo(i * 8, -64); c.stroke(); }
    } else {
      for (const s of [-1, 1]) { ell(c, s * 10, -76, 6, 7); fs(c, '#ffffff', LW / 2); ell(c, s * 10, -75, 3, 3.5); fs(c, OUTLINE); }
      c.strokeStyle = OUTLINE; c.lineWidth = 3;
      c.beginPath(); c.moveTo(-17, -88); c.lineTo(-4, -84); c.moveTo(17, -88); c.lineTo(4, -84); c.stroke();
    }
  }

  function drawObject(o) {
    const z = o.type === 'gate' ? Math.max(o.z, 0.2) : o.z;
    if (z > Z_FAR || z < Z_NEAR + 0.3) return;
    const sprite = SPRITES[o.type];
    if (!sprite) return;
    const s = sc(z);
    ctx.save();
    ctx.translate(W / 2 + (o.x - camX) * s, gy(z));
    ctx.scale(s / 100, s / 100);
    if (z > 48) ctx.globalAlpha = clamp((Z_FAR - z) / (Z_FAR - 48), 0, 1);
    sprite(ctx, o);
    ctx.restore();
  }

  function drawPlayer(t) {
    const g = game, p = g.player;
    const s = sc(0);
    const X = W / 2 + (p.x - camX) * s;
    const crashed = g.state === 'crash';
    ctx.save();
    ctx.translate(X, PY);
    ctx.scale(s / 100, s / 100);
    const hk = clamp(1 - p.h / 2, 0.4, 1);
    shadow(ctx, 34 * hk);
    if (g.boost.magnet > 0) {
      ell(ctx, 0, 0, 120, 22); ctx.strokeStyle = 'rgba(255,90,90,0.5)'; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.translate(0, -p.h * 100);
    const duck = p.duckT > 0;
    ctx.scale(duck ? 1.12 : 1, duck ? 0.6 : 1);
    const run = crashed || p.h > 0.05 ? 0 : Math.sin(t * 18);
    drawChar(ctx, 52, g.look, { run, springs: g.boost.spring > 0, bob: run * 3 });
    if (g.event && g.event.phase === 'carry') {
      if (g.event.kind === 'ice') { ell(ctx, 26, -6, 14, 6); fs(ctx, '#111', LW); }
      else drawBall(ctx, 28, -14, 14, g.event.kind === 'basket' ? 'basket' : 'football', t * 10);
    }
    if (g.boost.shield > 0 && (g.boost.shield > 1 || Math.sin(t * 20) > 0)) {
      ell(ctx, 0, -60, 66, 78);
      ctx.fillStyle = 'rgba(90,200,255,0.18)'; ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(140,230,255,0.9)'; ctx.stroke();
    }
    if (crashed) {
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + (i * Math.PI * 2) / 3;
        comicText(ctx, '★', Math.cos(a) * 36, -150 + Math.sin(a) * 10, 18, '#ffd23f');
      }
    }
    ctx.restore();
  }

  function render(t) {
    const g = game;
    const v = VENUES[g.venue];
    const spon = SPONSORS[v.sponsor];
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    drawSky(v);
    drawBackStand(v, spon, t);
    drawSideStand(v, t, -1);
    drawSideStand(v, t, 1);
    drawGround(v, spon);
    drawBoards(v, t, -1);
    drawBoards(v, t, 1);
    drawFog(v);
    drawLights(v);

    // Objekte von hinten nach vorne, Spieler bei z = 0 einsortiert
    const objs = g.objects.slice().sort((a, b) => b.z - a.z);
    let playerDrawn = g.state === 'menu';
    for (const o of objs) {
      if (!playerDrawn && o.z < 0) { drawPlayer(t); playerDrawn = true; }
      drawObject(o);
    }
    if (!playerDrawn) drawPlayer(t);

    ctx.restore();
    drawOverlay(t);
  }

  function drawOverlay(t) {
    const g = game;
    // Effekte
    for (const f of g.fx) {
      const k = f.t / f.max;
      ctx.globalAlpha = Math.min(1, k * 2.5);
      const pop = 1 + Math.max(0, (k - 0.8) * 2);
      comicText(ctx, f.text, f.x, f.y, f.size * pop, f.color, W * 0.92);
    }
    // Kleine Meldungen oben rechts (unter Taler-Anzeige und Pause-Knopf)
    ctx.font = `900 15px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = OUTLINE;
    if (g.feed.length && feedTop === null) {
      const r = $('btn-pause').getBoundingClientRect();
      feedTop = r.bottom > 0 ? r.bottom + 16 : 112;
    }
    // Solange das Stadion-Banner zu sehen ist, rutscht die Liste darunter
    const feedY = g.banner && g.state !== 'menu' ? Math.max(feedTop, H * 0.17 + 64 + 18) : feedTop;
    g.feed.forEach((f, i) => {
      ctx.globalAlpha = Math.min(1, (f.t / f.max) * 3);
      const y = feedY + i * 22;
      ctx.strokeText(f.text, W - 12, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, W - 12, y);
    });
    ctx.globalAlpha = 1;
    for (const c of g.confetti) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot);
      ctx.fillStyle = c.c; ctx.fillRect(-c.r, -c.r / 2, c.r * 2, c.r);
      ctx.restore();
    }
    // Stadion-Banner
    if (g.banner && g.state !== 'menu') {
      const b = g.banner;
      ctx.globalAlpha = Math.min(1, b.t * 2);
      const w = Math.min(W - 24, 420), h = 64, x = (W - w) / 2, y = H * 0.17;
      const sp = SPONSORS[VENUES[g.venue].sponsor];
      rr(ctx, x, y, w, h, 16); fs(ctx, 'rgba(10,10,30,0.82)', 4);
      ctx.fillStyle = sp.fg; ctx.fillRect(x + 12, y + h - 10, w - 24, 3);
      ctx.font = `700 13px system-ui, sans-serif`;
      ctx.fillStyle = '#c7d0e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.sub, W / 2, y + 16);
      comicText(ctx, b.text, W / 2, y + 38, 22, '#ffffff', w - 24);
      ctx.globalAlpha = 1;
    }
    // Hinweis zum Torschuss
    if (g.event && g.event.phase === 'carry' && g.event.goal && g.event.goal.z < 44 && g.state === 'run') {
      const pulse = 1 + Math.sin(t * 8) * 0.06;
      comicText(ctx, '⬆ WISCHEN: SCHUSS!', W / 2, H * 0.62, 24 * pulse, '#ffd23f', W - 20);
      comicText(ctx, 'Ziel: wo der Torwart NICHT steht', W / 2, H * 0.62 + 28, 14, '#ffffff', W - 20);
    }
    // Warnung vor schnellen Bällen/Pucks
    for (const o of g.objects) {
      if ((o.type === 'puck' || o.type === 'ball' || o.type === 'bball') && o.z > 30 && o.z < Z_FAR && Math.sin(t * 6) > -0.3) {
        const [x] = proj(o.x, 0, 8);
        comicText(ctx, '!', x, H * 0.42, 28, '#ff4d4d');
      }
    }
    drawCoach();
    if (g.state === 'crash') {
      ctx.fillStyle = `rgba(220,40,40,${0.3 * (g.crashT / 1.1)})`;
      ctx.fillRect(0, 0, W, H);
      comicText(ctx, g.crashText, W / 2, H * 0.45, 46, '#ffffff', W - 20);
    }
  }

  // ---------- Hauptschleife ----------
  // Automatische Qualität: Ist das Gerät zu langsam (unter ~40 Bildern/s), wird schrittweise
  // weniger gezeichnet, damit das Spiel flüssig bleibt. Die Qualität wird nie wieder hochgeschaltet (kein Hin und Her).
  const perf = { sum: 0, n: 0 };
  function adaptQuality(dt) {
    perf.sum += dt; perf.n++;
    if (perf.n < 90) return;
    const avg = perf.sum / perf.n;
    perf.sum = 0; perf.n = 0;
    if (avg < 0.025) return;
    if (FAN_DEPTH > 28) FAN_DEPTH = 28;
    else if (dprCap > 1) { dprCap = Math.max(1, dprCap - 0.5); requestResize(); }
  }

  const STEP = 1 / 120;   // feste Logik-Schritte: gleiches Verhalten bei 30, 60 oder 120 Bildern pro Sekunde
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    if (resizePending) applyResize();
    // Große Sprünge (Tab im Hintergrund, Ruckler) begrenzen, damit nichts "teleportiert"
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
    last = now;
    if (game.state === 'run') adaptQuality(dt);
    if (game.state === 'run') {
      acc += dt;
      while (acc >= STEP && game.state === 'run') { update(STEP); acc -= STEP; }
      if (game.state !== 'run') acc = 0;
    } else if (game.state === 'crash') {
      acc = 0;
      game.crashT -= dt;
      updateFx(dt);
      if (game.crashT <= 0) afterCrash();
    } else if (game.state === 'menu') {
      // Im Menü läuft die Kamera langsam durch alle Stadien
      game.units += 9 * dt;
      game.menuT += dt;
      game.venue = Math.floor(game.menuT / 6) % VENUES.length;
      updateFx(dt);
    }
    render(now / 1000);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', requestResize);
  window.addEventListener('orientationchange', requestResize);
  applyResize();
  game = newGame('menu', null);
  show('start');
  requestAnimationFrame(frame);

  // Testzugang (nur mit ?test in der Adresse)
  if (TEST) {
    window.__arena = {
      get game() { return game; },
      save, act, startMatch, persist, checkUnlocks, update, afterCrash, reviveNow, giveUp, buyToken,
      startBallEvent: () => startBallEvent(VENUES[game.venue].kind),      spawn: (type, lane, z, extra) => addObj(type, lane, z, extra),
      step(seconds, dt = 1 / 60) {
        for (let tt = 0; tt < seconds && game.state === 'run'; tt += dt) update(dt);
      },
    };
  }
})();
