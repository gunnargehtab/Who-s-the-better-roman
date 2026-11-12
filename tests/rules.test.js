'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../js/rules.js');

// A game that is ready to play: both Commanders chosen, `first` to roll.
function readyGame(opts = {}) {
  const s = R.newGame({ shuffleFaces: false, battle: opts.battle });
  R.chooseCommander(s, opts.purpleCommander || 'p2');
  R.chooseCommander(s, opts.blueCommander || 'b2');
  const first = opts.first || 'blue';
  R.rollOff(s, 'purple', first === 'purple' ? 6 : 1);
  R.rollOff(s, 'blue', first === 'blue' ? 6 : 1);
  return s;
}

// Put a Roman somewhere for a test scenario.
function put(s, id, r, c) {
  const p = R.getPiece(s, id);
  p.r = r;
  p.c = c;
  return p;
}

test('board matches the hand-drawn original', () => {
  assert.equal(R.MAP.length, 11);
  R.MAP.forEach((row) => assert.equal(row.length, 8));
  assert.equal(R.MAP[0], 'SSSSSSSS');
  assert.equal(R.MAP[10], 'SSSSSSSX');
  assert.ok(R.isBlocked(5, 3) && R.isBlocked(5, 4) && R.isBlocked(6, 3) && R.isBlocked(6, 4), 'pond in the middle');
  assert.ok(R.isBlocked(10, 7), 'black rock in the corner');
  assert.equal(R.terrainAt(9, 2).name, 'stone');
});

test('new game puts 6 Romans per team on their Start rows', () => {
  const s = R.newGame();
  assert.equal(s.phase, 'commander');
  assert.equal(s.turn, 'purple');
  for (const team of R.TEAMS) {
    const mine = s.pieces.filter((p) => p.team === team);
    assert.equal(mine.length, 6);
    assert.deepEqual(mine.map((p) => p.face).sort(), [1, 2, 3, 4, 5, 6]);
    mine.forEach((p) => {
      assert.equal(p.r, R.HOME_ROW[team]);
      assert.ok(!R.isBlocked(p.r, p.c));
    });
  }
});

test('Purple picks a Commander first, then Blue, then the roll-off', () => {
  const s = R.newGame();
  assert.throws(() => R.chooseCommander(s, 'b0'), /purple/);
  R.chooseCommander(s, 'p4');
  assert.equal(s.turn, 'blue');
  R.chooseCommander(s, 'b1');
  assert.equal(s.phase, 'rolloff');
  assert.ok(R.getPiece(s, 'p4').commander);
  assert.ok(R.getPiece(s, 'b1').commander);
  assert.equal(s.pieces.filter((p) => p.commander).length, 2);
});

test('roll-off: higher roll starts, a tie rolls again', () => {
  const s = R.newGame();
  R.chooseCommander(s, 'p0');
  R.chooseCommander(s, 'b0');
  assert.deepEqual(R.rollOff(s, 'purple', 4), { done: false, tie: false, purple: 4, blue: 0 });
  assert.throws(() => R.rollOff(s, 'purple', 5), /already rolled/);
  const tie = R.rollOff(s, 'blue', 4);
  assert.equal(tie.tie, true);
  assert.deepEqual(s.rolloff, { purple: 0, blue: 0 });
  R.rollOff(s, 'purple', 2);
  const done = R.rollOff(s, 'blue', 5);
  assert.equal(done.first, 'blue');
  assert.equal(s.turn, 'blue');
  assert.equal(s.phase, 'roll');
});

test('rolls 1-3 move sideways, rolls 4-6 move forward', () => {
  const s = readyGame({ first: 'blue' });
  const b0 = R.getPiece(s, 'b0'); // row 10, column 1
  const side = R.movesForPiece(s, b0, 1);
  assert.deepEqual(side.map((m) => m.to), [[10, 0]], 'right is blocked by a team mate, left is free');
  assert.equal(side[0].dir, 'left');
  const forward = R.movesForPiece(s, b0, 4);
  assert.deepEqual(forward.map((m) => m.to), [[6, 1]]);
  assert.equal(forward[0].path.length, 4);

  const p5 = R.getPiece(s, 'p5'); // row 0, column 6: Purple marches down
  assert.deepEqual(R.movesForPiece(s, p5, 5).map((m) => m.to), [[5, 6]]);
  assert.deepEqual(R.movesForPiece(s, p5, 1).map((m) => m.to), [[0, 7]], 'left is a team mate');
  assert.equal(R.movesForPiece(s, p5, 2).length, 0, 'left is a team mate, right is off the board');
});

test('sideways moves must stay on the board', () => {
  const s = readyGame();
  const p = put(s, 'b3', 2, 0);
  assert.deepEqual(R.movesForPiece(s, p, 2).map((m) => m.to), [[2, 2]], 'only right fits');
});

