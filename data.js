'use strict';

// Arena Rush – Spieldaten.
// Hier lassen sich Werbepartner, Stadien und Charaktere bequem anpassen.
window.ARENA_DATA = (() => {
  // Fanfarben (eigene Muster, keine offiziellen Trikots oder Wappen)
  const FAN = {
    gelbschwarz: ['#141414', '#ffd000'],
    gruenweiss: ['#ffffff', '#141414', '#00a650'],
  };

  // Werbepartner: erscheinen auf Banden, LED-Wänden, Eingangstoren und Mittelkreis
  const SPONSORS = [
    { name: 'FETTE Unterhaltung', short: 'FETTE', bg: '#141414', fg: '#ffd000' },
    { name: 'Playafieber', short: 'PLAYA', bg: '#ff6a00', fg: '#ffffff' },
  ];

  // Eigenwerbung: erscheint auf einem Teil der Banden (chance = Anteil aller Banden, 0.25 = jede vierte)
  const HOUSE_AD = { name: 'Arena Rush', short: 'arenarush.de', sub: 'JETZT SPIELEN!', bg: '#0a1633', fg: '#ffd23f', chance: 0.25 };

  // Die Strecke führt nacheinander durch diese Stadien (kind: football | ice | basket)
  const VENUES = [
    {
      id: 'fette', name: 'FETTE Unterhaltung Stadion', kind: 'football', sponsor: 0,
      ground: ['#46b551', '#3ca447'], apron: '#2f7d39', seats: '#3a3a44',
      sky: ['#0b1640', '#3555b0'], roof: '#22232c', fans: [FAN.gelbschwarz, FAN.gruenweiss],
    },
    {
      id: 'frost', name: 'Frostwerk Eishalle', kind: 'ice', sponsor: 1,
      ground: ['#f2faff', '#e8f4fc'], apron: '#ffffff', seats: '#1f4f9a',
      sky: ['#060b18', '#1a2848'], roof: '#141a2a', fans: [FAN.gelbschwarz, FAN.gruenweiss],
    },
    {
      id: 'playa', name: 'Playafieber Stadion', kind: 'football', sponsor: 1,
      ground: ['#4dbb57', '#42a94c'], apron: '#2f7d39', seats: '#c25200',
      sky: ['#2a1450', '#ff8a5c'], roof: '#2b1f33', fans: [FAN.gruenweiss, FAN.gelbschwarz],
    },
    {
      id: 'stern', name: 'Sternwurf Arena', kind: 'basket', sponsor: 0,
      ground: ['#e3a865', '#d99d5a'], apron: '#2b2b38', seats: '#5b2aa8',
      sky: ['#0e0a1f', '#2d1d52'], roof: '#16121f', fans: [FAN.gelbschwarz, FAN.gruenweiss],
    },
    {
      id: 'polar', name: 'Polarstern Eishalle', kind: 'ice', sponsor: 0,
      ground: ['#f3faff', '#e9f4fb'], apron: '#ffffff', seats: '#2a2a2a',
      sky: ['#050a14', '#162644'], roof: '#11151f', fans: [FAN.gruenweiss, FAN.gelbschwarz],
    },
  ];

  // Hauptcharakter Luis
  const luisCharacter = {
    id: 'luis',
    name: 'Luis',
    role: 'Hauptcharakter',
    unlockedByDefault: true,
    appearance: {
      age: 11,
      hair: 'kurz, hellbraun',
      sunglasses: 'sportlich, blau verspiegelt',
      expression: 'selbstbewusst und leicht frech',
      outfit: 'weißes Sporttrikot mit grünen und schwarzen Flächen sowie gelben Akzenten',
      accessories: ['Hockeyschläger', 'Fußball', 'Puck'],
    },
    style: 'freundlicher, dynamischer Comic-Spielstil',
    baseStats: {
      speed: 1.0,
      jump: 1.0,
      collectionRadius: 1.0,
      shieldDuration: 1.0,
    },
    ability: {
      id: 'fairplay_shield',
      name: 'Fairplay-Schutz',
      description: 'Schützt Luis einmal pro Lauf vor einem Zusammenstoß.',
    },
    upgradeableStats: ['speed', 'jump', 'collectionRadius', 'shieldDuration'],
  };

  // Wandelt Luis' Beschreibung in das Spielformat um (1.0 = ausgewogene Stufe 3 von 5)
  function fromSpec(spec, look) {
    const s = spec.baseStats;
    const lvl = (v) => Math.max(1, Math.min(5, Math.round(v * 3)));
    return Object.assign({
      id: spec.id, name: spec.name, role: spec.role, starter: spec.unlockedByDefault,
      base: { tempo: lvl(s.speed), jump: lvl(s.jump), shield: lvl(s.shieldDuration), radius: lvl(s.collectionRadius) },
      ability: { id: spec.ability.id, name: spec.ability.name, desc: spec.ability.description },
    }, look);
  }

  // 15 eigene Charaktere: 3 Startcharaktere + 12 Spezialcharaktere
  // base: Grundwerte 1–5 (Tempo, Sprungkraft, Schild-Dauer, Sammelradius)
  // image (optional): Pfad zu einem eigenen Bild, z. B. 'assets/characters/luis.png'.
  //   Ist das Bild vorhanden, wird es statt der gezeichneten Figur verwendet.
  const CHARACTERS = [
    fromSpec(luisCharacter, {
      num: '10', skin: '#f1c3a0', hair: '#b07a45', style: 'short', shades: '#2f8cff', mouth: 'smirk',
      jersey: { pattern: 'luis', colors: ['#ffffff', '#00a650', '#141414', '#ffd000'] },
      // Zusatz-Skins nur für Luis: Heim-Trikot mit Hockeyschläger
      skins: [{ id: 'hockey', name: 'Hockey', price: 300, extra: 'stick' }],
      // Optional: eigenes Bild (transparentes PNG), z. B. 'assets/characters/luis.png'.
      // Leer = gezeichnete Comic-Figur (bewusst nicht fotogetreu).
      image: '',
    }),
    {
      id: 'daniel', name: 'DJ Daniel', starter: true, role: 'Stimmungsmacher', num: '33',
      skin: '#c98e62', hair: '#1b1b1b', style: 'cap', cap: '#7a32ff', extra: 'headphones', mouth: 'grin',
      jersey: { pattern: 'hoops', colors: ['#141414', '#ffd000'] },
      base: { tempo: 4, jump: 3, shield: 2, radius: 3 },
      ability: { id: 'beatdrop', name: 'Beat-Drop', desc: 'Alle Booster halten 50 % länger.' },
      image: '',
    },
    {
      id: 'money', name: 'Mr Money', starter: true, role: 'Geldsammler', num: '$',
      // Angelehnt an die Vorlage: Navy-Gold-Jacke, weißes Shirt, Goldkette, dunkle Wuschelhaare
      skin: '#e9b48a', hair: '#3b2414', style: 'short', extra: 'chain', mouth: 'grin', brows: true,
      jersey: { pattern: 'jacket', colors: ['#1c2452', '#e8b923', '#ffffff'] },
      base: { tempo: 2, jump: 3, shield: 3, radius: 4 },
      ability: { id: 'goldhand', name: 'Goldhändchen', desc: 'Sammelobjekte bringen +50 % Punkte.' },
      image: '',
    },
    {
      id: 'kalle', name: 'Kalle Kufe', role: 'Eishockey-Ass', num: '91',
      skin: '#f1c7a5', hair: '#3b2a1e', style: 'helmet', helmet: '#ffd000', mouth: 'grin',
      jersey: { pattern: 'shoulders', colors: ['#141414', '#ffd000'] },
      base: { tempo: 4, jump: 2, shield: 3, radius: 3 },
      ability: { id: 'eis', name: 'Eiskunst', desc: '+50 % Punkte in Eishallen.' },
      goal: { stat: 'iceMeters', value: 800, text: 'Laufe insgesamt 800 m in Eishallen' },
    },
    {
      id: 'frieda', name: 'Frieda Flanke', role: 'Luftakrobatin', num: '11',
      skin: '#ffdcc2', hair: '#c0392b', style: 'bun', mouth: 'smile',
      jersey: { pattern: 'sash', colors: ['#ffffff', '#00a650', '#141414'] },
      base: { tempo: 3, jump: 5, shield: 2, radius: 2 },
      ability: { id: 'doppelsprung', name: 'Doppelsprung', desc: 'In der Luft kann sie noch einmal springen.' },
      goal: { stat: 'jumps', value: 150, text: 'Springe insgesamt 150-mal' },
    },
    {
      id: 'bruno', name: 'Bruno Bande', role: 'Kraftpaket', num: '5', build: 1.22,
      skin: '#d9a07a', hair: '#141414', style: 'bald', band: '#00a650', mouth: 'smirk', brows: true,
      jersey: { pattern: 'shoulders', colors: ['#141414', '#00a650'] },
      base: { tempo: 2, jump: 2, shield: 5, radius: 3 },
      ability: { id: 'brecher', name: 'Bandenbrecher', desc: 'Rennt niedrige Banden und Hürden einfach um.' },
      goal: { stat: 'trophies', value: 10, text: 'Sammle insgesamt 10 Pokale' },
    },
    {
      id: 'paule', name: 'Paule Puck', role: 'Puckjäger', num: '22',
      skin: '#f3c9a0', hair: '#7a4b22', style: 'cap', cap: '#141414', mouth: 'tongue',
      jersey: { pattern: 'checker', colors: ['#ffd000', '#141414'] },
      base: { tempo: 3, jump: 3, shield: 3, radius: 3 },
      ability: { id: 'puckfaenger', name: 'Puckfänger', desc: 'Fängt Pucks (+25 Punkte), statt zu stürzen.' },
      goal: { stat: 'totalScarves', value: 100, text: 'Sammle insgesamt 100 Fan-Schals' },
    },
    {
      id: 'toni', name: 'Toni Torwart', role: 'Ballfänger', num: '1',
      skin: '#c68642', hair: '#00a650', style: 'mohawk', gloves: '#ff8a00', mouth: 'grin',
      jersey: { pattern: 'chevron', colors: ['#2d2d2d', '#ffd000'] },
      base: { tempo: 2, jump: 4, shield: 3, radius: 3 },
      ability: { id: 'parade', name: 'Glanzparade', desc: 'Fängt Bälle (+25 Punkte), statt zu stürzen.' },
      goal: { stat: 'runs', value: 20, text: 'Spiele 20 Läufe' },
    },
    {
      id: 'lotte', name: 'Lotte Libero', role: 'Abwehrchefin', num: '3',
      skin: '#f5d5b8', hair: '#2b1b12', style: 'ponytail', mouth: 'smile', brows: true,
      jersey: { pattern: 'hoops', colors: ['#ffffff', '#141414', '#00a650'] },
      base: { tempo: 3, jump: 3, shield: 5, radius: 1 },
      ability: { id: 'abwehr', name: 'Bollwerk', desc: 'Schutzschilde halten doppelt so lange.' },
      goal: { stat: 'boosters', value: 15, text: 'Sammle insgesamt 15 Booster' },
    },
    {
      id: 'hanna', name: 'Hanna Hattrick', role: 'Torjägerin', num: '9',
      skin: '#e0ac69', hair: '#4a2c17', style: 'braids', mouth: 'grin',
      jersey: { pattern: 'stripes', colors: ['#ffd000', '#141414'] },
      base: { tempo: 4, jump: 3, shield: 2, radius: 3 },
      ability: { id: 'torjaeger', name: 'Knipserin', desc: '+25 % Punkte, Tore zählen doppelt.' },
      goal: { stat: 'goalsScored', value: 10, text: 'Erziele insgesamt 10 Tore oder Körbe' },
    },
    {
      id: 'jojo', name: 'Jojo Joker', role: 'Glückspilz', num: '77',
      skin: '#ffe0bd', hair: '#ff5ea8', hair2: '#5ec8ff', style: 'clown', mouth: 'tongue',
      jersey: { pattern: 'checker', colors: ['#00a650', '#ffffff'] },
      base: { tempo: 3, jump: 3, shield: 3, radius: 3 },
      ability: { id: 'joker', name: 'Glückstreffer', desc: 'Jedes Sammelobjekt hat 25 % Chance auf dreifache Punkte.' },
      goal: { stat: 'ducks', value: 150, text: 'Ducke dich insgesamt 150-mal' },
    },
    {
      id: 'elli', name: 'Elli Eiszeit', role: 'Ruhepol', num: '14',
      skin: '#fbe3d0', hair: '#e8e8f0', style: 'beanie', cap: '#00a650', mouth: 'smile',
      jersey: { pattern: 'sash', colors: ['#141414', '#ffd000'] },
      base: { tempo: 2, jump: 3, shield: 3, radius: 4 },
      ability: { id: 'frost', name: 'Frostatem', desc: 'Alles kommt 15 % langsamer auf sie zu.' },
      goal: { stat: 'bestDistance', value: 1000, text: 'Laufe 1.000 m in einem Lauf' },
    },
    {
      id: 'ben', name: 'Ben Turbo', role: 'Raser', num: '99',
      skin: '#a86b45', hair: '#141414', style: 'goggles', mouth: 'grin', brows: true,
      jersey: { pattern: 'chevron', colors: ['#141414', '#ffd000'] },
      base: { tempo: 5, jump: 3, shield: 2, radius: 2 },
      ability: { id: 'turbo', name: 'Turbo', desc: '+50 % Punkte, aber das Tempo ist höher.' },
      goal: { stat: 'bestScore', value: 6000, text: 'Erreiche 6.000 Punkte in einem Lauf' },
    },
    {
      id: 'capo', name: 'Capo Krawall', role: 'Vorsänger', num: '12',
      skin: '#f0c08f', hair: '#6b3f1d', style: 'bucket', cap: '#00a650', extra: 'megaphone', mouth: 'open',
      jersey: { pattern: 'stripes', colors: ['#141414', '#ffffff'] },
      base: { tempo: 3, jump: 3, shield: 2, radius: 5 },
      ability: { id: 'fangesang', name: 'Fangesang', desc: 'Sammelradius dauerhaft verdoppelt.' },
      goal: { stat: 'duels', value: 5, text: 'Spiele 5 Duelle' },
    },
    {
      id: 'lex', name: 'Lex Legende', role: 'Legende', num: '★',
      skin: '#e8b48a', hair: '#f5f5f5', style: 'crown', mouth: 'grin',
      jersey: { pattern: 'shoulders', colors: ['#e8b923', '#141414'] },
      base: { tempo: 4, jump: 4, shield: 4, radius: 4 },
      ability: { id: 'legende', name: 'Legende', desc: 'Startet mit Schutzschild, +50 % Punkte.' },
      goal: { stat: 'specials', value: 11, text: 'Schalte alle anderen 11 Spezialcharaktere frei' },
    },
  ];

  // Sammelobjekte: Punkte (für den Rekord) und Arena-Taler (Währung)
  const PICKUPS = {
    coin: { name: 'Arena-Taler', points: 10, taler: 1 },
    ticket: { name: 'Eintrittskarte', points: 20, taler: 2 },
    scarf: { name: 'Fan-Schal', points: 25, taler: 3 },
    medal: { name: 'Medaille', points: 50, taler: 5 },
    jersey: { name: 'Trikot', points: 75, taler: 8 },
    trophy: { name: 'Pokal', points: 150, taler: 15 },
    goldball: { name: 'Goldball', points: 250, taler: 25 },
    dropball: { name: 'Ball', points: 50, taler: 5 },
  };
  // Treffer beim Torschuss
  const GOAL_REWARD = { points: 300, taler: 30 };

  // Skins für jeden Charakter (mit Arena-Talern kaufbar)
  const SKINS = [
    { id: 'home', name: 'Heim', price: 0 },
    { id: 'away', name: 'Auswärts', price: 400 },
    { id: 'gold', name: 'Gold', price: 1500 },
  ];

  // Booster, die man unterwegs einsammelt
  const BOOSTERS = {
    spring: { name: 'Feder-Schuhe', icon: '👟' },
    magnet: { name: 'Fan-Magnet', icon: '🧲' },
    shield: { name: 'Schutzschild', icon: '🛡️' },
    megafon: { name: 'Megafon ×2', icon: '📣' },
  };

  // Comeback-Token: belebt nach einem Zusammenstoß mitten im Lauf wieder.
  // price: Preis in Arena-Talern · max: so viele Token kann man gleichzeitig besitzen
  // perRun: so oft darf man pro Lauf wiederbeleben · rare: Chance pro Bonus-Platz (sehr selten, max. 1 pro Lauf)
  const REVIVE = { name: 'Comeback-Token', icon: '💎', price: 500, max: 9, perRun: 2, rare: 0.006 };

  // Trainer, der während des Laufs hilfreiche Tipps reinruft
  const COACH = {
    name: 'Trainer Klaus',
    look: {
      id: 'coach', name: 'Klaus', num: 'T', skin: '#f0c08f', hair: '#a0a0a0', style: 'cap', cap: '#00a650',
      mouth: 'open', brows: true, extra: 'whistle',
      jersey: { pattern: 'shoulders', colors: ['#141414', '#ffd000'] },
    },
  };

  // Tipp-Texte (frei anpassbar). {name} wird durch den Namen der Spielfigur ersetzt.
  const COACH_TIPS = {
    startNew: 'Wisch nach links und rechts, um auszuweichen!',
    startNew2: 'Wisch nach oben zum Springen, nach unten zum Ducken!',
    startPro: ['Auf geht\'s, {name}! Zeig\'s ihnen!', 'Konzentration, {name}! Heute knacken wir den Rekord!', 'Volle Kraft voraus, {name}!'],
    low: 'Bande vorne – spring drüber! ⬆',
    high: 'Fan-Banner! Ducken! ⬇',
    block: 'Großes Hindernis – Spur wechseln! ⬅ ➡',
    mover: 'Achtung, da kommt was Schnelles! Früh springen! ⬆',
    drop: 'Ball von oben! Lauf drunter und schnapp ihn dir!',
    shoot: 'Jetzt schießen! Ziel auf die Seite, wo der Torwart NICHT steht!',
    puzzle: 'Da vorne ist ein Puzzleteil – hol es dir!',
    speed: 'Es wird schneller! Augen nach vorne!',
    ice: 'Eishalle! Pucks sind flach und schnell – rechtzeitig springen!',
    basket: 'Basketball-Arena! Die Bälle hüpfen – früh drüberspringen!',
    fairplay: 'Puh, Glück gehabt! Ab jetzt gut aufpassen!',
    boost: {
      spring: 'Feder-Schuhe! Jetzt springst du sogar über Rasenmäher und Bänke!',
      magnet: 'Fan-Magnet! Der zieht Taler aus den anderen Spuren an!',
      shield: 'Schutzschild! Jetzt kann dir kurz nichts passieren!',
      megafon: 'Megafon! Doppelte Punkte – jetzt Taler sammeln!',
    },
    general: [
      'Taler-Bögen über Banden sammelst du im Sprung ein!',
      'Mit Arena-Talern verbesserst du Tempo, Sprungkraft, Schild und Sammelradius.',
      'Jede Figur hat eine eigene Fähigkeit – probier sie alle aus!',
      'Ein höherer Sammelradius holt Taler sogar aus der Nachbarspur.',
      'Sammle alle 6 Puzzleteile für einen dicken Bonus!',
      'In jedem Stadion gibt es einen Torschuss – nicht verpassen!',
      'Pokale und Goldbälle bringen richtig viele Punkte!',
    ],
    crash: {
      low: 'Über Banden und Hürden springst du mit Wischen nach oben ⬆.',
      high: 'Unter Fan-Bannern musst du dich ducken: Wischen nach unten ⬇.',
      block: 'Rasenmäher, Eismaschinen, Bänke und Putzcrews: immer die Spur wechseln!',
      mover: 'Bälle und Pucks sind schnell – achte auf das rote ! und spring früh.',
    },
  };

  // Kaufpreise der Spezialcharaktere in Arena-Talern (alternativ: Spielziel erreichen)
  const PRICES = {
    kalle: 800, frieda: 900, bruno: 1000, paule: 1000, toni: 1100, lotte: 1200,
    hanna: 1400, jojo: 1500, elli: 1700, ben: 2200, capo: 2500, lex: 5000,
  };
  for (const ch of CHARACTERS) ch.price = ch.starter ? 0 : (PRICES[ch.id] || 1000);

  // Kosten je Upgrade-Stufe (1–5) in Arena-Talern
  const UPGRADE_COSTS = [50, 100, 175, 275, 400];
  const MAX_UPGRADE = 5;

  return { SPONSORS, HOUSE_AD, VENUES, CHARACTERS, PICKUPS, GOAL_REWARD, BOOSTERS, REVIVE, SKINS, UPGRADE_COSTS, MAX_UPGRADE, COACH, COACH_TIPS };
})();
