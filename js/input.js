/* ============================================================
   NULL POINTER — input.js
   Keyboard (WASD/arrows/E) + floating touch joystick + tap.
   Pointer Events unify mouse and touch; works on iPad Safari.
   ============================================================ */

var NP = window.NP || (window.NP = {});

(function () {
  'use strict';

  const Input = {
    keys: {},
    justPressed: {},
    moveX: 0,        // analog move axis, -1..1
    moveY: 0,
    touchActive: false,
    _tapInteract: false,

    _joyId: null,
    _joyBaseX: 0,
    _joyBaseY: 0,
    _joyMax: 52,

    init(opts) {
      const onKey = opts.onKey;

      document.addEventListener('keydown', (e) => {
        if (e.repeat) { e.preventDefault(); return; }
        const c = e.code;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(c)) e.preventDefault();
        if (!this.keys[c]) this.justPressed[c] = true;
        this.keys[c] = true;
        if (c === 'KeyE' || c === 'Space' || c === 'Enter') this._tapInteract = true;
        if (onKey) onKey(c);
      });
      document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

      window.addEventListener('blur', () => { this.keys = {}; });

      this._initJoystick(opts);
    },

    _initJoystick(opts) {
      const zone = opts.joystickZone;
      const base = opts.joystickBase;
      const knob = opts.joystickKnob;
      if (!zone) return;

      const getPoint = (e) => (e.changedTouches ? e.changedTouches[0] : e);

      const start = (e) => {
        if (this._joyId !== null) return;
        const p = getPoint(e);
        this._joyId = e.pointerId !== undefined ? e.pointerId : 0;
        this._joyBaseX = p.clientX;
        this._joyBaseY = p.clientY;
        base.style.left = (p.clientX - 54) + 'px';
        base.style.top = (p.clientY - 54) + 'px';
        base.classList.add('visible');
        knob.style.left = (p.clientX - 22) + 'px';
        knob.style.top = (p.clientY - 22) + 'px';
        knob.classList.add('visible');
        this.touchActive = true;
        if (e.pointerId !== undefined && zone.setPointerCapture) {
          try { zone.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
        }
        e.preventDefault();
      };

      const move = (e) => {
        if (this._joyId === null) return;
        const p = getPoint(e);
        let dx = p.clientX - this._joyBaseX;
        let dy = p.clientY - this._joyBaseY;
        const d = Math.hypot(dx, dy);
        if (d > this._joyMax) { dx = (dx / d) * this._joyMax; dy = (dy / d) * this._joyMax; }
        this.moveX = dx / this._joyMax;
        this.moveY = dy / this._joyMax;
        knob.style.left = (this._joyBaseX + dx - 22) + 'px';
        knob.style.top = (this._joyBaseY + dy - 22) + 'px';
        e.preventDefault();
      };

      const end = (e) => {
        if (this._joyId === null) return;
        this._joyId = null;
        this.moveX = 0; this.moveY = 0;
        base.classList.remove('visible');
        knob.classList.remove('visible');
        e.preventDefault();
      };

      zone.addEventListener('pointerdown', start);
      zone.addEventListener('pointermove', move);
      zone.addEventListener('pointerup', end);
      zone.addEventListener('pointercancel', end);
      // mouse fallback for desktop testing of the touch UI
      zone.addEventListener('mousedown', (e) => { if (this._joyId === null) start(e); });
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', end);

      // block iOS gestures over the game
      document.addEventListener('gesturestart', (e) => e.preventDefault());
      document.addEventListener('dblclick', (e) => e.preventDefault());
    },

    /** keyboard axis folded into the same analog output; sprint beyond 0.92 magnitude */
    sampleAxes() {
      let x = this.moveX, y = this.moveY;
      if (this.keys['KeyA'] || this.keys['ArrowLeft']) x = -1;
      if (this.keys['KeyD'] || this.keys['ArrowRight']) x = 1;
      if (this.keys['KeyW'] || this.keys['ArrowUp']) y = -1;
      if (this.keys['KeyS'] || this.keys['ArrowDown']) y = 1;
      if (x && y) { const s = 0.7071; x *= s; y *= s; }
      return { x, y };
    },

    sprinting() {
      const mag = Math.hypot(this.moveX, this.moveY);
      return !!(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || mag > 0.92);
    },

    /** true once per press of any interact key or the touch button */
    consumeInteract() {
      const k = this.justPressed['KeyE'] || this.justPressed['Space'] || this.justPressed['Enter'];
      if (k || this._tapInteract) {
        this._tapInteract = false;
        return true;
      }
      return false;
    },

    tapInteract() { this._tapInteract = true; },

    endFrame() {
      this.justPressed = {};
    },
  };

  NP.Input = Input;
})();
