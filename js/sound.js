/*
 * Who's the Better Roman? - chiptune sound effects made with Web Audio.
 * No sound files: every blip is synthesised, and nothing plays until the
 * player has tapped something (browsers require that).
 */
(function (root) {
  'use strict';

  var WBR = root.WBR = root.WBR || {};
  var ctx = null;
  var master = null;
  var noiseBuffer = null;
  var enabled = true;

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch (e) {
        return null;
      }
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, opts) {
    var c = ensure();
    if (!c) return;
    opts = opts || {};
    var t = c.currentTime + (opts.at || 0);
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (opts.slide) osc.frequency.exponentialRampToValueAtTime(opts.slide, t + dur);
    var vol = opts.vol || 0.12;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, opts) {
    var c = ensure();
    if (!c) return;
    opts = opts || {};
    var t = c.currentTime + (opts.at || 0);
    var src = c.createBufferSource();
    src.buffer = noiseBuffer;
    var filter = c.createBiquadFilter();
    filter.type = opts.filter || 'bandpass';
    filter.frequency.setValueAtTime(opts.freq || 1800, t);
    if (opts.sweep) filter.frequency.exponentialRampToValueAtTime(opts.sweep, t + dur);
    var gain = c.createGain();
    var vol = opts.vol || 0.15;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  var Sound = {
    unlock: function () { ensure(); },
    setEnabled: function (on) {
      enabled = !!on;
      if (!ctx) return;
      if (!enabled && ctx.state === 'running') ctx.suspend();
      if (enabled && ctx.state === 'suspended') ctx.resume();
    },
    isEnabled: function () { return enabled; },
    click: function () { tone(660, 0.05, { vol: 0.07 }); },
    select: function () {
      tone(520, 0.06, { vol: 0.08 });
      tone(780, 0.07, { vol: 0.08, at: 0.06 });
    },
    rattle: function () {
      noise(0.04, { vol: 0.18, freq: 2200 + Math.random() * 1500 });
      tone(180 + Math.random() * 160, 0.03, { vol: 0.04, type: 'triangle' });
    },
    land: function () {
      tone(200, 0.1, { vol: 0.18, type: 'triangle', slide: 120 });
      noise(0.06, { vol: 0.12, freq: 900 });
    },
    step: function (i) {
      tone(330 + (i || 0) * 45, 0.05, { vol: 0.06 });
      noise(0.03, { vol: 0.05, freq: 500 });
    },
    bonk: function () {
      tone(320, 0.18, { vol: 0.2, slide: 70 });
      noise(0.25, { vol: 0.22, freq: 1400, sweep: 300 });
    },
    promote: function () {
      [523, 659, 784].forEach(function (f, i) {
        tone(f, 0.09, { vol: 0.08, at: i * 0.07 });
      });
    },
    nope: function () { tone(150, 0.14, { vol: 0.08, type: 'sawtooth', slide: 110 }); },
    splash: function () { noise(0.35, { vol: 0.14, filter: 'lowpass', freq: 2400, sweep: 300 }); },
    turn: function () {
      tone(440, 0.07, { vol: 0.06 });
      tone(660, 0.09, { vol: 0.06, at: 0.08 });
    },
    duel: function () {
      [392, 392, 523].forEach(function (f, i) {
        tone(f, 0.1, { vol: 0.09, at: i * 0.12 });
      });
    },
    win: function () {
      var notes = [523, 659, 784, 1047, 784, 1047];
      notes.forEach(function (f, i) {
        tone(f, i === notes.length - 1 ? 0.5 : 0.12, { vol: 0.11, at: i * 0.13 });
      });
      tone(262, 0.8, { vol: 0.06, type: 'triangle', at: 0.65 });
    },
    lose: function () {
      [392, 349, 311, 262].forEach(function (f, i) {
        tone(f, 0.22, { vol: 0.09, type: 'triangle', at: i * 0.2 });
      });
    }
  };

  WBR.Sound = Sound;
}(typeof self !== 'undefined' ? self : this));