test('marching past the end of the board stops on the last row and turns around', () => {
  const s = readyGame({ first: 'blue' });
  const p = put(s, 'b3', 2, 0);
  const [m] = R.movesForPiece(s, p, 5);
  assert.deepEqual(m.to, [0, 0]);
  assert.equal(m.steps, 2);
  assert.equal(m.path.length, 2);
  assert.equal(m.turn, true);
  R.setRoll(s, 5);
  const res = R.applyMove(s, m);
  assert.equal(res.turned, true);
  assert.equal(p.dir, 1, 'now marching back down');
  R.endTurn(s);
  R.setRoll(s, 4); // Purple's turn, any move
  R.applyMove(s, R.legalMoves(s)[0]);
  R.endTurn(s);
  R.setRoll(s, 6);
  const back = R.legalMoves(s).find((x) => x.id === 'b3');
  assert.deepEqual(back.to, [6, 0], 'forward is now down the board');
  assert.equal(back.turn, false);

  // Marching all the way home turns it around again.
  const home = put(s, 'b4', 7, 0); // column 0 of Blue's Start row is empty
  home.dir = 1;
  const [h] = R.movesForPiece(s, home, 6);
  assert.deepEqual(h.to, [10, 0]);
  assert.equal(h.turn, true);
});

test("Romans can't stop on water or the black rock but can jump over them", () => {
  const s = readyGame();
  const p = put(s, 'b2', 10, 3); // column 3 has the pond in rows 5 and 6
  assert.equal(R.movesForPiece(s, p, 4).length, 0, 'row 6 is water');
  assert.equal(R.movesForPiece(s, p, 5).length, 0, 'row 5 is water');
  assert.deepEqual(R.movesForPiece(s, p, 6).map((m) => m.to), [[4, 3]], 'jumps over the pond');

  R.getPiece(s, 'b4').alive = false; // free the square left of b5
  const q = R.getPiece(s, 'b5'); // row 10, column 6, next to the black rock
  assert.deepEqual(R.movesForPiece(s, q, 1).map((m) => m.to), [[10, 5]], 'the rock at column 7 is off limits');
});

test('Romans jump over other Romans but never land on a team mate', () => {
  const s = readyGame();
  // b1 at (10,2); a 2-step move left from (10,2) lands on (10,0), jumping over b0 at (10,1)
  const b1 = R.getPiece(s, 'b1');
  assert.deepEqual(R.movesForPiece(s, b1, 2).map((m) => m.to), [[10, 0]]);
  // b2 at (10,3) moving 1 either way would land on a team mate
  assert.equal(R.movesForPiece(s, R.getPiece(s, 'b2'), 1).length, 0);
});

test('landing on an enemy knocks it out (bonk)', () => {
  const s = readyGame({ first: 'blue' });
  put(s, 'b0', 6, 1);
  put(s, 'p0', 2, 1);
  R.setRoll(s, 4);
  const move = R.legalMoves(s).find((m) => m.id === 'b0');
  assert.equal(move.target, 'p0');
  const res = R.applyMove(s, move);
  assert.equal(res.captured, 'p0');
  assert.equal(R.getPiece(s, 'p0').alive, false);
  assert.deepEqual([R.getPiece(s, 'b0').r, R.getPiece(s, 'b0').c], [2, 1]);
  assert.equal(R.aliveCount(s, 'purple'), 5);
  R.endTurn(s);
  assert.equal(s.turn, 'purple');
  assert.equal(s.calm, 0);
});

test('knocking out the Commander wins the game', () => {
  const s = readyGame({ first: 'blue', purpleCommander: 'p3' });
  const cmd = R.getPiece(s, 'p3'); // row 0, column 4
  put(s, 'b3', 4, 4);
  R.setRoll(s, 4);
  const move = R.legalMoves(s).find((m) => m.target === cmd.id);
  assert.ok(move, 'b3 can reach the Commander');
  const res = R.applyMove(s, move);
  assert.equal(res.win, true);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 'blue');
  assert.equal(s.reason, 'commander');
  assert.deepEqual(R.endTurn(s), { over: true });
});

test('illegal moves are refused', () => {
  const s = readyGame({ first: 'blue' });
  R.setRoll(s, 4);
  assert.throws(() => R.applyMove(s, { id: 'b0', to: [5, 1] }), /not allowed/);
  assert.throws(() => R.applyMove(s, { id: 'p0', to: [4, 1] }), /not allowed/);
  assert.throws(() => R.setRoll(s, 3), /Not time to roll/);
  assert.throws(() => R.setRoll(readyGame(), 7), /Bad dice roll/);
});

