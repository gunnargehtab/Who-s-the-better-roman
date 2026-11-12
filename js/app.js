/*
 * Who's the Better Roman? - the game screen, menus and animations.
 * Game rules live in rules.js; this file only shows them and reacts to taps.
 */
(function () {
  'use strict';

  var W = window.WBR;
  var R = W.Rules;
  var AI = W.AI;
  var Art = W.Art;
  var Sound = W.Sound;

  var SETTINGS_KEY = 'wbr.settings.v1';
  var SAVE_KEY = 'wbr.save.v1';
  var PAUSING = { 'screen-pause': 1, 'screen-rules': 1, 'screen-settings': 1, 'screen-confirm': 1 };
  var CLOSABLE = { 'screen-solo': 1, 'screen-rules': 1, 'screen-settings': 1, 'screen-pause': 1, 'screen-confirm': 1 };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function lowMotion() { return !!(motionQuery && motionQuery.matches); }

  // ?seed=123 makes the dice repeatable and ?fast speeds everything up (for testing).
  var random = Math.random;
  var speed = /[?&]fast\b/.test(location.search) ? 0.08 : 1;
  (function () {
    var m = /[?&]seed=(\d+)/.exec(location.search);
    if (!m) return;
    var a = Number(m[1]) >>> 0;
    random = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }());
  function rollDie() { return 1 + Math.floor(random() * 6); }

  /* ---------------- storage ---------------- */

  var store = {
    get: function (key) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    },
    del: function (key) {
      try { window.localStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
    }
  };

  var settings = { sound: 'on', seats: 'side', soloTeam: 'blue', soloLevel: 'easy' };
  (function () {
    var s = store.get(SETTINGS_KEY) || {};
    if (s.sound === 'off') settings.sound = 'off';
    if (s.seats === 'across') settings.seats = 'across';
    if (s.soloTeam === 'purple') settings.soloTeam = 'purple';
    if (s.soloLevel === 'tricky') settings.soloLevel = 'tricky';
  }());
  function saveSettings() { store.set(SETTINGS_KEY, settings); }

  /* ---------------- flow control ---------------- */

  var paused = false;
  var resumeQueue = [];
  function setPaused(on) {
    paused = on;
    if (!on) {
      var q = resumeQueue;
      resumeQueue = [];
      q.forEach(function (f) { f(); });
    }
  }
  // Waits pause while a menu is open over the game.
  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (paused) resumeQueue.push(resolve);
        else resolve();
      }, ms * speed);
    });
  }
  // Every new game or trip to the menu bumps the epoch, so old animations stop.
  var epoch = 0;
  function guard() {
    var mine = epoch;
    return function () { return mine === epoch; };
  }

  /* ---------------- game session ---------------- */

  var G = null;          // { mode: '1p'|'2p', human, level, flipped, state }
  var busy = false;      // animating, or the computer is playing
  var selected = null;   // selected Roman id
  var moves = [];        // legal moves for the current roll
  var cell = 40;         // square size in px
  var cellEls = {};
  var pieceEls = {};
  var dieShown = { purple: 0, blue: 0 };
  var rolling = { purple: false, blue: false };
  var announced = {};

  function st() { return G.state; }
  function isAI(team) { return !!G && G.mode === '1p' && team !== G.human; }
  function name(team) { return R.TEAM_NAME[team]; }
  function bottomTeam() { return G && G.flipped ? 'purple' : 'blue'; }
  function toView(r, c) { return G && G.flipped ? [R.ROWS - 1 - r, R.COLS - 1 - c] : [r, c]; }
  function fromView(vr, vc) { return toView(vr, vc); }

  var el = {
    app: $('#app'),
    wrap: $('#board-wrap'),
    board: $('#board'),
    grid: $('#grid'),
    pieces: $('#pieces'),
    fx: $('#fx'),
    banner: $('#banner'),
    title: $('#topbar-title'),
    sound: $('#btn-sound')
  };

  /* ---------------- art helpers ---------------- */

  function setIcon(node, iconName) {
    node.style.setProperty('--icon', 'url("' + Art.icon(iconName) + '")');
  }

  function paintIcons(root) {
    $$('.ico[data-icon]', root).forEach(function (n) { setIcon(n, n.getAttribute('data-icon')); });
  }

  function paintArt(root) {
    $$('img[data-art]', root).forEach(function (img) {
      var a = img.getAttribute('data-art').split(':');
      if (a[0] === 'roman') img.src = Art.roman(a[1], Number(a[2]), false);
      else if (a[0] === 'commander') img.src = Art.roman(a[1], Number(a[2]), true);
      else if (a[0] === 'die') img.src = Art.die(Number(a[1]));
      else if (a[0] === 'tile') img.src = Art.tileStill(a[1]);
    });
  }

  function paintScenery() {
    $('.sky-near').style.backgroundImage = 'url("' + Art.cloud() + '")';
    $('.sky-far').style.backgroundImage = 'url("' + Art.cloud() + '")';
    $('.sky-stars').style.backgroundImage = 'url("' + Art.stars() + '")';
    var hero = $('#hero');
    var g = hero.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(Art.heroCanvas(), 0, 0);
  }

  /* ---------------- board ---------------- */

  function buildBoard() {
    el.grid.innerHTML = '';
    el.pieces.innerHTML = '';
    el.fx.innerHTML = '';
    cellEls = {};
    pieceEls = {};
    el.board.style.backgroundImage = 'url("' + Art.planks() + '")';
    for (var vr = 0; vr < R.ROWS; vr++) {
      for (var vc = 0; vc < R.COLS; vc++) {
        var rc = fromView(vr, vc);
        var r = rc[0];
        var c = rc[1];
        var code = R.MAP[r][c];
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cell t-' + R.TERRAIN[code].name + (vr === 0 && code === 'S' ? ' top-start' : '');
        b.setAttribute('data-r', r);
        b.setAttribute('data-c', c);
        b.style.backgroundImage = 'url("' + Art.tile(code, r, c) + '")';
        if (code === 'S') {
          var label = document.createElement('span');
          label.className = 'label';
          label.textContent = 'Start';
          b.appendChild(label);
        }
        var mark = document.createElement('span');
        mark.className = 'mark';
        b.appendChild(mark);
        el.grid.appendChild(b);
        cellEls[r + ',' + c] = b;
      }
    }
  }

  function place(node, r, c) {
    var v = toView(r, c);
    node.style.setProperty('--x', v[1]);
    node.style.setProperty('--y', v[0]);
    node.style.zIndex = 10 + v[0] * 2;
  }

  function renderPieces() {
    st().pieces.forEach(function (p) {
      var node = pieceEls[p.id];
      if (!node) {
        node = document.createElement('div');
        node.className = 'piece team-' + p.team;
        var wrap = document.createElement('div');
        wrap.className = 'sprite-wrap';
        var img = document.createElement('img');
        img.className = 'sprite';
        img.alt = '';
        img.draggable = false;
        wrap.appendChild(img);
        node.appendChild(wrap);
        var chip = document.createElement('span');
        chip.className = 'dir-chip';
        chip.appendChild(document.createElement('span')).className = 'ico';
        node.appendChild(chip);
        el.pieces.appendChild(node);
        pieceEls[p.id] = node;
      }
      node.hidden = !p.alive;
      node.classList.toggle('commander', !!p.commander);
      var sprite = node.querySelector('.sprite');
      var src = Art.roman(p.team, p.face, p.commander);
      if (sprite.getAttribute('src') !== src) sprite.setAttribute('src', src);
      // Romans that turned around at the end of the board get an arrow chip.
      var turned = p.dir !== R.FORWARD[p.team];
      node.classList.toggle('turned', turned);
      if (turned) setIcon(node.querySelector('.dir-chip .ico'), marchIcon(p));
      place(node, p.r, p.c);
    });
    labelCells();
  }

  // Arrow for the way a Roman marches, as seen on screen.
  function marchIcon(p) {
    var down = G && G.flipped ? p.dir < 0 : p.dir > 0;
    return down ? 'down' : 'up';
  }

  async function turnAroundFx(id) {
    var p = R.getPiece(st(), id);
    var node = pieceEls[id];
    renderPieces();
    Sound.turn();
    popAt(p.r, p.c, 'Turn around!', 'gold');
    if (node && !lowMotion()) {
      node.classList.remove('spin');
      void node.offsetWidth;
      node.classList.add('spin');
      setTimeout(function () { node.classList.remove('spin'); }, 600);
    }
    await wait(650);
  }

  function labelCells() {
    var s = st();
    Object.keys(cellEls).forEach(function (key) {
      var rc = key.split(',').map(Number);
      var p = R.pieceAt(s, rc[0], rc[1]);
      var text = R.terrainAt(rc[0], rc[1]).label;
      if (p) {
        text += ', ' + name(p.team) + ' Roman ' + p.face + (p.commander ? ', Commander' : '');
        if (p.dir !== R.FORWARD[p.team]) text += ', marching back';
      }
      if (cellEls[key].classList.contains('target')) text += cellEls[key].classList.contains('attack') ? ', tap to attack' : ', tap to move here';
      cellEls[key].setAttribute('aria-label', text);
    });
  }

  function clearMarks() {
    $$('.cell.target').forEach(function (n) { n.classList.remove('target', 'attack'); });
    $$('.piece.selected, .piece.movable, .piece.pickable').forEach(function (n) {
      n.classList.remove('selected', 'movable', 'pickable');
    });
  }

  function screenDir(m) {
    var a = toView(m.from[0], m.from[1]);
    var b = toView(m.to[0], m.to[1]);
    if (b[0] < a[0]) return 'up';
    if (b[0] > a[0]) return 'down';
    return b[1] < a[1] ? 'left' : 'right';
  }

  function showTargets(list) {
    $$('.cell.target').forEach(function (n) { n.classList.remove('target', 'attack'); });
    list.forEach(function (m) {
      var c = cellEls[m.to[0] + ',' + m.to[1]];
      c.classList.add('target');
      c.classList.toggle('attack', !!m.target);
      setIcon(c.querySelector('.mark'), m.target ? 'swords' : screenDir(m));
    });
    labelCells();
  }

  function movableIds() {
    var seen = {};
    return moves.filter(function (m) {
      if (seen[m.id]) return false;
      seen[m.id] = true;
      return true;
    }).map(function (m) { return m.id; });
  }

  function showMovable() {
    movableIds().forEach(function (id) { pieceEls[id].classList.add('movable'); });
  }

  /* ---------------- team panels ---------------- */

  function makeDock(section) {
    section.appendChild($('#dock-template').content.cloneNode(true));
    var d = {
      el: section,
      helmet: $('.dock-helmet', section),
      name: $('.dock-name', section),
      tag: $('.dock-tag', section),
      romans: $('.dock-romans', section),
      hint: $('.dock-hint', section),
      die: $('.die-btn', section),
      dieImg: $('.die-img', section),
      badge: $('.die-badge', section),
      badgeIco: $('.die-badge .ico', section),
      badgeNum: $('.die-num', section),
      team: null
    };
    d.die.addEventListener('click', function () {
      if (d.team) onDieTap(d.team);
    });
    return d;
  }
  var docks = { top: makeDock($('#dock-top')), bottom: makeDock($('#dock-bottom')) };

  function dockOf(team) { return team === bottomTeam() ? docks.bottom : docks.top; }

  function setHint(team, text) { dockOf(team).hint.textContent = text; }

  function isActive(team) {
    var s = st();
    if (s.phase === 'over') return false;
    if (s.phase === 'rolloff') return !s.rolloff[team];
    return s.turn === team;
  }

  function canRoll(team) {
    var s = st();
    if (busy || isAI(team)) return false;
    if (s.phase === 'rolloff') return !s.rolloff[team] && !rolling[team];
    return s.phase === 'roll' && s.turn === team;
  }

  function renderDocks() {
    var s = st();
    ['top', 'bottom'].forEach(function (pos) {
      var d = docks[pos];
      var team = pos === 'bottom' ? bottomTeam() : R.enemyOf(bottomTeam());
      d.team = team;
      d.el.classList.remove('team-purple', 'team-blue');
      d.el.classList.add('team-' + team);
      d.el.setAttribute('aria-label', name(team) + ' team');
      d.name.textContent = name(team);
      if (G.mode === '1p') {
        d.tag.textContent = team === G.human ? 'You' : 'Computer';
      } else {
        d.tag.textContent = '';
      }
      var helmet = Art.roman(team, 5, false);
      if (d.helmet.getAttribute('src') !== helmet) d.helmet.src = helmet;

      var mine = s.pieces.filter(function (p) { return p.team === team; });
      if (d.romans.children.length !== mine.length) {
        d.romans.innerHTML = '';
        mine.forEach(function () {
          var img = document.createElement('img');
          img.className = 'mini';
          img.alt = '';
          img.draggable = false;
          d.romans.appendChild(img);
        });
      }
      mine.forEach(function (p, i) {
        var mini = d.romans.children[i];
        var src = Art.roman(team, p.face, false);
        if (mini.getAttribute('src') !== src) mini.src = src;
        mini.classList.toggle('lost', !p.alive);
        mini.classList.toggle('cmd', !!p.commander);
      });
      d.romans.setAttribute('aria-label', R.aliveCount(s, team) + ' of ' + mine.length + ' Romans left');

      d.el.classList.toggle('active', isActive(team));
      var ready = canRoll(team);
      d.die.classList.toggle('ready', ready);
      d.die.disabled = isAI(team);
      d.die.setAttribute('aria-label', ready ? 'Roll the dice' : 'Dice' + (dieShown[team] ? ', showing ' + dieShown[team] : ''));
      var face = Art.die(dieShown[team] || 0);
      if (d.dieImg.getAttribute('src') !== face && !d.die.classList.contains('rolling')) d.dieImg.src = face;
      var badge = (s.phase === 'move' || s.phase === 'moved') && s.turn === team && s.roll;
      d.badge.hidden = !badge;
      if (badge) {
        setIcon(d.badgeIco, s.roll <= 3 ? 'sides' : (team === bottomTeam() ? 'up' : 'down'));
        d.badgeNum.textContent = s.roll;
      }
    });
    updateTitle();
  }

  function updateTitle() {
    var s = G && st();
    var left = s && ['roll', 'move', 'moved', 'duel'].indexOf(s.phase) >= 0 ? R.patienceLeft(s) : Infinity;
    if (left <= 10) {
      el.title.textContent = 'Battle soon! ' + left + (left === 1 ? ' turn' : ' turns') + ' left';
      el.title.classList.add('warn');
    } else {
      el.title.textContent = "Who's the Better Roman?";
      el.title.classList.remove('warn');
    }
  }

  /* ---------------- effects ---------------- */

  var bannerTimer = 0;
  function banner(text, team, ms) {
    var b = el.banner;
    b.firstChild.textContent = text;
    b.className = 'banner' + (team ? ' team-' + team : '');
    b.hidden = false;
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { b.hidden = true; }, (ms || 1500) * Math.max(speed, 0.3));
  }

  function centerOf(r, c) {
    var v = toView(r, c);
    return [(v[1] + 0.5) * cell, (v[0] + 0.5) * cell];
  }

  function popAt(r, c, text, tone) {
    var p = centerOf(r, c);
    var n = document.createElement('div');
    n.className = 'pop' + (tone ? ' ' + tone : '');
    n.textContent = text;
    n.style.left = p[0] + 'px';
    n.style.top = (p[1] - cell * 0.3) + 'px';
    el.fx.appendChild(n);
    setTimeout(function () { n.remove(); }, 1100);
  }

  function burst(r, c, colors, count) {
    if (lowMotion()) return;
    var p = centerOf(r, c);
    var size = Math.max(3, Math.round(cell / 8));
    for (var i = 0; i < (count || 16); i++) {
      var b = document.createElement('i');
      b.className = 'bit';
      b.style.width = size + 'px';
      b.style.height = size + 'px';
      b.style.left = (p[0] - size / 2) + 'px';
      b.style.top = (p[1] - size / 2) + 'px';
      b.style.background = colors[i % colors.length];
      el.fx.appendChild(b);
      if (!b.animate) { b.remove(); continue; }
      var angle = Math.random() * Math.PI * 2;
      var dist = cell * (0.4 + Math.random() * 0.8);
      var dx = Math.cos(angle) * dist;
      var dy = Math.sin(angle) * dist;
      var anim = b.animate([
        { transform: 'translate(0, 0)', opacity: 1 },
        { transform: 'translate(' + dx * 0.7 + 'px,' + (dy * 0.7 - cell * 0.3) + 'px)', opacity: 1, offset: 0.45 },
        { transform: 'translate(' + dx + 'px,' + (dy + cell * 0.5) + 'px)', opacity: 0 }
      ], { duration: 650 + Math.random() * 300, easing: 'ease-out' });
      anim.onfinish = (function (node) { return function () { node.remove(); }; }(b));
    }
  }

  function shake() {
    if (lowMotion()) return;
    el.board.classList.remove('shake');
    void el.board.offsetWidth;
    el.board.classList.add('shake');
  }

  function buzz(pattern) {
    try {
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* not allowed here */ }
  }

  function animateDie(team) {
    var d = dockOf(team);
    var value = rollDie();
    d.die.classList.add('rolling');
    d.die.classList.remove('ready');
    return new Promise(function (resolve) {
      var flips = lowMotion() ? 2 : 9;
      var i = 0;
      (function tick() {
        if (i < flips) {
          d.dieImg.src = Art.die(1 + Math.floor(Math.random() * 6));
          Sound.rattle();
          i += 1;
          setTimeout(tick, (55 + i * 7) * speed);
          return;
        }
        d.die.classList.remove('rolling');
        dieShown[team] = value;
        d.dieImg.src = Art.die(value);
        d.die.classList.remove('landed');
        void d.die.offsetWidth;
        d.die.classList.add('landed');
        Sound.land();
        resolve(value);
      }());
    });
  }

  async function walk(id, path) {
    var node = pieceEls[id];
    node.classList.remove('selected', 'movable');
    node.style.zIndex = 700;
    for (var i = 0; i < path.length; i++) {
      var v = toView(path[i][0], path[i][1]);
      node.style.setProperty('--x', v[1]);
      node.style.setProperty('--y', v[0]);
      node.classList.remove('hop');
      void node.offsetWidth;
      node.classList.add('hop');
      Sound.step(i);
      await wait(lowMotion() ? 90 : 170);
    }
    node.classList.remove('hop');
    var last = path[path.length - 1];
    place(node, last[0], last[1]);
  }

  async function knockOut(id, at) {
    var p = R.getPiece(st(), id);
    var node = pieceEls[id];
    var pos = at || [p.r, p.c];
    Sound.bonk();
    buzz(p.commander ? [90, 50, 140] : 60);
    popAt(pos[0], pos[1], p.commander ? 'BONK!!!' : 'BONK!', 'red');
    var t = Art.TEAM[p.team];
    burst(pos[0], pos[1], [t.main, t.light, '#fbf8f0', '#d8382c'], 18);
    shake();
    if (node) {
      node.style.zIndex = 800;
      node.classList.add('ko');
    }
    await wait(560);
    if (node) {
      node.classList.remove('ko');
      node.hidden = true;
    }
    renderDocks();
  }

  /* ---------------- game flow ---------------- */

  function saveObject() {
    return { v: 1, mode: G.mode, human: G.human, level: G.level, state: st(), dice: dieShown };
  }

  function save() {
    if (!G) return;
    if (st().phase === 'over') store.del(SAVE_KEY);
    else store.set(SAVE_KEY, saveObject());
  }

  function loadSave() {
    var s = store.get(SAVE_KEY);
    if (!s || (s.mode !== '1p' && s.mode !== '2p') || !R.isValidState(s.state) || s.state.phase === 'over') return null;
    return s;
  }

  function startGame(opts) {
    epoch += 1;
    closeAllScreens();
    var state = opts.state || R.newGame({ rng: random });
    G = {
      mode: opts.mode,
      human: opts.mode === '1p' ? (opts.human === 'purple' ? 'purple' : 'blue') : null,
      level: opts.level === 'tricky' ? 'tricky' : 'easy',
      state: state
    };
    G.flipped = G.mode === '1p' && G.human === 'purple';
    dieShown = { purple: (opts.dice && opts.dice.purple) || 0, blue: (opts.dice && opts.dice.blue) || 0 };
    rolling = { purple: false, blue: false };
    announced = {};
    selected = null;
    moves = [];
    el.app.hidden = false;
    applySeats();
    buildBoard();
    layout();
    renderPieces();
    renderDocks();
    keepAwake();
    save();
    nextStep();
  }

  function nextStep() {
    if (!G) return;
    var s = st();
    busy = false;
    selected = null;
    clearMarks();
    renderPieces();
    renderDocks();
    switch (s.phase) {
      case 'commander': stepCommander(); break;
      case 'rolloff': stepRolloff(); break;
      case 'roll': stepRoll(); break;
      case 'move': stepMove(); break;
      case 'duel': stepDuel(); break;
      case 'moved': finishTurn(); break;
      default: showWin();
    }
  }

  function stepCommander() {
    var s = st();
    var team = s.turn;
    var other = R.enemyOf(team);
    if (isAI(team)) {
      busy = true;
      renderDocks();
      setHint(team, 'Choosing a Commander...');
      setHint(other, 'The computer is choosing its Commander.');
      var ok = guard();
      wait(1000).then(function () {
        if (ok()) pickCommander(AI.chooseCommander(st(), team, G.level, random));
      });
      return;
    }
    R.teamPieces(s, team).forEach(function (p) { pieceEls[p.id].classList.add('pickable'); });
    if (!announced['cmd-' + team]) {
      announced['cmd-' + team] = true;
      banner(G.mode === '1p' ? 'Pick your Commander!' : name(team) + ': pick your Commander!', team, 1700);
    }
    setHint(team, 'Tap a Roman to make it your Commander.');
    setHint(other, isAI(other) ? 'Waiting for you...' : 'Wait while ' + name(team) + ' picks.');
  }

  function pickCommander(id) {
    var ok = guard();
    busy = true;
    clearMarks();
    R.chooseCommander(st(), id);
    var p = R.getPiece(st(), id);
    renderPieces();
    renderDocks();
    Sound.promote();
    burst(p.r, p.c, ['#f4c430', '#ffe58a', '#d8382c', '#ffffff'], 20);
    popAt(p.r, p.c, 'Commander!', 'gold');
    save();
    wait(1000).then(function () { if (ok()) nextStep(); });
  }

  function stepRolloff() {
    var s = st();
    if (!announced.rolloff) {
      announced.rolloff = true;
      banner('Who goes first? Roll the dice!', null, 1700);
    }
    R.TEAMS.forEach(function (team) {
      if (s.rolloff[team]) setHint(team, 'You rolled ' + s.rolloff[team] + '.');
      else if (isAI(team)) setHint(team, 'Rolling...');
      else setHint(team, 'Tap the dice! The higher roll goes first.');
      if (isAI(team) && !s.rolloff[team] && !rolling[team]) {
        rolling[team] = true;
        var ok = guard();
        wait(1200).then(function () { if (ok()) rollOffFor(team, true); });
      }
    });
    renderDocks();
  }

  async function rollOffFor(team, reserved) {
    var s = st();
    if (s.phase !== 'rolloff' || s.rolloff[team] || (rolling[team] && !reserved)) return;
    var ok = guard();
    rolling[team] = true;
    renderDocks();
    var v = await animateDie(team);
    rolling[team] = false;
    if (!ok()) return;
    var res = R.rollOff(st(), team, v);
    save();
    if (res.tie) {
      busy = true;
      renderDocks();
      banner('Tie! You both rolled ' + v + '. Roll again!', null, 1600);
      R.TEAMS.forEach(function (t) { setHint(t, 'Tie! Roll again.'); });
      await wait(1800);
      if (!ok()) return;
      dieShown = { purple: 0, blue: 0 };
      nextStep();
      return;
    }
    if (res.done) {
      busy = true;
      renderDocks();
      setHint(team, 'You rolled ' + v + '.');
      banner(name(res.first) + ' goes first!', res.first, 1800);
      Sound.turn();
      await wait(2000);
      if (!ok()) return;
      nextStep();
      return;
    }
    setHint(team, 'You rolled ' + v + '. Wait for ' + name(R.enemyOf(team)) + '.');
    renderDocks();
  }

  function stepRoll() {
    var s = st();
    var team = s.turn;
    var other = R.enemyOf(team);
    dieShown[team] = 0;
    renderDocks();
    if (isAI(team)) {
      setHint(team, 'The computer is thinking...');
      setHint(other, 'Wait for the computer.');
      aiTurn();
      return;
    }
    setHint(team, G.mode === '1p' ? 'Your turn! Tap the dice.' : name(team) + ', your turn! Tap the dice.');
    setHint(other, G.mode === '1p' ? 'Waiting for you...' : 'Wait for ' + name(team) + '.');
  }

  function rollHint(roll, team) {
    var who = isAI(team) ? 'The computer rolled ' : 'You rolled ';
    if (roll <= 3) return who + roll + ': move ' + roll + ' left or right.';
    return who + roll + ': march ' + roll + ' forward!';
  }

  async function rollTurn() {
    var ok = guard();
    busy = true;
    renderDocks();
    var team = st().turn;
    var v = await animateDie(team);
    if (!ok()) return;
    moves = R.setRoll(st(), v);
    save();
    afterRoll();
  }

  async function afterRoll() {
    var ok = guard();
    var s = st();
    var team = s.turn;
    renderDocks();
    if (!moves.length) {
      busy = true;
      setHint(team, (isAI(team) ? 'The computer rolled ' : 'You rolled ') + s.roll + '. No Roman can move!');
      banner('No moves! Next turn.', team, 1600);
      Sound.nope();
      await wait(1900);
      if (!ok()) return;
      finishTurn();
      return;
    }
    busy = false;
    renderDocks();
    setHint(team, rollHint(s.roll, team));
    showMovable();
    var ids = movableIds();
    if (ids.length === 1) selectPiece(ids[0], true);
  }

  function stepMove() {
    moves = R.legalMoves(st());
    if (moves.length && isAI(st().turn)) aiPlay();
    else afterRoll();
  }

  function selectPiece(id, auto) {
    selected = id;
    if (!auto) Sound.select();
    $$('.piece.selected').forEach(function (n) { n.classList.remove('selected'); });
    pieceEls[id].classList.add('selected');
    var mine = moves.filter(function (m) { return m.id === id; });
    showTargets(mine);
    var attack = mine.some(function (m) { return m.target; });
    var text = mine.length > 1 ? 'Tap a glowing square: left or right?' : 'Tap the glowing square to move.';
    if (attack) text = 'Tap the swords to battle an enemy!';
    setHint(st().turn, text);
  }

  function onCellTap(r, c) {
    Sound.unlock();
    if (!G || busy) return;
    var s = st();
    var p = R.pieceAt(s, r, c);

    if (s.phase === 'commander' && !isAI(s.turn)) {
      if (p && p.team === s.turn) pickCommander(p.id);
      else {
        Sound.nope();
        setHint(s.turn, 'Tap one of your own ' + name(s.turn) + ' Romans.');
      }
      return;
    }

    if (s.phase === 'move' && !isAI(s.turn)) {
      if (selected) {
        var chosen = moves.filter(function (m) {
          return m.id === selected && m.to[0] === r && m.to[1] === c;
        })[0];
        if (chosen) {
          doMove(chosen);
          return;
        }
      }
      if (p && p.team === s.turn) {
        if (moves.some(function (m) { return m.id === p.id; })) {
          selectPiece(p.id);
        } else {
          Sound.nope();
          wiggle(p.id);
          setHint(s.turn, "That Roman can't move this time. Pick a bouncing one!");
        }
        return;
      }
    }

    if (R.isBlocked(r, c)) {
      var team = s.turn && !isAI(s.turn) ? s.turn : (G.human || 'blue');
      if (R.MAP[r][c] === 'W') {
        Sound.splash();
        popAt(r, c, 'Splash!', 'gold');
        setHint(team, "Romans can't swim! No stopping in the water.");
      } else {
        Sound.nope();
        setHint(team, 'That black rock is too hard to stand on!');
      }
    } else if (s.phase === 'roll' && !isAI(s.turn)) {
      Sound.nope();
      setHint(s.turn, 'Tap the dice first!');
      var d = dockOf(s.turn).die;
      d.classList.remove('ready');
      void d.offsetWidth;
      d.classList.add('ready');
    } else if (s.phase === 'move' && !isAI(s.turn)) {
      Sound.nope();
      setHint(s.turn, selected ? 'Tap a glowing square to move.' : 'Tap one of your bouncing Romans.');
      if (!selected) movableIds().forEach(wiggle);
    }
  }

  function wiggle(id) {
    var n = pieceEls[id];
    n.classList.remove('wiggle');
    void n.offsetWidth;
    n.classList.add('wiggle');
    setTimeout(function () { n.classList.remove('wiggle'); }, 400);
  }

  function onDieTap(team) {
    Sound.unlock();
    if (!G) return;
    var s = st();
    if (s.phase === 'rolloff') {
      if (canRoll(team)) rollOffFor(team, false);
      else Sound.nope();
      return;
    }
    if (s.phase === 'roll' && canRoll(team)) {
      rollTurn();
      return;
    }
    Sound.nope();
    if (busy || isAI(team)) return;
    if (s.phase === 'move' && s.turn === team) {
      setHint(team, 'You rolled ' + s.roll + '! Now tap a bouncing Roman.');
      movableIds().forEach(wiggle);
    } else if (s.phase === 'commander' && s.turn === team) {
      setHint(team, 'First tap a Roman to make it your Commander.');
    } else if (s.turn && s.turn !== team) {
      setHint(team, "It's " + name(s.turn) + "'s turn. Wait a moment!");
    }
  }

  async function doMove(m) {
    var ok = guard();
    busy = true;
    clearMarks();
    var s = st();
    await walk(m.id, m.path);
    if (!ok()) return;
    var res = R.applyMove(s, m);
    if (res.type === 'duel') {
      save();
      runDuel();
      return;
    }
    Sound.land();
    if (res.turned) {
      await turnAroundFx(m.id);
      if (!ok()) return;
    }
    renderPieces();
    renderDocks();
    save();
    await wait(300);
    if (ok()) finishTurn();
  }

  function finishTurn() {
    var s = st();
    selected = null;
    moves = [];
    clearMarks();
    var res = R.endTurn(s);
    save();
    if (res.over) {
      showWin();
      return;
    }
    var left = R.patienceLeft(s);
    if (left === 10 || left === 5) {
      banner('No battles for a long time! ' + left + ' turns left.', null, 1800);
    } else if (G.mode === '2p') {
      banner(name(s.turn) + "'s turn", s.turn, 1000);
      Sound.turn();
    }
    nextStep();
  }

  /* ---------------- computer player ---------------- */

  async function aiTurn() {
    var ok = guard();
    busy = true;
    renderDocks();
    await wait(900);
    if (!ok()) return;
    var team = st().turn;
    var v = await animateDie(team);
    if (!ok()) return;
    moves = R.setRoll(st(), v);
    save();
    renderDocks();
    if (!moves.length) {
      afterRoll();
      return;
    }
    aiPlay();
  }

  async function aiPlay() {
    var ok = guard();
    busy = true;
    var team = st().turn;
    setHint(team, rollHint(st().roll, team));
    await wait(700);
    if (!ok()) return;
    var m = AI.chooseMove(st(), G.level, random);
    if (!m) {
      finishTurn();
      return;
    }
    pieceEls[m.id].classList.add('selected');
    showTargets([m]);
    Sound.select();
    await wait(850);
    if (!ok()) return;
    doMove(m);
  }

  /* ---------------- battles ---------------- */

  function fillDuelist(box, p, role) {
    box.className = 'duelist team-' + p.team;
    // Across a table, the top player's side of the battle faces them.
    box.classList.toggle('flip', el.app.classList.contains('seats-across') && p.team !== bottomTeam());
    $('.duel-roman', box).src = Art.roman(p.team, p.face, p.commander);
    $('.duel-die', box).src = Art.die(0);
    $('.duel-name', box).textContent = name(p.team) + ' ' + role + (p.commander ? ' (Commander)' : '');
  }

  // One side of a battle rolls: a player taps their own die, the computer rolls by itself.
  function battleRoll(box, team) {
    var ok = guard();
    var btn = $('.duel-roll', box);
    var img = $('.duel-die', box);
    var label = $('.duel-roll-label', box);
    img.src = Art.die(0);
    return new Promise(function (resolve) {
      function go() {
        btn.onclick = null;
        btn.disabled = true;
        btn.classList.remove('ready');
        label.textContent = 'Rolling';
        spinDie(img).then(function (v) {
          label.textContent = name(team) + ': ' + v;
          resolve(v);
        });
      }
      if (isAI(team)) {
        btn.disabled = true;
        btn.classList.remove('ready');
        label.textContent = 'Computer';
        wait(900).then(function () { if (ok()) go(); });
      } else {
        btn.disabled = false;
        btn.classList.add('ready');
        label.textContent = 'Roll!';
        btn.setAttribute('aria-label', 'Roll ' + name(team) + "'s battle die");
        btn.onclick = function () {
          Sound.unlock();
          go();
        };
      }
    });
  }

  function spinDie(img) {
    return new Promise(function (resolve) {
      var value = rollDie();
      var flips = lowMotion() ? 2 : 10;
      var i = 0;
      img.classList.add('rolling');
      (function tick() {
        if (i < flips) {
          img.src = Art.die(1 + Math.floor(Math.random() * 6));
          Sound.rattle();
          i += 1;
          setTimeout(tick, (55 + i * 7) * speed);
          return;
        }
        img.classList.remove('rolling');
        img.src = Art.die(value);
        resolve(value);
      }());
    });
  }

  function stepDuel() {
    var s = st();
    var att = R.getPiece(s, s.duel.attacker);
    place(pieceEls[att.id], s.duel.to[0], s.duel.to[1]);
    runDuel();
  }

  async function runDuel() {
    var ok = guard();
    busy = true;
    var s = st();
    var att = R.getPiece(s, s.duel.attacker);
    var def = R.getPiece(s, s.duel.defender);
    var to = s.duel.to.slice();
    var boxA = $('#duel-a');
    var boxD = $('#duel-d');
    var msg = $('#duel-msg');
    fillDuelist(boxA, att, 'attacks');
    fillDuelist(boxD, def, 'defends');
    msg.textContent = 'Both players roll. The higher number wins!';
    R.TEAMS.forEach(function (team) {
      setHint(team, isAI(team) ? 'Battle! The computer rolls its die.' : 'Battle! Roll your battle die.');
    });
    openScreen('screen-duel');
    Sound.duel();
    for (;;) {
      var first = null;
      var note = function (team, v) {
        if (first) return;
        first = team;
        msg.textContent = name(team) + ' rolled ' + v + '. Now ' + name(R.enemyOf(team)) + ' rolls!';
      };
      var rolls = await Promise.all([
        battleRoll(boxA, att.team).then(function (v) { note(att.team, v); return v; }),
        battleRoll(boxD, def.team).then(function (v) { note(def.team, v); return v; })
      ]);
      if (!ok()) return;
      var res = R.resolveDuel(st(), rolls[0], rolls[1]);
      save();
      if (res.tie) {
        msg.textContent = 'Tie! You both rolled ' + rolls[0] + '. Roll again!';
        Sound.nope();
        await wait(1300);
        if (!ok()) return;
        continue;
      }
      var winner = R.getPiece(st(), res.winnerId);
      (res.loserId === att.id ? boxA : boxD).classList.add('lost');
      msg.textContent = name(winner.team) + ' wins the battle, ' + Math.max(rolls[0], rolls[1]) + ' to ' + Math.min(rolls[0], rolls[1]) + '!';
      Sound.land();
      await wait(1500);
      if (!ok()) return;
      closeScreen('screen-duel');
      await knockOut(res.loserId, to);
      if (!ok()) return;
      if (res.turned && st().phase !== 'over') {
        await turnAroundFx(res.winnerId);
        if (!ok()) return;
      }
      renderPieces();
      renderDocks();
      save();
      if (st().phase === 'over') {
        await wait(700);
        if (ok()) showWin();
        return;
      }
      await wait(300);
      if (ok()) finishTurn();
      return;
    }
  }

  /* ---------------- game over ---------------- */

  function showWin() {
    epoch += 1;
    busy = true;
    var s = st();
    store.del(SAVE_KEY);
    clearMarks();
    renderPieces();
    renderDocks();
    var w = s.winner;
    var panel = $('.win-panel');
    panel.classList.remove('team-purple', 'team-blue');
    if (w) panel.classList.add('team-' + w);

    var title;
    var sub;
    if (w) {
      if (G.mode === '1p') title = w === G.human ? 'You win!' : 'The computer wins!';
      else title = name(w) + ' wins!';
      sub = name(w) + ' is the better Roman!';
    } else {
      title = "It's a draw!";
      sub = 'You are both great Romans.';
    }
    var why;
    if (s.reason === 'commander') {
      why = 'The ' + name(R.enemyOf(w)) + ' Commander got knocked out.';
    } else {
      why = s.reason === 'stuck'
        ? 'No Roman can reach a Commander anymore'
        : 'Nobody battled for ' + R.PATIENCE + ' turns';
      why += w
        ? ', so the team with more Romans left wins.'
        : ', and both teams have the same number of Romans.';
    }
    R.TEAMS.forEach(function (team) {
      setHint(team, !w ? "It's a draw!" : team === w ? 'Victory! ' + name(team) + ' wins!' : 'Good game!');
    });
    $('#win-title').textContent = title;
    $('#win-sub').textContent = sub;
    $('#win-why').textContent = why;

    var box = $('#win-romans');
    box.innerHTML = '';
    (w ? [w] : R.TEAMS).forEach(function (team) {
      var cmd = s.pieces.filter(function (p) { return p.team === team && p.commander; })[0];
      var img = document.createElement('img');
      img.alt = name(team) + ' Commander';
      img.src = Art.roman(team, cmd ? cmd.face : 6, true);
      box.appendChild(img);
    });

    if (G.mode === '1p' && w && w !== G.human) Sound.lose();
    else Sound.win();
    buzz([60, 40, 60, 40, 160]);
    openScreen('screen-win');
    confetti(w);
  }

  function confetti(team) {
    var box = $('#confetti');
    box.innerHTML = '';
    if (lowMotion()) return;
    var colors = ['#f4c430', '#d8382c', '#4cae3a', '#ffffff'];
    if (team) colors.push(Art.TEAM[team].main, Art.TEAM[team].light);
    var fall = box.clientHeight + 40;
    for (var i = 0; i < 70; i++) {
      var b = document.createElement('i');
      b.style.left = (Math.random() * 100) + '%';
      b.style.background = colors[i % colors.length];
      box.appendChild(b);
      if (!b.animate) continue;
      var drift = (Math.random() - 0.5) * 140;
      b.animate([
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: 'translate(' + drift + 'px,' + fall + 'px) rotate(' + Math.round(Math.random() * 720) + 'deg)' }
      ], { duration: 2400 + Math.random() * 2400, delay: Math.random() * 1500, easing: 'linear', fill: 'both' });
    }
  }

  /* ---------------- screens ---------------- */

  var stack = [];

  function refreshPause() {
    var over = G && st().phase === 'over';
    setPaused(!!G && !over && !el.app.hidden && stack.some(function (id) { return PAUSING[id]; }));
  }

  function openScreen(id) {
    var node = $('#' + id);
    node.hidden = false;
    stack = stack.filter(function (x) { return x !== id; });
    stack.push(id);
    refreshPause();
    var focus = $('.btn-primary:not([hidden])', node) || $('button:not([hidden])', node);
    if (focus) {
      try { focus.focus({ preventScroll: true }); } catch (e) { focus.focus(); }
    }
  }

  function closeScreen(id) {
    $('#' + id).hidden = true;
    stack = stack.filter(function (x) { return x !== id; });
    refreshPause();
  }

  function closeAllScreens() {
    $$('.screen').forEach(function (n) { n.hidden = true; });
    stack = [];
    refreshPause();
  }

  var confirmAction = null;
  function ask(title, text, yes, action) {
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    $('#confirm-yes').textContent = yes;
    confirmAction = action;
    openScreen('screen-confirm');
  }

  function showTitle() {
    epoch += 1;
    G = null;
    busy = false;
    closeAllScreens();
    el.app.hidden = true;
    releaseWake();
    $('#btn-continue').hidden = !loadSave();
    openScreen('screen-title');
  }

  function newGameFromTitle(opts) {
    if (loadSave()) {
      ask('Start a new game?', 'Your saved game will be replaced.', 'Start', function () { startGame(opts); });
    } else {
      startGame(opts);
    }
  }

  function applySeats() {
    el.app.classList.toggle('seats-across', settings.seats === 'across' && !!G && G.mode === '2p');
  }

  function syncChoices() {
    $$('#screen-solo [data-team]').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-team') === settings.soloTeam));
    });
    $$('#screen-solo [data-level]').forEach(function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-level') === settings.soloLevel));
    });
    $$('#screen-settings [data-setting]').forEach(function (b) {
      b.setAttribute('aria-checked', String(settings[b.getAttribute('data-setting')] === b.getAttribute('data-value')));
    });
  }

  function applySound() {
    Sound.setEnabled(settings.sound === 'on');
    el.sound.setAttribute('aria-pressed', String(settings.sound === 'on'));
    el.sound.setAttribute('aria-label', settings.sound === 'on' ? 'Sound is on' : 'Sound is off');
    setIcon(el.sound.querySelector('.ico'), settings.sound === 'on' ? 'soundOn' : 'soundOff');
  }

  /* ---------------- layout ---------------- */

  var sideQuery = window.matchMedia ? window.matchMedia('(orientation: landscape) and (max-height: 560px)') : null;

  function layout() {
    if (el.app.hidden) return;
    var cs = window.getComputedStyle(el.app);
    var innerW = el.app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var innerH = el.app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var gap = parseFloat(cs.rowGap) || 0;
    var topbar = $('.topbar').offsetHeight;
    var w;
    var h;
    if (sideQuery && sideQuery.matches) {
      w = innerW - 2 * Math.min(260, innerW * 0.26) - 2 * (parseFloat(cs.columnGap) || 0);
      h = innerH - topbar - gap;
    } else {
      w = innerW;
      // Keep a little spare room in case a hint wraps onto a third line.
      h = innerH - topbar - docks.top.el.offsetHeight - docks.bottom.el.offsetHeight - 3 * gap - 16;
    }
    var size = Math.floor(Math.min((w - 6) / 8.4, (h - 6) / 11.7));
    size = Math.max(22, Math.min(size, 72));
    if (size !== cell || !el.app.style.getPropertyValue('--cell')) {
      cell = size;
      el.app.style.setProperty('--cell', size + 'px');
      el.app.style.setProperty('--board-w', Math.round(size * 8.4 + 6) + 'px');
    }
  }

  /* ---------------- screen wake lock ---------------- */

  var wakeLock = null;
  function keepAwake() {
    try {
      if (!wakeLock && navigator.wakeLock && document.visibilityState === 'visible') {
        navigator.wakeLock.request('screen').then(function (lock) {
          wakeLock = lock;
          lock.addEventListener('release', function () { wakeLock = null; });
        }).catch(function () { /* not allowed */ });
      }
    } catch (e) { /* not supported */ }
  }
  function releaseWake() {
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ }
    wakeLock = null;
  }

  /* ---------------- events ---------------- */

  function bind() {
    document.addEventListener('pointerdown', function () { Sound.unlock(); }, { passive: true });

    el.grid.addEventListener('click', function (e) {
      var b = e.target.closest('.cell');
      if (b) onCellTap(Number(b.getAttribute('data-r')), Number(b.getAttribute('data-c')));
    });
    el.board.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.board.addEventListener('animationend', function (e) {
      if (e.target === el.board) el.board.classList.remove('shake');
    });

    $('#btn-menu').addEventListener('click', function () {
      Sound.click();
      if (G) openScreen('screen-pause');
    });
    el.sound.addEventListener('click', function () {
      settings.sound = settings.sound === 'on' ? 'off' : 'on';
      saveSettings();
      applySound();
      syncChoices();
      Sound.click();
    });

    $$('[data-close]').forEach(function (b) {
      b.addEventListener('click', function () {
        Sound.click();
        closeScreen(b.closest('.screen').id);
      });
    });

    $('#btn-2p').addEventListener('click', function () {
      Sound.click();
      newGameFromTitle({ mode: '2p' });
    });
    $('#btn-1p').addEventListener('click', function () {
      Sound.click();
      syncChoices();
      openScreen('screen-solo');
    });
    $('#btn-continue').addEventListener('click', function () {
      Sound.click();
      var saved = loadSave();
      if (saved) startGame(saved);
      else showTitle();
    });
    $('#btn-rules').addEventListener('click', function () { Sound.click(); openScreen('screen-rules'); });
    $('#btn-rules-2').addEventListener('click', function () { Sound.click(); openScreen('screen-rules'); });
    $('#btn-settings').addEventListener('click', function () { Sound.click(); syncChoices(); openScreen('screen-settings'); });
    $('#btn-settings-2').addEventListener('click', function () { Sound.click(); syncChoices(); openScreen('screen-settings'); });

    $$('#screen-solo [data-team]').forEach(function (b) {
      b.addEventListener('click', function () {
        Sound.click();
        settings.soloTeam = b.getAttribute('data-team');
        saveSettings();
        syncChoices();
      });
    });
    $$('#screen-solo [data-level]').forEach(function (b) {
      b.addEventListener('click', function () {
        Sound.click();
        settings.soloLevel = b.getAttribute('data-level');
        saveSettings();
        syncChoices();
      });
    });
    $('#btn-solo-start').addEventListener('click', function () {
      Sound.click();
      var opts = { mode: '1p', human: settings.soloTeam, level: settings.soloLevel };
      closeScreen('screen-solo');
      newGameFromTitle(opts);
    });

    $$('#screen-settings [data-setting]').forEach(function (b) {
      b.addEventListener('click', function () {
        settings[b.getAttribute('data-setting')] = b.getAttribute('data-value');
        saveSettings();
        applySound();
        applySeats();
        syncChoices();
        Sound.click();
      });
    });

    $('#btn-restart').addEventListener('click', function () {
      Sound.click();
      ask('Start a new game?', 'This game will end.', 'New game', function () {
        startGame({ mode: G.mode, human: G.human, level: G.level });
      });
    });
    $('#btn-home').addEventListener('click', function () {
      Sound.click();
      showTitle();
    });
    $('#confirm-yes').addEventListener('click', function () {
      Sound.click();
      var action = confirmAction;
      confirmAction = null;
      closeScreen('screen-confirm');
      if (action) action();
    });
    $('#confirm-no').addEventListener('click', function () {
      Sound.click();
      confirmAction = null;
      closeScreen('screen-confirm');
    });

    $('#btn-win-again').addEventListener('click', function () {
      Sound.click();
      startGame({ mode: G.mode, human: G.human, level: G.level });
    });
    $('#btn-win-menu').addEventListener('click', function () {
      Sound.click();
      showTitle();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var top = stack[stack.length - 1];
      if (top && CLOSABLE[top]) closeScreen(top);
      else if (!top && G) openScreen('screen-pause');
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && G && st().phase !== 'over') keepAwake();
    });

    if (window.ResizeObserver) new ResizeObserver(function () { layout(); }).observe(el.app);
    window.addEventListener('resize', layout);
  }

  /* ---------------- start ---------------- */

  function boot(data) {
    paintIcons(document);
    paintArt(document);
    paintScenery();
    applySound();
    syncChoices();
    bind();
    var saved = data && data.save;
    if (saved && (saved.mode === '1p' || saved.mode === '2p') && R.isValidState(saved.state) && saved.state.phase !== 'over') {
      startGame(saved);
    } else {
      showTitle();
    }
  }

  // Keep a game going if this page is updated while it is open (Claude artifact viewer).
  var hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') {
    try {
      hot.snapshot(function () { return G && st().phase !== 'over' ? { save: saveObject() } : {}; });
    } catch (e) { /* not available */ }
  }
  if (hot && typeof hot.ready === 'function') hot.ready(boot);
  else boot((hot && hot.data) || {});

  // Offline play when installed from a web server.
  if (!window.WBR_NO_SW && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    var registerWorker = function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline mode unavailable */ });
    };
    if (document.readyState === 'complete') registerWorker();
    else window.addEventListener('load', registerWorker);
  }
}());
