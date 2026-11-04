/* ============================================================
   NULL POINTER — gl.js
   WebGL2 post-processing pipeline. The ASCII scene is drawn
   to an offscreen 2D canvas, uploaded as a texture, and pushed
   through a shader chain:

     scene → bright-pass (¼ res) → blur H → blur V → composite

   Composite pass does everything: CRT barrel curvature,
   chromatic aberration, glitch-band displacement, shockwave
   ripples, bloom, scanlines + aperture grille, animated grain,
   breathing vignette with heartbeat pulse, damage flash, and a
   dread-driven color grade. Falls back to a plain 2D blit when
   WebGL2 is unavailable.
   ============================================================ */

var NP = window.NP || (window.NP = {});

(function () {
  'use strict';

  const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  const FRAG_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
out vec4 fragColor;
void main() {
  vec3 c = texture(uScene, vUv).rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float keep = smoothstep(0.42, 0.85, lum);
  fragColor = vec4(c * keep, 1.0);
}`;

  const FRAG_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uDir; // (1,0) or (0,1) in texel units
out vec4 fragColor;
void main() {
  // 9-tap gaussian, cheap and stable
  vec3 sum = texture(uSrc, vUv).rgb * 0.227;
  vec2 o1 = uDir * 1.3846; vec2 o2 = uDir * 3.2308;
  sum += (texture(uSrc, vUv + o1).rgb + texture(uSrc, vUv - o1).rgb) * 0.316;
  sum += (texture(uSrc, vUv + o2).rgb + texture(uSrc, vUv - o2).rgb) * 0.070;
  fragColor = vec4(sum, 1.0);
}`;

  const FRAG_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uTime;
uniform float uGlitch;    // 0..1 corruption severity
uniform float uDamage;    // 0..1 recent-hit flash, decays
uniform float uDread;     // 0..1 overall grade shift
uniform float uChase;     // 0..1 pursuit intensity
uniform float uPulse;     // 0..1 heartbeat vignette pulse
uniform float uBloomAmt;
uniform vec2 uRes;
uniform vec4 uWaves[4];   // x,y = uv center, z = radius, w = strength
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec2 barrel(vec2 uv) {
  vec2 c = uv - 0.5;
  return uv + c * dot(c, c) * 0.11;
}

void main() {
  vec2 uv = vUv;

  // ---- shockwave ripples (fragment pickups, sentinel hits) ----
  for (int i = 0; i < 4; i++) {
    vec4 w = uWaves[i];
    if (w.w <= 0.001) continue;
    vec2 d = uv - w.xy;
    d.x *= uRes.x / uRes.y;
    float dist = length(d);
    float ring = 1.0 - smoothstep(0.0, 0.02, abs(dist - w.z));
    uv -= normalize(d + vec2(1e-5)) * w.w * 0.025 * ring;
  }

  // ---- CRT curvature ----
  uv = barrel(uv);

  // ---- glitch band displacement ----
  if (uGlitch > 0.01) {
    float row = floor(uv.y * 34.0);
    float n = hash(vec2(row, floor(uTime * 22.0)));
    if (n > 1.0 - uGlitch * 0.4) {
      uv.x += (hash(vec2(row, uTime)) - 0.5) * 0.14 * uGlitch;
    }
    // occasional full-frame vertical jitter
    if (hash(vec2(floor(uTime * 22.0), 7.0)) > 1.0 - uGlitch * 0.15) {
      uv.y += (hash(vec2(uTime, 3.0)) - 0.5) * 0.02 * uGlitch;
    }
  }

  vec2 c = uv - 0.5;
  float r = length(c);

  // ---- chromatic aberration (radial, state-driven) ----
  float ca = 0.0011 + uGlitch * 0.005 + uChase * 0.0022 + uDamage * 0.007 + uDread * 0.0009;
  vec3 col;
  col.r = texture(uScene, uv + c * ca).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - c * ca).b;

  // ---- outside the tube: black ----
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // ---- bloom ----
  col += texture(uBloom, uv).rgb * uBloomAmt;

  // ---- scanlines + aperture grille ----
  col *= 0.86 + 0.14 * sin(uv.y * uRes.y * 3.14159);
  col *= 0.94 + 0.06 * sin(uv.x * uRes.x * 1.047);

  // ---- animated grain ----
  col += (hash(uv * (uTime + 13.7)) - 0.5) * (0.028 + uGlitch * 0.09 + uDread * 0.02);

  // ---- vignette with heartbeat pulse ----
  float vig = smoothstep(1.05, 0.32, r * (1.32 + uPulse * 0.3));
  col *= vig;

  // ---- damage flash bleeding in from the edges ----
  col.r += uDamage * 0.3 * (1.0 - vig);
  col.b += uDamage * 0.05 * (1.0 - vig);

  // ---- dread grade: desaturate slightly, push red, cool shadows ----
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), uDread * 0.2);
  col.r *= 1.0 + uDread * 0.14 + uChase * 0.1;
  col.b *= 1.0 - uDread * 0.06;

  fragColor = vec4(col, 1.0);
}`;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error('shader: ' + gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  function makeTarget(gl, w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fbo, w, h };
  }

  function PostFX(displayCanvas) {
    this.canvas = displayCanvas;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.gl = displayCanvas.getContext('webgl2', { antialias: false, alpha: false });
    this.ok = !!this.gl;
    this.waves = []; // {x,y,radius,strength} in uv space
    this.time = 0;

    if (!this.ok) return;

    const gl = this.gl;
    this.pBright = program(gl, VERT, FRAG_BRIGHT);
    this.pBlur = program(gl, VERT, FRAG_BLUR);
    this.pComp = program(gl, VERT, FRAG_COMPOSITE);

    // fullscreen triangle
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.sceneTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.resize();
  }

  PostFX.prototype.resize = function () {
    if (!this.ok) return;
    const gl = this.gl;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * this.dpr);
    const h = Math.round(this.canvas.clientHeight * this.dpr);
    this.canvas.width = w;
    this.canvas.height = h;
    this.bright = makeTarget(gl, Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.blurA = makeTarget(gl, Math.max(1, w >> 2), Math.max(1, h >> 2));
    this.blurB = makeTarget(gl, Math.max(1, w >> 2), Math.max(1, h >> 2));
  };

  PostFX.prototype.addWave = function (x, y, strength) {
    // x,y in css-pixel coordinates of the scene
    const sw = this.canvas.clientWidth, sh = this.canvas.clientHeight;
    this.waves.push({ x: x / sw, y: 1 - y / sh, radius: 0.0, strength, age: 0 });
    if (this.waves.length > 6) this.waves.shift();
  };

  PostFX.prototype.render = function (sceneCanvas, state, dt) {
    this.time += dt;

    if (!this.ok) {
      // graceful fallback: plain blit
      const ctx = this.canvas.getContext('2d');
      ctx.drawImage(sceneCanvas, 0, 0, this.canvas.width, this.canvas.height);
      return;
    }

    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;

    // upload scene
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);

    // bright pass → blurA
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bright.fbo);
    gl.viewport(0, 0, this.bright.w, this.bright.h);
    gl.useProgram(this.pBright);
    this._bind(this.pBright, 'uScene', this.sceneTex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // blur ping-pong (H then V), two iterations
    gl.useProgram(this.pBlur);
    gl.uniform2f(gl.getUniformLocation(this.pBlur, 'uDir'), 1 / this.bright.w, 0);
    this._bind(this.pBlur, 'uSrc', this.bright.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurA.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.uniform2f(gl.getUniformLocation(this.pBlur, 'uDir'), 0, 1 / this.bright.h);
    this._bind(this.pBlur, 'uSrc', this.blurA.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurB.fbo);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(this.pComp);
    const P = this.pComp;
    this._bind(P, 'uScene', this.sceneTex, 0);
    this._bind(P, 'uBloom', this.blurB.tex, 1);
    gl.uniform1f(gl.getUniformLocation(P, 'uTime'), this.time);
    gl.uniform1f(gl.getUniformLocation(P, 'uGlitch'), state.glitch);
    gl.uniform1f(gl.getUniformLocation(P, 'uDamage'), state.damage);
    gl.uniform1f(gl.getUniformLocation(P, 'uDread'), state.dread);
    gl.uniform1f(gl.getUniformLocation(P, 'uChase'), state.chase);
    gl.uniform1f(gl.getUniformLocation(P, 'uPulse'), state.pulse);
    gl.uniform1f(gl.getUniformLocation(P, 'uBloomAmt'), 0.85 + state.bloomBoost);
    gl.uniform2f(gl.getUniformLocation(P, 'uRes'), w, h);

    // waves: update + upload up to 4
    const wv = new Float32Array(16);
    let wi = 0;
    for (const wv1 of this.waves) {
      wv1.age += dt;
      wv1.radius = wv1.age * 0.9;
      wv1.strength *= Math.max(0, 1 - dt * 2.2);
      if (wi < 4 && wv1.strength > 0.01) {
        wv[wi * 4] = wv1.x; wv[wi * 4 + 1] = wv1.y;
        wv[wi * 4 + 2] = wv1.radius; wv[wi * 4 + 3] = wv1.strength;
        wi++;
      }
    }
    this.waves = this.waves.filter((w) => w.strength > 0.01);
    const loc = gl.getUniformLocation(P, 'uWaves');
    if (loc) gl.uniform4fv(loc, wv);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  PostFX.prototype._bind = function (prog, name, tex, unit) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
  };

  NP.PostFX = PostFX;
})();
