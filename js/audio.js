/* ============================================================
   NULL POINTER — audio.js (v2)
   Procedural WebAudio score. Layers:
     - bed: detuned drone + breathing filtered saw
     - dread layer: minor-second cluster that fades in with dread
     - heartbeat: sub-bass pulse, synced to the shader vignette,
       engaged while a sentinel hunts you
     - chase layer: bandpassed noise rising + accelerating tick
   One-shots: footsteps, pickup shockwave, metallic sentinel hit
   (FM, inharmonic), ring-modulated whispers, glitch stings.
   ============================================================ */

var NP = window.NP || (window.NP = {});

(function () {
  'use strict';

  const Audio = {
    ctx: null,
    master: null,
    started: false,
    enabled: true,

    drone: null,
    dreadGain: null,
    chaseGain: null,
    chaseFilter: null,
    pulseOsc: null,
    pulseGain: null,
    pulseTimer: 0,
    chaseLevel: 0,

    start() {
      if (this.started) { this.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { this.enabled = false; return; }
      this.ctx = new AC();
      this.started = true;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this._buildBed();
      this._buildDread();
      this._buildChase();
      this._buildHeartbeat();
    },

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    /* ---------- bed ---------- */
    _buildBed() {
      const ctx = this.ctx;
      const out = ctx.createGain();
      out.gain.value = 0.15;
      out.connect(this.master);

      const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 55.7;
      const o3 = ctx.createOscillator(); o3.type = 'sawtooth'; o3.frequency.value = 110.3;
      const g3 = ctx.createGain(); g3.gain.value = 0.03;
      const f3 = ctx.createBiquadFilter(); f3.type = 'lowpass'; f3.frequency.value = 220;
      o3.connect(g3).connect(f3).connect(out);
      o1.connect(out); o2.connect(out);
      o1.start(); o2.start(); o3.start();

      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
      const lfoG = ctx.createGain(); lfoG.gain.value = 60;
      lfo.connect(lfoG).connect(f3.frequency);
      lfo.start();

      // breath noise
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.02) * 0.995; d[i] = last; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 340; bp.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.value = 0.05;
      src.connect(bp).connect(g).connect(this.master);
      src.start();

      this.drone = { out, o1, o2, o3 };
    },

    /* ---------- dread cluster: minor seconds, barely there ---------- */
    _buildDread() {
      const ctx = this.ctx;
      const g = ctx.createGain(); g.gain.value = 0;
      g.connect(this.master);
      const freqs = [220.6, 233.1, 110.4]; // clustered, dissonant
      this.dreadOscs = freqs.map((f) => {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.value = f;
        const og = ctx.createGain(); og.gain.value = 0.33;
        o.connect(og).connect(g);
        o.start();
        return o;
      });
      this.dreadGain = g;
    },

    /* ---------- chase layer ---------- */
    _buildChase() {
      const ctx = this.ctx;
      const g = ctx.createGain(); g.gain.value = 0;
      const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 800; filt.Q.value = 2;
      g.connect(this.master);
      filt.connect(g);

      // noise source through the filter
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      src.connect(filt);
      src.start();

      // accelerating tick
      this.chaseTick = ctx.createOscillator();
      this.chaseTick.type = 'square';
      this.chaseTick.frequency.value = 660;
      const tickG = ctx.createGain(); tickG.gain.value = 0;
      this.chaseTickG = tickG;
      this.chaseTick.connect(tickG).connect(this.master);
      this.chaseTick.start();

      this.chaseGain = g;
      this.chaseFilter = filt;
    },

    /* ---------- heartbeat: sub-bass pulse ---------- */
    _buildHeartbeat() {
      const ctx = this.ctx;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = 42;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g).connect(this.master);
      o.start();
      this.pulseOsc = o;
      this.pulseGain = g;
    },

    /** call every frame with game state */
    updateState(game, dt) {
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;

      // dread cluster volume
      const dreadTarget = game.director ? game.director.dread : 0;
      this.dreadGain.gain.setTargetAtTime(dreadTarget * 0.055, t, 0.8);

      // chase level (any sentinel chasing?)
      const chasing = game.sentinels.some((s) => s.state === 'chase');
      this.chaseLevel += ((chasing ? 1 : 0) - this.chaseLevel) * Math.min(1, dt * 1.5);
      this.chaseGain.gain.setTargetAtTime(this.chaseLevel * 0.09, t, 0.3);
      this.chaseFilter.frequency.setTargetAtTime(600 + this.chaseLevel * 900, t, 0.5);
      this.chaseTickG.gain.setTargetAtTime(this.chaseLevel * 0.012, t, 0.3);

      // heartbeat pulse (thump-thump) while chased
      if (this.chaseLevel > 0.1) {
        this.pulseTimer -= dt;
        if (this.pulseTimer <= 0) {
          const period = 0.9 - this.chaseLevel * 0.35;
          this._thump(t, 0.16);
          this._thump(t + period * 0.28, 0.10);
          this.pulseTimer = period;
        }
      }
    },

    _thump(t, vol) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(58, t);
      o.frequency.exponentialRampToValueAtTime(34, t + 0.14);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.18);
    },

    /* ---------- one-shots ---------- */

    step(zone, sprint) {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const base = zone === 2 ? 88 : zone === 1 ? 112 : 140;
      osc.frequency.setValueAtTime(base + Math.random() * 16, t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.5, t + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(sprint ? 0.06 : 0.04, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      osc.connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.1);
    },

    pickup() {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      // shockwave whoosh: filtered noise sweep
      const len = Math.floor(ctx.sampleRate * 0.6);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(2400, t + 0.45);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.10, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      src.connect(bp).connect(g).connect(this.master);
      src.start(t);
      // detuned chime pair (wrong on purpose)
      [523.3, 519.1, 782.9].forEach((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t + i * 0.09);
        const gg = ctx.createGain();
        gg.gain.setValueAtTime(0.0001, t + i * 0.09);
        gg.gain.exponentialRampToValueAtTime(0.08, t + i * 0.09 + 0.02);
        gg.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.7);
        osc.connect(gg).connect(this.master);
        osc.start(t + i * 0.09);
        osc.stop(t + i * 0.09 + 0.8);
      });
    },

    /** metallic sentinel hit — FM synthesis, inharmonic ratio */
    hit() {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const carrier = ctx.createOscillator();
      carrier.type = 'sine';
      carrier.frequency.value = 187;
      const mod = ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = 281; // inharmonic → metal
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(420, t);
      modGain.gain.exponentialRampToValueAtTime(1, t + 0.4);
      mod.connect(modGain).connect(carrier.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      carrier.connect(g).connect(this.master);
      carrier.start(t); mod.start(t);
      carrier.stop(t + 0.55); mod.stop(t + 0.55);
      // plus a low slam
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(90, t);
      o2.frequency.exponentialRampToValueAtTime(30, t + 0.3);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.28, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o2.connect(g2).connect(this.master);
      o2.start(t); o2.stop(t + 0.4);
    },

    /** ring-modulated whisper — speech-like without being speech */
    whisper() {
      if (!this.ctx || !this.enabled) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * (1.2 + Math.random() * 0.9));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((i / len) * Math.PI);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 7;
      bp.frequency.setValueAtTime(800 + Math.random() * 700, t);
      bp.frequency.exponentialRampToValueAtTime(400 + Math.random() * 400, t + len / ctx.sampleRate);
      // ring modulator
      const ring = ctx.createGain();
      ring.gain.value = 0;
      const rm = ctx.createOscillator();
      rm.type = 'sine'; rm.frequency.value = 37 + Math.random() * 50;
      const rmG = ctx.createGain(); rmG.gain.value = 0.9;
      rm.connect(rmG);
      const ringBase = ctx.createGain(); ringBase.gain.value = 0;
      // implement ring mod: ring.gain modulated by rm
      const modPath = ctx.createGain();
      rm.connect(rmG);
      src.connect(bp);
      bp.connect(ring);
      rmG.connect(ring.gain);
      const out = ctx.createGain();
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.06, t + 0.3);
      out.gain.exponentialRampToValueAtTime(0.0001, t + len / ctx.sampleRate);
      ring.connect(out).connect(this.master);
      src.start(t); rm.start(t);
      rm.stop(t + len / ctx.sampleRate);
      src.stop(t + len / ctx.sampleRate);
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
      osc.start(t); osc.stop(t + dur + 0.01);
    },

    hum(intensity) {
      if (!this.ctx || !this.enabled || !this.drone) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const { o1, o2 } = this.drone;
      o1.frequency.setValueAtTime(o1.frequency.value, t);
      o1.frequency.linearRampToValueAtTime(55 - (intensity || 1) * 1.5, t + 0.4);
      o1.frequency.linearRampToValueAtTime(55, t + 3.2);
      o2.frequency.setValueAtTime(o2.frequency.value, t);
      o2.frequency.linearRampToValueAtTime(55.7 + (intensity || 1) * 2.1, t + 0.4);
      o2.frequency.linearRampToValueAtTime(55.7, t + 3.2);
    },

    dissolve() {
      if (!this.ctx || !this.drone) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const { o1, o2, o3, out } = this.drone;
      o1.frequency.exponentialRampToValueAtTime(30, t + 4);
      o2.frequency.exponentialRampToValueAtTime(31.5, t + 4);
      o3.frequency.exponentialRampToValueAtTime(55, t + 4);
      out.gain.linearRampToValueAtTime(0.05, t + 4);
      this.dreadGain.gain.setTargetAtTime(0, t, 1);
      this.chaseGain.gain.setTargetAtTime(0, t, 0.5);
      this.whisper();
      setTimeout(() => this.whisper(), 1400);
      setTimeout(() => this.whisper(), 2600);
    },
  };

  NP.Audio = Audio;
})();
