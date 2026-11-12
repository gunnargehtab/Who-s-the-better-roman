/*
 * Who's the Better Roman? - computer opponent.
 *
 * "easy"   mostly picks random moves, but usually attacks a Commander it can reach.
 * "tricky" looks one turn ahead: it hunts the enemy Commander, keeps its own
 *          Commander out of reach and avoids leaving Romans where they can be hit.
 *
 * Every attack is a dice battle that the attacker wins half the time, so it
 * weighs what it could win against the Roman it could lose.
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var api = factory(isNode ? require('./rules.js') : root.WBR.Rules);
  if (isNode) {
    module.exports = api;
  } else {
    root.WBR = root.WBR || {};
    root.WBR.AI = api;
  }
}(typeof self !== 'undefined' ? self : this, function (R) {
  'use strict';

  var COMMANDER_VALUE = 1000;
  var SOLDIER_VALUE = 10;

  function value(p) {
    return p.commander ? COMMANDER_VALUE : SOLDIER_VALUE;
  }

  // Can Roman p land exactly on (r, c) with this roll?
  function canLand(p, r, c, roll) {
    if (roll <= 3) return p.r === r && Math.abs(p.c - c) === roll;
    var to = R.marchRow(p.r, p.dir, roll);
    return p.c === c && to !== p.r && to === r;
  }

  /** Chance (0..1) that `byTeam` can land on square (r, c) with its next roll. */
  function threat(state, r, c, byTeam) {
    var attackers = R.teamPieces(state, byTeam);
    var hits = 0;
    for (var roll = 1; roll <= 6; roll++) {
      for (var i = 0; i < attackers.length; i++) {
        if (canLand(attackers[i], r, c, roll)) {
          hits++;
          break;
        }
      }
    }
    return hits / 6;
  }

  function scoreMove(state, m, rng) {
    var me = state.turn;
    var foe = R.enemyOf(me);
    var p = R.getPiece(state, m.id);
    var target = m.target ? R.getPiece(state, m.target) : null;
    var score = 0;

    if (target) score += 0.5 * value(target) - 0.5 * value(p);

    // Look at the board after the move (assume the hit works).
    var sim = R.clone(state);
    var sp = R.getPiece(sim, m.id);
    if (target) R.getPiece(sim, target.id).alive = false;
    sp.r = m.to[0];
    sp.c = m.to[1];

    var danger = 0.5; // an attacker only wins half of its battles
    var myCmd = R.commanderOf(sim, me);
    if (myCmd) score -= threat(sim, myCmd.r, myCmd.c, foe) * COMMANDER_VALUE * 0.8 * danger;
    if (!sp.commander) score -= threat(sim, sp.r, sp.c, foe) * SOLDIER_VALUE * danger;

    var foeCmd = R.commanderOf(sim, foe);
    if (foeCmd) score += threat(sim, foeCmd.r, foeCmd.c, me) * 120;

    if (m.dir === 'forward' && !p.commander) score += 1 + m.steps * 0.2;
    if (p.commander && !target) score -= 3;

    return score + rng() * 1.5;
  }

  /** Pick a move for the team whose turn it is (after setRoll). */
  function chooseMove(state, level, rng) {
    rng = rng || Math.random;
    var moves = R.legalMoves(state);
    if (!moves.length) return null;

    if (level === 'easy') {
      var wins = moves.filter(function (m) {
        return m.target && R.getPiece(state, m.target).commander;
      });
      if (wins.length && rng() < 0.75) return wins[0];
      var hits = moves.filter(function (m) { return m.target; });
      if (hits.length && rng() < 0.5) return hits[Math.floor(rng() * hits.length)];
      return moves[Math.floor(rng() * moves.length)];
    }

    var best = null;
    var bestScore = -Infinity;
    moves.forEach(function (m) {
      var s = scoreMove(state, m, rng);
      if (s > bestScore) {
        bestScore = s;
        best = m;
      }
    });
    return best;
  }

  /** Pick which Roman becomes the Commander. */
  function chooseCommander(state, team, level, rng) {
    rng = rng || Math.random;
    var mine = R.teamPieces(state, team);
    if (level === 'tricky') {
      // The water in the middle makes the centre a little safer.
      var middle = mine.filter(function (p) { return p.c === 3 || p.c === 4; });
      if (middle.length) mine = middle;
    }
    return mine[Math.floor(rng() * mine.length)].id;
  }

  return {
    chooseMove: chooseMove,
    chooseCommander: chooseCommander,
    threat: threat
  };
}));
