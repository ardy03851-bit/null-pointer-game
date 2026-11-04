/* ============================================================
   NULL POINTER — audio.js
   Fully procedural WebAudio. No files, no fetches.
   A low drone, breath noise, footsteps, whispers, glitch stings.
   Everything starts only after a user gesture (title tap).
   ============================================================ */

var NP = window.NP || (window.NP = {});

(function () {
  'use strict';

  const Audio = {
    ctx: null,
    master: null,
    droneNodes: null,
    breathNode: null,
    started: false,
    enabled: true,

    start() {
      if (this.started) { this.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.started = true;

      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(ctx.destination);

      this._buildDrone();
      this._buildBreath();
    },

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    /* ---------- ambient bed ---------- */

    _buildDrone() {
      const ctx = this.ctx;
      const out = ctx.createGain();
      out.gain.value = 0.16;
      out.connect(this.master);

      // two detuned lows + a slow filtered saw, very quiet
      const o1 = ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = 55;
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = 55.7;
      const o3 = ctx.createOscillator();
      o3.type = 'sawtooth';
      o3.frequency.value = 110.3;
      const g3 = ctx.createGain();
      g3.gain.value = 0.035;
      const f3 = ctx.createBiquadFilter();
      f3.type = 'lowpass';
      f3.frequency.value = 220;
      o3.connect(g3).connect(f3).connect(out);
      o1.connect(out);
      o2.connect(out);
      o1.start(); o2.start(); o3.start();

      // LFO that slowly opens/closes the lowpass — the program "breathes"
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 60;
      lfo.connect(lfoGain).connect(f3.frequency);
      lfo.start();

      this.droneNodes = { out, o1, o2, o3, f3, lfo };
    },

    _buildBreath() {
      // looped noise buffer through a bandpass — distant air handling
      const ctx = this.ctx;
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        // brown-ish noise
        last = (last + (Math.random() * 2 - 1) * 0.02) * 0.995;
        d[i] = last;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 340;
      bp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      src.connect(bp).connect(g).connect(this.master);
      src.start();
      this.breathNode = src;
    },

    /* ---------- one-shots ---------- */

    step(zone) {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const base = zone === 2 ? 96 : zone === 1 ? 120 : 150;
      osc.frequency.setValueAtTime(base + Math.random() * 18, t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.5, t + 0.09);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.045, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.12);
    },

    pickup() {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      // slightly detuned pair — wrong on purpose
      [523.3, 519.1, 782.9].forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t + i * 0.09);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.09, t + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.7);
        osc.connect(g).connect(this.master);
        osc.start(t + i * 0.09);
        osc.stop(t + i * 0.09 + 0.8);
      });
    },

    whisper() {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * (1.2 + Math.random() * 0.8));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      // formant-ish bandpass sweeps
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 6;
      bp.frequency.setValueAtTime(900 + Math.random() * 500, t);
      bp.frequency.exponentialRampToValueAtTime(500 + Math.random() * 400, t + len / ctx.sampleRate);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len / ctx.sampleRate);
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      if (pan) { pan.pan.value = Math.random() * 2 - 1; src.connect(bp).connect(g).connect(pan).connect(this.master); }
      else src.connect(bp).connect(g).connect(this.master);
      src.start(t);
    },

    glitchSting(intensity) {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const dur = 0.06 + Math.random() * 0.08;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(120 + Math.random() * 900, t);
      osc.frequency.setValueAtTime(60 + Math.random() * 200, t + dur * 0.5);
      const g = ctx.createGain();
      const vol = 0.02 + (intensity || 0.5) * 0.05;
      g.gain.setValueAtTime(vol, t);
      g.gain.setValueAtTime(vol, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.01);
    },

    hum(intensity) {
      if (!this.ctx || !this.enabled || !this.droneNodes) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const { o1, o2 } = this.droneNodes;
      // momentarily detune the drone — dread without a jumpscare
      o1.frequency.setValueAtTime(o1.frequency.value, t);
      o1.frequency.linearRampToValueAtTime(55 - (intensity || 1) * 1.5, t + 0.4);
      o1.frequency.linearRampToValueAtTime(55, t + 3.2);
      o2.frequency.setValueAtTime(o2.frequency.value, t);
      o2.frequency.linearRampToValueAtTime(55.7 + (intensity || 1) * 2.1, t + 0.4);
      o2.frequency.linearRampToValueAtTime(55.7, t + 3.2);
    },

    dissolve() {
      // the ending: drone falls apart downward
      if (!this.ctx || !this.droneNodes) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const { o1, o2, o3, out } = this.droneNodes;
      o1.frequency.exponentialRampToValueAtTime(30, t + 4);
      o2.frequency.exponentialRampToValueAtTime(31.5, t + 4);
      o3.frequency.exponentialRampToValueAtTime(55, t + 4);
      out.gain.linearRampToValueAtTime(0.05, t + 4);
      this.whisper();
      setTimeout(() => this.whisper(), 1400);
      setTimeout(() => this.whisper(), 2600);
    },
  };

  NP.Audio = Audio;
})();
