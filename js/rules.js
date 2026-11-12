/*
 * Who's the Better Roman? - rules engine.
 *
 * Pure game logic with no DOM access, so it runs in the browser and in Node
 * (see tests/). The UI rolls the dice and passes the numbers in.
 *
 * Rules from the game's designer (the hand-written rules sheet):
 *   - 2 players, Purple vs Blue, each team starts on its own Start row.
 *   - One Roman of each team is the Commander (placed anywhere in the ranks).
 *   - Both roll; the higher roll starts.
 *   - Roll 1-3: move one Roman exactly that many squares left or right.
 *   - Roll 4-6: move one Roman exactly that many squares forward.
 *   - Moving onto an enemy Roman starts a battle: both players roll and the
 *     higher number knocks the other Roman out. A tie means roll again.
 *   - Defeat the other team's Commander to win.
 *
 * House rules that fill gaps in the sheet:
 *   - Romans can't stop on water or the black rock, but may jump over
 *     anything (Romans and terrain) on the way.
 *   - A Roman that would march past the end of the board stops on the last
 *     row and turns around, so "forward" is always the way it is facing.
 *     (Without this, Romans get stranded near the far edge and many games
 *     can never be won.)
 *   - If no Roman can ever reach a Commander again, or nobody battles for
 *     PATIENCE turns in a row, the team with more Romans left wins.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.WBR = root.WBR || {};
    root.WBR.Rules = api;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLS = 8;
  var ROWS = 11;
  var TEAMS = ['purple', 'blue'];
  var TEAM_NAME = { purple: 'Purple', blue: 'Blue' };

  // The board, copied square by square from the hand-drawn original.
  // Row 0 is Purple's Start row (top), row 10 is Blue's Start row (bottom).
  var MAP = [
    'SSSSSSSS',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'GGLLLVGB',
    'GGLWWVGG',
    'BGLWWVGG',
    'BBLLLVOG',
    'BBDDDDOO',
    'BCCCCOOB',
    'SSSSSSSX'
  ];

  var TERRAIN = {
    S: { name: 'start', label: 'Start square' },
    B: { name: 'brick', label: 'Brick road' },
    D: { name: 'darkbrick', label: 'Dark bricks' },
    O: { name: 'clay', label: 'Orange bricks' },
    C: { name: 'stone', label: 'Stone path' },
    G: { name: 'grass', label: 'Grass' },
    L: { name: 'lawn', label: 'Lawn' },
    V: { name: 'lawn2', label: 'Lawn' },
    W: { name: 'water', label: 'Water', blocked: true },
    X: { name: 'rock', label: 'Black rock', blocked: true }
  };

  var HOME_ROW = { purple: 0, blue: ROWS - 1 };
  var FORWARD = { purple: 1, blue: -1 };
  var START_COLS = [1, 2, 3, 4, 5, 6];
  var TEAM_SIZE = START_COLS.length;
  var PATIENCE = 40;

  function enemyOf(team) {
    return team === 'purple' ? 'blue' : 'purple';
  }

  function inBounds(r, c) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS;
  }

  function terrainAt(r, c) {
    return TERRAIN[MAP[r][c]];
  }

  function isBlocked(r, c) {
    return !!TERRAIN[MAP[r][c]].blocked;
  }

  function shuffle(list, rng) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  /**
   * Start a new game. Romans are placed on their Start rows and the game
   * waits for each team to choose a Commander (Purple first).
   * opts.rng: random function used to mix up the dice faces.
   */
  function newGame(opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var pieces = [];
    TEAMS.forEach(function (team) {
      var faces = opts.shuffleFaces === false ? [1, 2, 3, 4, 5, 6] : shuffle([1, 2, 3, 4, 5, 6], rng);
      START_COLS.forEach(function (c, i) {
        pieces.push({
          id: team.charAt(0) + i,
          team: team,
          face: faces[i],
          r: HOME_ROW[team],
          c: c,
          commander: false,
          alive: true,
          dir: FORWARD[team] // which way this Roman marches: +1 down, -1 up
        });
      });
    });
    return {
      v: 1,
      pieces: pieces,
      phase: 'commander', // commander -> rolloff -> roll -> move -> (duel) -> moved -> ... -> over
      turn: 'purple',
      rolloff: { purple: 0, blue: 0 },
      roll: 0,
      duel: null,
      battled: false,
      turns: 0,
      calm: 0,
      winner: null,
      reason: null
    };
  }

  function getPiece(state, id) {
    for (var i = 0; i < state.pieces.length; i++) {
      if (state.pieces[i].id === id) return state.pieces[i];
    }
    return null;
  }

  function pieceAt(state, r, c) {
    for (var i = 0; i < state.pieces.length; i++) {
      var p = state.pieces[i];
      if (p.alive && p.r === r && p.c === c) return p;
    }
    return null;
  }

  function teamPieces(state, team) {
    return state.pieces.filter(function (p) { return p.team === team && p.alive; });
  }

  function aliveCount(state, team) {
    return teamPieces(state, team).length;
  }

  function commanderOf(state, team) {
    for (var i = 0; i < state.pieces.length; i++) {
      var p = state.pieces[i];
      if (p.team === team && p.commander && p.alive) return p;
    }
    return null;
  }

  function hasCommander(state, team) {
    return state.pieces.some(function (p) { return p.team === team && p.commander; });
  }

  /** Make a Roman its team's Commander. Purple chooses first, then Blue. */
  function chooseCommander(state, id) {
    if (state.phase !== 'commander') throw new Error('Commanders are already chosen');
    var p = getPiece(state, id);
    if (!p || !p.alive) throw new Error('No such Roman: ' + id);
    if (p.team !== state.turn) throw new Error('It is ' + state.turn + "'s turn to choose");
    state.pieces.forEach(function (q) {
      if (q.team === p.team) q.commander = false;
    });
    p.commander = true;
    var other = enemyOf(p.team);
    if (hasCommander(state, other)) {
      state.phase = 'rolloff';
      state.turn = null;
    } else {
      state.turn = other;
    }
    return p;
  }

  /**
   * Opening roll: both teams roll, the higher roll starts. A tie clears both
   * rolls so they can roll again.
   */
  function rollOff(state, team, value) {
    if (state.phase !== 'rolloff') throw new Error('Not rolling to start');
    checkDie(value);
    if (state.rolloff[team]) throw new Error(team + ' already rolled');
    state.rolloff[team] = value;
    var a = state.rolloff.purple;
    var b = state.rolloff.blue;
    if (!a || !b) return { done: false, tie: false, purple: a, blue: b };
    if (a === b) {
      state.rolloff = { purple: 0, blue: 0 };
      return { done: false, tie: true, purple: a, blue: b };
    }
    state.turn = a > b ? 'purple' : 'blue';
    state.phase = 'roll';
    return { done: true, tie: false, first: state.turn, purple: a, blue: b };
  }

  function checkDie(value) {
    if (value !== Math.floor(value) || value < 1 || value > 6) throw new Error('Bad dice roll: ' + value);
  }

  /** 1-3 moves sideways, 4-6 moves forward. */
  function rollKind(roll) {
    return roll <= 3 ? 'side' : 'forward';
  }

  function clampRow(r) {
    return Math.max(0, Math.min(ROWS - 1, r));
  }

  /** Where a forward march of `roll` squares ends: the last row if it would go past it. */
  function marchRow(r, dir, roll) {
    return clampRow(r + dir * roll);
  }

  /** A Roman that marches onto the end of the board turns around. */
  function turnsAround(r, dir) {
    return (dir < 0 && r === 0) || (dir > 0 && r === ROWS - 1);
  }

  /** Every move one Roman can make with this roll. */
  function movesForPiece(state, p, roll) {
    var out = [];
    if (!p || !p.alive) return out;
    var dirs = roll <= 3
      ? [['left', 0, -1], ['right', 0, 1]]
      : [['forward', p.dir, 0]];
    dirs.forEach(function (d) {
      var r = d[0] === 'forward' ? marchRow(p.r, d[1], roll) : p.r;
      var c = p.c + d[2] * roll;
      var steps = Math.abs(r - p.r) + Math.abs(c - p.c);
      if (!steps || !inBounds(r, c) || isBlocked(r, c)) return;
      var other = pieceAt(state, r, c);
      if (other && other.team === p.team) return;
      var path = [];
      for (var i = 1; i <= steps; i++) path.push([p.r + d[1] * i, p.c + d[2] * i]);
      out.push({
        id: p.id,
        from: [p.r, p.c],
        to: [r, c],
        dir: d[0],
        steps: steps,
        path: path,
        target: other ? other.id : null,
        turn: d[0] === 'forward' && turnsAround(r, p.dir)
      });
    });
    return out;
  }

  /** All legal moves for a team (default: the team whose turn it is). */
  function legalMoves(state, team, roll) {
    team = team || state.turn;
    roll = roll || state.roll;
    if (!roll) return [];
    var out = [];
    teamPieces(state, team).forEach(function (p) {
      out = out.concat(movesForPiece(state, p, roll));
    });
    return out;
  }

  /** Record the current player's roll and return the moves it allows. */
  function setRoll(state, value) {
    if (state.phase !== 'roll') throw new Error('Not time to roll');
    checkDie(value);
    state.roll = value;
    state.phase = 'move';
    return legalMoves(state);
  }

  function sameMove(a, b) {
    return a.id === b.id && a.to[0] === b.to[0] && a.to[1] === b.to[1];
  }

  /**
   * Make a move. Returns what happened:
   *   { type: 'move', id, turned: bool }
   *   { type: 'duel', attacker, defender }  (landed on an enemy: call resolveDuel next)
   */
  function applyMove(state, move) {
    if (state.phase !== 'move') throw new Error('Not time to move');
    var legal = legalMoves(state).filter(function (m) { return sameMove(m, move); })[0];
    if (!legal) throw new Error('That move is not allowed');
    var p = getPiece(state, legal.id);
    var target = legal.target ? getPiece(state, legal.target) : null;

    if (target) {
      state.phase = 'duel';
      state.duel = { attacker: p.id, defender: target.id, to: legal.to.slice(), turn: legal.turn };
      return { type: 'duel', attacker: p.id, defender: target.id };
    }

    p.r = legal.to[0];
    p.c = legal.to[1];
    if (legal.turn) p.dir = -p.dir;
    state.phase = 'moved';
    return { type: 'move', id: p.id, turned: legal.turn };
  }

  /**
   * Battle: both players roll, the higher number wins and the other Roman is
   * out. The winning attacker takes the square. A tie means roll again
   * (returns { tie: true }).
   */
  function resolveDuel(state, attackerRoll, defenderRoll) {
    if (state.phase !== 'duel' || !state.duel) throw new Error('No battle to resolve');
    checkDie(attackerRoll);
    checkDie(defenderRoll);
    if (attackerRoll === defenderRoll) return { tie: true };
    var att = getPiece(state, state.duel.attacker);
    var def = getPiece(state, state.duel.defender);
    var res = { tie: false, winnerId: null, loserId: null, win: false };
    state.battled = true;
    if (attackerRoll > defenderRoll) {
      def.alive = false;
      att.r = state.duel.to[0];
      att.c = state.duel.to[1];
      if (state.duel.turn) att.dir = -att.dir;
      res.turned = !!state.duel.turn;
      res.winnerId = att.id;
      res.loserId = def.id;
      if (def.commander) {
        finish(state, att.team, 'commander');
        res.win = true;
      }
    } else {
      att.alive = false;
      res.winnerId = def.id;
      res.loserId = att.id;
      if (att.commander) {
        finish(state, def.team, 'commander');
        res.win = true;
      }
    }
    state.duel = null;
    if (state.phase !== 'over') state.phase = 'moved';
    return res;
  }

  function finish(state, winner, reason) {
    state.winner = winner;
    state.reason = reason;
    state.phase = 'over';
    state.duel = null;
  }

  function finishByCount(state, why) {
    var a = aliveCount(state, 'purple');
    var b = aliveCount(state, 'blue');
    if (a === b) finish(state, null, why);
    else finish(state, a > b ? 'purple' : 'blue', why);
  }

  // Squares a Roman marching in direction `dir` could ever stand on from
  // (r, c), ignoring other Romans. Includes the starting square.
  var reachCache = {};
  function reach(dir, r, c) {
    var key = dir + ':' + r + ',' + c;
    if (reachCache[key]) return reachCache[key];
    var squares = {};
    var seen = {};
    squares[r * COLS + c] = true;
    seen[dir + ':' + (r * COLS + c)] = true;
    var queue = [[r, c, dir]];
    while (queue.length) {
      var cur = queue.shift();
      for (var n = 1; n <= 6; n++) {
        var dests = [];
        if (n <= 3) {
          dests = [[cur[0], cur[1] - n, cur[2]], [cur[0], cur[1] + n, cur[2]]];
        } else {
          var rr = marchRow(cur[0], cur[2], n);
          if (rr !== cur[0]) dests = [[rr, cur[1], turnsAround(rr, cur[2]) ? -cur[2] : cur[2]]];
        }
        for (var i = 0; i < dests.length; i++) {
          var d = dests[i];
          if (!inBounds(d[0], d[1]) || isBlocked(d[0], d[1])) continue;
          var k = d[2] + ':' + (d[0] * COLS + d[1]);
          if (seen[k]) continue;
          seen[k] = true;
          squares[d[0] * COLS + d[1]] = true;
          queue.push(d);
        }
      }
    }
    reachCache[key] = squares;
    return squares;
  }

  /**
   * Can a Commander still ever be part of a battle? If not, nobody can win
   * the normal way and the game is stuck.
   */
  function commanderBattlePossible(state) {
    for (var t = 0; t < TEAMS.length; t++) {
      var team = TEAMS[t];
      var cmd = commanderOf(state, enemyOf(team));
      if (!cmd) continue;
      var cmdReach = reach(cmd.dir, cmd.r, cmd.c);
      var mine = teamPieces(state, team);
      for (var i = 0; i < mine.length; i++) {
        var pr = reach(mine[i].dir, mine[i].r, mine[i].c);
        for (var k in pr) {
          if (cmdReach[k]) return true;
        }
      }
    }
    return false;
  }

  /**
   * Finish the current turn (after a move, or when no move was possible)
   * and hand the dice to the other team.
   */
  function endTurn(state) {
    if (state.phase === 'over') return { over: true };
    if (state.phase !== 'moved' && state.phase !== 'move') throw new Error('Cannot end the turn now');
    if (state.phase === 'move' && legalMoves(state).length) throw new Error('A move is still possible');
    state.calm = state.battled ? 0 : state.calm + 1;
    state.battled = false;
    state.turns += 1;
    state.roll = 0;
    if (!commanderBattlePossible(state)) {
      finishByCount(state, 'stuck');
      return { over: true };
    }
    if (state.calm >= PATIENCE) {
      finishByCount(state, 'patience');
      return { over: true };
    }
    state.turn = enemyOf(state.turn);
    state.phase = 'roll';
    return { over: false, turn: state.turn };
  }

  /** Turns left before the Emperor ends a game with no battles. */
  function patienceLeft(state) {
    return PATIENCE - state.calm;
  }

  /** Light check that a saved game is usable. */
  function isValidState(s) {
    if (!s || s.v !== 1 || !Array.isArray(s.pieces) || s.pieces.length !== TEAM_SIZE * 2) return false;
    var phases = ['commander', 'rolloff', 'roll', 'move', 'duel', 'moved', 'over'];
    if (phases.indexOf(s.phase) < 0) return false;
    return s.pieces.every(function (p) {
      return p && TEAMS.indexOf(p.team) >= 0 && inBounds(p.r, p.c) && p.face >= 1 && p.face <= 6 &&
        (p.dir === 1 || p.dir === -1);
    });
  }

  return {
    COLS: COLS,
    ROWS: ROWS,
    TEAMS: TEAMS,
    TEAM_NAME: TEAM_NAME,
    MAP: MAP,
    TERRAIN: TERRAIN,
    HOME_ROW: HOME_ROW,
    FORWARD: FORWARD,
    START_COLS: START_COLS,
    TEAM_SIZE: TEAM_SIZE,
    PATIENCE: PATIENCE,
    enemyOf: enemyOf,
    inBounds: inBounds,
    terrainAt: terrainAt,
    isBlocked: isBlocked,
    clone: clone,
    newGame: newGame,
    getPiece: getPiece,
    pieceAt: pieceAt,
    teamPieces: teamPieces,
    aliveCount: aliveCount,
    commanderOf: commanderOf,
    chooseCommander: chooseCommander,
    rollOff: rollOff,
    rollKind: rollKind,
    marchRow: marchRow,
    movesForPiece: movesForPiece,
    legalMoves: legalMoves,
    setRoll: setRoll,
    applyMove: applyMove,
    resolveDuel: resolveDuel,
    endTurn: endTurn,
    commanderBattlePossible: commanderBattlePossible,
    patienceLeft: patienceLeft,
    isValidState: isValidState
  };
}));
