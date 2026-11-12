/*
 * Who's the Better Roman? - pixel art.
 *
 * Every texture and sprite is drawn here, pixel by pixel, on tiny canvases
 * and handed to the page as PNG data URLs. CSS scales them up with
 * `image-rendering: pixelated` for the chunky block look.
 * The Romans follow the original cardboard pieces: dice heads wearing
 * helmets with a red crest and a yellow brow band.
 */
(function (root) {
  'use strict';

  var WBR = root.WBR = root.WBR || {};

  var OUT = '#21171f';
  var GOLD = '#f4c430';
  var GOLD_D = '#b88412';
  var GOLD_L = '#ffe58a';
  var RED = '#d8382c';
  var RED_D = '#a12218';
  var RED_L = '#f36b5c';
  var FACE = '#fbf8f0';
  var FACE_S = '#d8d1c3';
  var PIP = '#1c1720';

  var TEAM = {
    purple: { main: '#5d2f95', dark: '#3a1a64', light: '#8c5ccc', shine: '#b994ea' },
    blue: { main: '#3a92e6', dark: '#2061ad', light: '#79bdf7', shine: '#bfe2ff' }
  };

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function painter(canvas) {
    var g = canvas.getContext('2d');
    return function (x, y, w, h, color) {
      g.fillStyle = color;
      g.fillRect(x, y, w, h);
    };
  }

  function pick(rand, list) {
    return list[Math.floor(rand() * list.length)];
  }

  var cache = {};
  function cached(key, make) {
    if (!cache[key]) cache[key] = make();
    return cache[key];
  }

  // Draw a picture given as rows of characters; `colors` maps char -> color.
  function drawMap(rect, rows, colors, ox, oy) {
    for (var y = 0; y < rows.length; y++) {
      for (var x = 0; x < rows[y].length; x++) {
        var col = colors[rows[y][x]];
        if (col) rect((ox || 0) + x, (oy || 0) + y, 1, 1, col);
      }
    }
  }

  // Add a 1px dark outline around everything already drawn.
  function outline(canvas, color) {
    var g = canvas.getContext('2d');
    var w = canvas.width;
    var h = canvas.height;
    var img = g.getImageData(0, 0, w, h);
    var d = img.data;
    var solid = function (x, y) {
      return x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
    };
    var edge = [];
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) {
          edge.push([x, y]);
        }
      }
    }
    g.fillStyle = color || OUT;
    edge.forEach(function (p) { g.fillRect(p[0], p[1], 1, 1); });
    return canvas;
  }

  /* ------------------------------------------------------------------ */
  /* Board tiles (16 x 16)                                               */
  /* ------------------------------------------------------------------ */

  var T = 16;

  function noiseFill(rect, rand, palette, weights) {
    for (var y = 0; y < T; y++) {
      for (var x = 0; x < T; x++) {
        var v = rand();
        var acc = 0;
        for (var i = 0; i < palette.length; i++) {
          acc += weights[i];
          if (v < acc || i === palette.length - 1) {
            rect(x, y, 1, 1, palette[i]);
            break;
          }
        }
      }
    }
  }

  function tileGrass(seed) {
    var c = makeCanvas(T, T);
    var rect = painter(c);
    var rand = mulberry32(seed);
    noiseFill(rect, rand, ['#4cae3a', '#43a033', '#59bb45', '#3b9230', '#6acb52'], [0.42, 0.24, 0.17, 0.1, 0.07]);
    for (var i = 0; i < 7; i++) {
      var x = Math.floor(rand() * T);
      var y = 1 + Math.floor(rand() * (T - 2));
      rect(x, y, 1, 1, '#357f2a');
      rect(x, y - 1, 1, 1, '#76d35c');
    }
    return c;
  }

  // The light green lawn was shaded in pencil, so it gets stroke marks.
  function tileLawn(seed, vertical) {
    var c = makeCanvas(T, T);
    var rect = painter(c);
    var rand = mulberry32(seed);
    var cols = ['#a8d977', '#b7e08a', '#9acf68', '#c6e8a2', '#8fc75c'];
    for (var line = 0; line < T; line++) {
      var pos = 0;
      while (pos < T) {
        var len = 2 + Math.floor(rand() * 6);
        var col = pick(rand, cols);
        for (var k = pos; k < Math.min(T, pos + len); k++) {
          if (vertical) rect(line, k, 1, 1, col);
          else rect(k, line, 1, 1, col);
        }
        pos += len;
      }
    }
    if (rand() < 0.35) {
      var fx = 2 + Math.floor(rand() * 11);
      var fy = 2 + Math.floor(rand() * 11);
      var petal = rand() < 0.5 ? '#ffffff' : '#ffd84a';
      rect(fx, fy - 1, 1, 1, petal);
      rect(fx - 1, fy, 1, 1, petal);
      rect(fx + 1, fy, 1, 1, petal);
      rect(fx, fy + 1, 1, 1, petal);
      rect(fx, fy, 1, 1, petal === '#ffffff' ? '#f2b630' : '#e0782a');
    }
    return c;
  }

  // Running-bond bricks drawn on pale paper mortar, like the pencil bricks.
  function tileBrick(seed, pal) {
    var c = makeCanvas(T, T);
    var rect = painter(c);
    var rand = mulberry32(seed);
    rect(0, 0, T, T, pal.mortar);
    for (var i = 0; i < 10; i++) rect(Math.floor(rand() * T), Math.floor(rand() * T), 1, 1, pal.mortarDark);
    for (var row = 0; row < 4; row++) {
      var y0 = row * 4;
      var offset = row % 2 ? 4 : 0;
      for (var b = -1; b < 3; b++) {
        var x0 = b * 8 + offset;
        var base = pick(rand, pal.brick);
        for (var y = y0; y < y0 + 3; y++) {
          for (var x = x0 + 1; x < x0 + 8; x++) {
            if (x < 0 || x >= T) continue;
            var col = base;
            var v = rand();
            if (v < 0.18) col = pal.shade;
            else if (v < 0.3) col = pal.light;
            if (y === y0 + 2 && v < 0.6) col = pal.shade;
            rect(x, y, 1, 1, col);
          }
        }
      }
    }
    return c;
  }

  var BRICK_BROWN = {
    mortar: '#ece2d0', mortarDark: '#d8cab2',
    brick: ['#8b4f32', '#7f472c', '#96573a'], shade: '#663820', light: '#a8694c'
  };
  var BRICK_CLAY = {
    mortar: '#f1e6d2', mortarDark: '#dccdb4',
    brick: ['#d27c43', '#c96f37', '#dc8a52'], shade: '#a5562b', light: '#eba26e'
  };

  // Square dark bricks on hatched grey, like row 9 of the original board.
  function tileDarkBrick(seed) {
    var c = makeCanvas(T, T);
    var rect = painter(c);
    var rand = mulberry32(seed);
    for (var y = 0; y < T; y++) {
      for (var x = 0; x < T; x++) {
        rect(x, y, 1, 1, (x + y) % 3 === 0 ? '#b7ad9e' : '#d3cbbd');
      }
    }
    [1, 6, 11].forEach(function (by) {
      [1, 6, 11].forEach(function (bx) {
        var base = pick(rand, ['#5b3520', '#6b4027', '#4e2c19', '#7a4a2d']);
        var w = rand() < 0.25 ? 3 : 4;
        var h = rand() < 0.25 ? 3 : 4;
        for (var yy = 0; yy < h; yy++) {
          for (var xx = 0; xx < w; xx++) {
            var v = rand();
            rect(bx + xx, by + yy, 1, 1, v < 0.2 ? '#3f2414' : v < 0.32 ? '#8a5836' : base);
          }
        }
      });
    });
    return c;
  }

  // Big flat stones with brown outlines.
  var STONE_MAP = [
    'aaaaaa.bbbbbbbbb',
    'aaaaaa.bbbbbbbbb',
    'aaaaaa.bbbbbbbbb',
    'aaaaaa.bbbbbbbbb',
    'aaaaaa..........',
    '.......cccccc.dd',
    'eeeee..cccccc.dd',
    'eeeee..cccccc.dd',
    'eeeee..cccccc.dd',
    'eeeee.........dd',
    'eeeee.fffffff...',
    '......fffffff.gg',
    'hhhh..fffffff.gg',
    'hhhh..fffffff.gg',
    'hhhh..fffffff.gg',
    'hhhh............'
  ];
  function tileStone(seed) {
    var c = makeCanvas(T, T);
    var rect = painter(c);
    var rand = mulberry32(seed);
    var flip = rand() < 0.5;
    var bases = {};
    'abcdefgh'.split('').forEach(function (k) {
      bases[k] = pick(rand, ['#e1a96a', '#d6985c', '#e9ba80', '#cf9157', '#dba06a']);
    });
    for (var y = 0; y < T; y++) {
      for (var x = 0; x < T; x++) {
        var sx = flip ? T - 1 - x : x;
        var ch = STONE_MAP[y][sx];
        if (ch === '.') {
          rect(x, y, 1, 1, rand() < 0.3 ? '#6f4426' : '#87542f');
          continue;
        }
        var col = bases[ch];
        var up = y > 0 ? STONE_MAP[y - 1][sx] : '.';
        var down = y < T - 1 ? STONE_MAP[y + 1][sx] : '.';
        if (up !== ch) col = '#f0c896';
        else if (down !== ch) col = '#b97c45';
        else if (rand() < 0.12) col = '#c98a4f';
        rect(x, y, 1, 1, col);
      }
    }
    return c;
  }

  // Marble Start squares.
  function tileMarble(seed) {
    var c = makeCanvas(T, T);
    var rect = painter(c);
    var rand = mulberry32(seed);
    noiseFill(rect, rand, ['#f3f0e9', '#ece8df', '#f8f6f1'], [0.6, 0.25, 0.15]);
    var x = Math.floor(rand() * T);
    var y = 0;
    while (y < T) {
      rect(x, y, 1, 1, rand() < 0.5 ? '#d6cfc1' : '#cbc3b3');
      y += 1;
      x += rand() < 0.5 ? 1 : (rand() < 0.5 ? 0 : -1);
      if (x < 0 || x >= T) x = (x + T) % T;
    }
    return c;
  }

  // The black square was scribbled in crayon.
  function tileRock(seed) {
    var c = makeCanvas(T, T);
    var rect = painter(c);
    var rand = mulberry32(seed);
    rect(0, 0, T, T, '#23212b');
    for (var s = -T; s < T; s += 3) {
      for (var x = 0; x < T; x++) {
        var y = x + s;
        if (y >= 0 && y < T && rand() < 0.8) rect(x, y, 1, 1, rand() < 0.5 ? '#121117' : '#17151d');
      }
    }
    for (var i = 0; i < 6; i++) rect(Math.floor(rand() * T), Math.floor(rand() * T), 1, 1, '#3d3a48');
    return c;
  }

  // Water: the pond was drawn as rings of squares, so the rings ripple out.
  // Returns a 4-frame strip (64 x 16).
  function tileWater(seed) {
    var frames = 4;
    var c = makeCanvas(T * frames, T);
    var rect = painter(c);
    var cols = ['#4f9fe1', '#62afea', '#83c4f3', '#62afea'];
    for (var f = 0; f < frames; f++) {
      var rand = mulberry32(seed + f * 101);
      for (var y = 0; y < T; y++) {
        for (var x = 0; x < T; x++) {
          var d = Math.floor(Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)));
          var ring = ((d - f) % 4 + 4) % 4;
          rect(f * T + x, y, 1, 1, cols[ring]);
        }
      }
      for (var i = 0; i < 3; i++) {
        rect(f * T + Math.floor(rand() * T), Math.floor(rand() * T), 1, 1, '#d8efff');
      }
    }
    return c;
  }

  function tileCanvas(code, r, c) {
    var seed = 1000 + r * 31 + c * 7;
    switch (code) {
      case 'G': return tileGrass(seed);
      case 'L': return tileLawn(seed, false);
      case 'V': return tileLawn(seed, true);
      case 'B': return tileBrick(seed, BRICK_BROWN);
      case 'O': return tileBrick(seed, BRICK_CLAY);
      case 'D': return tileDarkBrick(seed);
      case 'C': return tileStone(seed);
      case 'W': return tileWater(seed);
      case 'X': return tileRock(seed);
      default: return tileMarble(seed);
    }
  }

  function tile(code, r, c) {
    return cached('tile' + code + r + '_' + c, function () {
      return tileCanvas(code, r, c).toDataURL();
    });
  }

  /** One still 16 x 16 frame of a tile (water is otherwise a 4-frame strip). */
  function tileStill(code) {
    return cached('still' + code, function () {
      var c = makeCanvas(T, T);
      c.getContext('2d').drawImage(tileCanvas(code, 5, 3), 0, 0, T, T, 0, 0, T, T);
      return c.toDataURL();
    });
  }

  // Wooden planks for the board frame.
  function planks() {
    return cached('planks', function () {
      var c = makeCanvas(T, T);
      var rect = painter(c);
      var rand = mulberry32(77);
      for (var row = 0; row < 4; row++) {
        var base = ['#9c6a3a', '#a7743f', '#8f5f33', '#a06d3c'][row];
        for (var y = row * 4; y < row * 4 + 4; y++) {
          for (var x = 0; x < T; x++) {
            var col = y === row * 4 + 3 ? '#5c3b1c' : base;
            if (col === base && rand() < 0.2) col = '#86562d';
            if (col === base && rand() < 0.08) col = '#b8824b';
            rect(x, y, 1, 1, col);
          }
        }
        var seam = (row * 5 + 3) % T;
        rect(seam, row * 4, 1, 3, '#5c3b1c');
      }
      return c.toDataURL();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Romans                                                              */
  /* ------------------------------------------------------------------ */

  var PIP_SPOTS = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [2, 0], [0, 2], [2, 2]],
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
    6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]]
  };

  // A dice face (10 x 10) with pips. Spots sit 3px apart.
  function drawFace(rect, x0, y0, n) {
    rect(x0, y0, 10, 10, FACE);
    rect(x0 + 9, y0, 1, 10, FACE_S);
    rect(x0, y0 + 9, 10, 1, FACE_S);
    (PIP_SPOTS[n] || []).forEach(function (s) {
      rect(x0 + 1 + s[0] * 3, y0 + 1 + s[1] * 3, 2, 2, PIP);
    });
  }

  // Helmeted dice head, 18 wide x 20 tall, drawn at (ox, oy).
  function drawHead(rect, ox, oy, team, face, commander) {
    var P = TEAM[team];
    var R = function (x, y, w, h, col) { rect(ox + x, oy + y, w, h, col); };
    // Crest (red horsehair).
    if (commander) {
      R(3, 0, 12, 5, RED);
      R(3, 0, 12, 1, GOLD);
      R(4, 1, 10, 1, RED_L);
      R(14, 1, 1, 4, RED_D);
      for (var x = 4; x < 14; x += 2) R(x, 3, 1, 1, RED_D);
    } else {
      R(5, 0, 8, 5, RED);
      R(5, 0, 8, 1, RED_L);
      R(5, 1, 1, 3, RED_L);
      R(12, 1, 1, 4, RED_D);
      R(7, 2, 1, 2, RED_D);
      R(10, 2, 1, 2, RED_D);
    }
    // Dome.
    R(3, 4, 12, 1, P.main);
    R(2, 5, 14, 1, P.main);
    R(1, 6, 16, 3, P.main);
    R(4, 4, 3, 1, P.shine);
    R(3, 5, 4, 1, P.light);
    R(2, 6, 2, 2, P.light);
    R(14, 5, 2, 1, P.dark);
    R(15, 6, 2, 3, P.dark);
    // Yellow brow band.
    R(1, 9, 16, 1, GOLD);
    R(1, 9, 3, 1, GOLD_L);
    if (commander) {
      R(1, 8, 16, 1, GOLD_D);
      R(8, 6, 2, 2, GOLD);
      R(8, 6, 1, 1, GOLD_L);
    }
    // Cheek guards.
    R(1, 10, 3, 4, P.main);
    R(2, 14, 2, 2, P.main);
    R(14, 10, 3, 4, P.dark);
    R(14, 14, 2, 2, P.dark);
    R(2, 11, 1, 1, GOLD);
    R(15, 11, 1, 1, GOLD);
    // Dice face.
    drawFace(rect, ox + 4, oy + 10, face);
  }

  function romanCanvas(team, face, commander) {
    var w = 20;
    var h = commander ? 32 : 22;
    var c = makeCanvas(w, h);
    var rect = painter(c);
    var P = TEAM[team];
    drawHead(rect, 1, 1, team, face, commander);
    if (commander) {
      var R = function (x, y, ww, hh, col) { rect(1 + x, 1 + y, ww, hh, col); };
      // Red cape behind the body.
      R(0, 20, 18, 10, RED_D);
      // Arms.
      R(1, 20, 2, 6, P.dark);
      R(15, 20, 2, 6, P.dark);
      // Armour.
      R(3, 20, 12, 6, P.main);
      R(3, 20, 2, 6, P.light);
      R(13, 20, 2, 6, P.dark);
      // White plaque with writing, like the original Commander.
      R(6, 21, 6, 4, '#f4efe4');
      R(7, 22, 1, 1, OUT); R(9, 22, 1, 1, OUT); R(10, 22, 1, 1, OUT);
      R(7, 23, 2, 1, OUT); R(10, 23, 1, 1, OUT);
      // Gold belt and red skirt.
      R(3, 26, 12, 1, GOLD);
      R(3, 27, 12, 3, RED);
      for (var x = 4; x < 15; x += 2) R(x, 27, 1, 3, RED_D);
    }
    return outline(c, OUT);
  }

  /** Data URL of a Roman sprite. */
  function roman(team, face, commander) {
    return cached('roman' + team + face + (commander ? 'C' : ''), function () {
      return romanCanvas(team, face, commander).toDataURL();
    });
  }

  /** Sprite size in pixels, for aspect ratios. */
  function romanSize(commander) {
    return commander ? [20, 32] : [20, 22];
  }

  /* ------------------------------------------------------------------ */
  /* Dice, icons and scenery                                             */
  /* ------------------------------------------------------------------ */

  function dieCanvas(n) {
    var c = makeCanvas(16, 16);
    var rect = painter(c);
    rect(1, 0, 14, 1, OUT);
    rect(1, 15, 14, 1, OUT);
    rect(0, 1, 1, 14, OUT);
    rect(15, 1, 1, 14, OUT);
    rect(1, 1, 14, 14, FACE);
    rect(2, 1, 11, 1, '#ffffff');
    rect(1, 13, 14, 2, FACE_S);
    rect(13, 1, 2, 14, FACE_S);
    rect(1, 1, 1, 1, OUT);
    rect(14, 1, 1, 1, OUT);
    rect(1, 14, 1, 1, OUT);
    rect(14, 14, 1, 1, OUT);
    if (n >= 1 && n <= 6) {
      PIP_SPOTS[n].forEach(function (s) {
        rect(3 + s[0] * 4, 3 + s[1] * 4, 2, 2, PIP);
      });
    } else {
      drawMap(rect, [
        '.###.',
        '#...#',
        '...#.',
        '..#..',
        '.....',
        '..#..'
      ], { '#': '#9a917f' }, 5, 4);
    }
    return c;
  }

  /** Data URL of a die showing n (0 = a question mark). */
  function die(n) {
    return cached('die' + n, function () { return dieCanvas(n).toDataURL(); });
  }

  // Icons are white pixel shapes; CSS paints them with a mask.
  var ICONS = {
    up: [
      '....#....',
      '...###...',
      '..#####..',
      '.#######.',
      '#########',
      '...###...',
      '...###...',
      '...###...',
      '...###...'
    ],
    down: [
      '...###...',
      '...###...',
      '...###...',
      '...###...',
      '#########',
      '.#######.',
      '..#####..',
      '...###...',
      '....#....'
    ],
    left: [
      '....#....',
      '...##....',
      '..###....',
      '.########',
      '#########',
      '.########',
      '..###....',
      '...##....',
      '....#....'
    ],
    right: [
      '....#....',
      '....##...',
      '....###..',
      '########.',
      '#########',
      '########.',
      '....###..',
      '....##...',
      '....#....'
    ],
    sides: [
      '..#...#..',
      '.##...##.',
      '#########',
      '#########',
      '.##...##.',
      '..#...#..'
    ],
    swords: [
      '#.......#',
      '##.....##',
      '.##...##.',
      '..##.##..',
      '...###...',
      '..##.##..',
      '.#.#.#.#.',
      '#.#...#.#',
      '.#.....#.'
    ],
    crown: [
      '#...#...#',
      '##.###.##',
      '#########',
      '#########',
      '#.#.#.#.#',
      '#########'
    ],
    soundOn: [
      '...#.....',
      '..##...#.',
      '####.#..#',
      '####.#..#',
      '####.#..#',
      '..##...#.',
      '...#.....'
    ],
    soundOff: [
      '...#.....',
      '..##.....',
      '####.#.#.',
      '####..#..',
      '####.#.#.',
      '..##.....',
      '...#.....'
    ],
    menu: [
      '#########',
      '#########',
      '.........',
      '#########',
      '#########',
      '.........',
      '#########',
      '#########'
    ],
    help: [
      '.#####.',
      '##...##',
      '.....##',
      '...###.',
      '...##..',
      '.......',
      '...##..'
    ],
    gear: [
      '...#.#...',
      '.#.###.#.',
      '..#####..',
      '####.####',
      '.##...##.',
      '####.####',
      '..#####..',
      '.#.###.#.',
      '...#.#...'
    ],
    home: [
      '....#....',
      '...###...',
      '..#####..',
      '.#######.',
      '#########',
      '.##...##.',
      '.##...##.',
      '.##...##.'
    ],
    robot: [
      '....#....',
      '..#####..',
      '.#######.',
      '.#..#..#.',
      '.#######.',
      '.##...##.',
      '..#####..'
    ],
    players: [
      '.##...##.',
      '####.####',
      '####.####',
      '.##...##.',
      '.........',
      '###...###',
      '###...###'
    ],
    play: [
      '#....',
      '##...',
      '###..',
      '####.',
      '#####',
      '####.',
      '###..',
      '##...',
      '#....'
    ],
    close: [
      '##...##',
      '.##.##.',
      '..###..',
      '.##.##.',
      '##...##'
    ]
  };

  function icon(name) {
    return cached('icon' + name, function () {
      var rows = ICONS[name];
      var c = makeCanvas(rows[0].length, rows.length);
      drawMap(painter(c), rows, { '#': '#ffffff' });
      return c.toDataURL();
    });
  }

  function cloud() {
    return cached('cloud', function () {
      var c = makeCanvas(96, 24);
      var rect = painter(c);
      var puff = function (x, y) {
        rect(x + 4, y, 16, 4, '#ffffff');
        rect(x, y + 4, 28, 6, '#ffffff');
        rect(x, y + 10, 28, 2, '#dfeefa');
      };
      puff(2, 3);
      puff(22, 8);
      puff(60, 2);
      return c.toDataURL();
    });
  }

  function stars() {
    return cached('stars', function () {
      var c = makeCanvas(64, 64);
      var rect = painter(c);
      var rand = mulberry32(9);
      for (var i = 0; i < 14; i++) {
        var x = Math.floor(rand() * 62);
        var y = Math.floor(rand() * 62);
        rect(x, y, 1, 1, rand() < 0.3 ? '#ffe58a' : '#ffffff');
        if (rand() < 0.25) rect(x + 1, y, 1, 1, '#9fb4e8');
      }
      return c.toDataURL();
    });
  }

  /** Title picture: two Commanders and a big die on a strip of grass. */
  function heroCanvas() {
    var c = makeCanvas(76, 40);
    var g = c.getContext('2d');
    var left = romanCanvas('purple', 5, true);
    var right = romanCanvas('blue', 3, true);
    var bigDie = dieCanvas(6);
    var rect = painter(c);
    for (var x = 0; x < 76; x++) {
      rect(x, 34, 1, 1, x % 3 ? '#4cae3a' : '#59bb45');
      rect(x, 35, 1, 1, x % 5 ? '#43a033' : '#3b9230');
      for (var y = 36; y < 40; y++) rect(x, y, 1, 1, (x + y) % 4 ? '#8b5a35' : '#7a4c2b');
    }
    g.drawImage(left, 6, 3);
    g.drawImage(right, 50, 3);
    g.drawImage(bigDie, 30, 18);
    return c;
  }

  WBR.Art = {
    TEAM: TEAM,
    tile: tile,
    tileStill: tileStill,
    planks: planks,
    roman: roman,
    romanSize: romanSize,
    die: die,
    icon: icon,
    cloud: cloud,
    stars: stars,
    heroCanvas: heroCanvas,
    romanCanvas: romanCanvas,
    dieCanvas: dieCanvas,
    tileCanvas: tileCanvas
  };
}(typeof self !== 'undefined' ? self : this));