test('a turn with no possible move passes to the other team', () => {
  const t = readyGame({ first: 'blue' });
  // Blue's last two Romans stand below the pond, so a 5 would land in the water.
  t.pieces.forEach((p) => { if (p.team === 'blue' && p.id !== 'b2' && p.id !== 'b3') p.alive = false; });
  R.setRoll(t, 5);
  assert.equal(R.legalMoves(t).length, 0);
  assert.throws(() => R.applyMove(t, { id: 'b2', to: [5, 3] }), /not allowed/);
  assert.equal(R.endTurn(t).turn, 'purple');
  assert.equal(t.phase, 'roll');
});

test('a Roman may not end its turn early when it can move', () => {
  const s = readyGame({ first: 'blue' });
  R.setRoll(s, 4);
  assert.throws(() => R.endTurn(s), /still possible/);
});

test('dice duel: higher roll wins, a tie rolls again, losing attacker is out', () => {
  const s = readyGame({ battle: 'duel', first: 'blue' });
  put(s, 'b0', 6, 1);
  put(s, 'p0', 2, 1);
  R.setRoll(s, 4);
  const move = R.legalMoves(s).find((m) => m.id === 'b0');
  const res = R.applyMove(s, move);
  assert.equal(res.type, 'duel');
  assert.equal(s.phase, 'duel');
  assert.deepEqual(R.resolveDuel(s, 3, 3), { tie: true });
  const out = R.resolveDuel(s, 2, 5);
  assert.equal(out.loserId, 'b0');
  assert.equal(R.getPiece(s, 'b0').alive, false);
  assert.equal(R.getPiece(s, 'p0').alive, true);
  assert.equal(s.phase, 'moved');

  const t = readyGame({ battle: 'duel', first: 'blue', purpleCommander: 'p0' });
  put(t, 'b0', 6, 1);
  put(t, 'p0', 2, 1);
  R.setRoll(t, 4);
  R.applyMove(t, R.legalMoves(t).find((m) => m.id === 'b0'));
  const win = R.resolveDuel(t, 6, 1);
  assert.equal(win.win, true);
  assert.equal(t.winner, 'blue');
  assert.deepEqual([R.getPiece(t, 'b0').r, R.getPiece(t, 'b0').c], [2, 1]);
});

test('a Commander that attacks and loses a duel loses the game', () => {
  const s = readyGame({ battle: 'duel', first: 'blue', blueCommander: 'b0' });
  put(s, 'b0', 6, 1);
  put(s, 'p0', 2, 1);
  R.setRoll(s, 4);
  R.applyMove(s, R.legalMoves(s).find((m) => m.id === 'b0'));
  R.resolveDuel(s, 1, 2);
  assert.equal(s.winner, 'purple');
  assert.equal(s.phase, 'over');
});

test('Romans that marched past a Commander can still turn around and reach it', () => {
  const s = readyGame({ first: 'blue', purpleCommander: 'p0', blueCommander: 'b0' });
  s.pieces.forEach((p) => {
    if (!['p0', 'p1', 'b0', 'b1'].includes(p.id)) p.alive = false;
  });
  put(s, 'p0', 9, 0); // Purple Commander deep in Blue's half
  put(s, 'b1', 1, 5); // Blue Roman far above it
  put(s, 'b0', 0, 7); // Blue Commander on Purple's Start row
  put(s, 'p1', 9, 6); // Purple Roman that already passed Blue's Commander
  assert.equal(R.commanderBattlePossible(s), true);
  s.phase = 'moved';
  assert.equal(R.endTurn(s).over, false);
});

test('the Emperor ends a game with no battles for too long', () => {
  const s = readyGame({ first: 'blue' });
  s.calm = R.PATIENCE - 1;
  s.phase = 'moved';
  R.getPiece(s, 'p5').alive = false;
  assert.deepEqual(R.endTurn(s), { over: true });
  assert.equal(s.reason, 'patience');
  assert.equal(s.winner, 'blue');
});

test('a winning duel attacker that reaches the edge turns around', () => {
  const s = readyGame({ battle: 'duel', first: 'blue', purpleCommander: 'p5' });
  put(s, 'b0', 4, 1); // p0 waits on Purple's Start row at (0, 1)
  R.setRoll(s, 4);
  const m = R.legalMoves(s).find((x) => x.id === 'b0');
  assert.equal(m.turn, true);
  R.applyMove(s, m);
  const res = R.resolveDuel(s, 5, 2);
  assert.equal(res.turned, true);
  assert.equal(R.getPiece(s, 'b0').dir, 1);
});

test('saved games are checked before use', () => {
  const s = readyGame();
  assert.ok(R.isValidState(R.clone(s)));
  assert.equal(R.isValidState(null), false);
  assert.equal(R.isValidState({ v: 1, pieces: [] }), false);
  const bad = R.clone(s);
  bad.pieces[0].r = 99;
  assert.equal(R.isValidState(bad), false);
  const noDir = R.clone(s);
  delete noDir.pieces[3].dir;
  assert.equal(R.isValidState(noDir), false);
});
