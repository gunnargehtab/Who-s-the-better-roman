'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rules.js');
const AI = require('../js/ai.js');

function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const die = (rng) => 1 + Math.floor(rng() * 6);

// Play a whole game with the computer on both sides.
function playGame({ seed, purple = 'tricky', blue = 'tricky', battle = 'bonk' }) {
  const rng = seeded(seed);
  const s = R.newGame({ rng, battle });
  R.chooseCommander(s, AI.chooseCommander(s, 'purple', purple, rng));
  R.chooseCommander(s, AI.chooseCommander(s, 'blue', blue, rng));
  while (s.phase === 'rolloff') {
    R.rollOff(s, 'purple', die(rng));
    if (s.phase === 'rolloff') R.rollOff(s, 'blue', die(rng));
  }
  let guard = 0;
  while (s.phase !== 'over') {
    if (++guard > 5000) throw new Error('game never ended');
    R.setRoll(s, die(rng));
    const level = s.turn === 'purple' ? purple : blue;
    const move = AI.chooseMove(s, level, rng);
    if (move) {
      const legal = R.legalMoves(s).some((m) => m.id === move.id && m.to[0] === move.to[0] && m.to[1] === move.to[1]);
      assert.ok(legal, 'the computer only makes legal moves');
      const res = R.applyMove(s, move);
      if (res.type === 'duel') {
        let out = { tie: true };
        while (out.tie) out = R.resolveDuel(s, die(rng), die(rng));
      }
    } else {
      assert.equal(R.legalMoves(s).length, 0, 'the computer only passes when it must');
    }
    if (s.phase !== 'over') R.endTurn(s);
  }
  return s;
}

function setup(first) {
  const s = R.newGame({ shuffleFaces: false });
  R.chooseCommander(s, 'p2');
  R.chooseCommander(s, 'b2');
  R.rollOff(s, 'purple', first === 'purple' ? 6 : 1);
  R.rollOff(s, 'blue', first === 'blue' ? 6 : 1);
  return s;
}

test('both levels take a winning hit on the Commander when they can', () => {
  for (const level of ['easy', 'tricky']) {
    let wins = 0;
    for (let i = 0; i < 40; i++) {
      const s = setup('blue');
      R.getPiece(s, 'b0').r = 4;
      R.getPiece(s, 'b0').c = 3; // 4 squares below Purple's Commander at (0, 3)
      R.setRoll(s, 4);
      const m = AI.chooseMove(s, level, seeded(i + 1));
      if (m.target === 'p2') wins++;
    }
    if (level === 'tricky') assert.equal(wins, 40);
    else assert.ok(wins >= 20, 'easy usually spots it, got ' + wins);
  }
});

test('tricky keeps its Commander out of reach', () => {
  // Blue's Commander can step 2 to the right next to a Purple Roman, or 2 to the left to safety.
  const s = setup('blue');
  s.pieces.forEach((p) => { if (p.team === 'blue' && p.id !== 'b2') p.alive = false; });
  const cmd = R.getPiece(s, 'b2');
  cmd.r = 7;
  cmd.c = 4;
  const p0 = R.getPiece(s, 'p0');
  p0.r = 2;
  p0.c = 6; // 5 squares above (7, 6)
  R.setRoll(s, 2);
  const m = AI.chooseMove(s, 'tricky', seeded(3));
  assert.deepEqual(m.to, [7, 2]);
});

test('threat counts the rolls that can reach a square', () => {
  const s = setup('blue');
  // Blue Romans on row 10 can hit (6, c) with a 4, (5, c) with a 5 and (4, c) with a 6.
  assert.equal(AI.threat(s, 6, 1, 'blue'), 1 / 6);
  assert.equal(AI.threat(s, 9, 1, 'blue'), 0);
});

test('computer-only games always finish with a result', () => {
  const results = { purple: 0, blue: 0, draw: 0 };
  const reasons = {};
  const configs = [
    { purple: 'tricky', blue: 'tricky', battle: 'bonk' },
    { purple: 'easy', blue: 'tricky', battle: 'bonk' },
    { purple: 'tricky', blue: 'easy', battle: 'duel' },
    { purple: 'easy', blue: 'easy', battle: 'duel' }
  ];
  let n = 0;
  for (const cfg of configs) {
    for (let seed = 1; seed <= 60; seed++) {
      const s = playGame({ seed: seed * 7919 + n, ...cfg });
      n++;
      assert.equal(s.phase, 'over');
      results[s.winner || 'draw']++;
      reasons[s.reason] = (reasons[s.reason] || 0) + 1;
    }
  }
  assert.ok(results.purple > 0 && results.blue > 0, JSON.stringify(results));
  assert.ok(reasons.commander > n * 0.5, 'most games end by beating a Commander: ' + JSON.stringify(reasons));
});

test('tricky beats easy most of the time', () => {
  let tricky = 0;
  const games = 120;
  for (let seed = 1; seed <= games; seed++) {
    const trickyTeam = seed % 2 ? 'purple' : 'blue';
    const s = playGame({
      seed: seed * 104729,
      purple: trickyTeam === 'purple' ? 'tricky' : 'easy',
      blue: trickyTeam === 'blue' ? 'tricky' : 'easy'
    });
    if (s.winner === trickyTeam) tricky++;
  }
  assert.ok(tricky > games * 0.6, 'tricky won ' + tricky + ' of ' + games);
});
