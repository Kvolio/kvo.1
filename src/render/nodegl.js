/**
 * GPU NODE-FIELD RENDERER
 * =======================
 *
 * The peridynamic field is the only part of the scene with a large primitive
 * count: several thousand to twenty thousand nodes, redrawn every frame, twice
 * (an extruded depth pass and a lit pass). On Canvas 2D that is tens of
 * thousands of `fillRect` calls plus per-node colour work in JavaScript, and on
 * a phone at a device pixel ratio of 3 it dominates the frame.
 *
 * Here the same field is drawn as GL points:
 *   - node positions are uploaded once per frame into a preallocated buffer,
 *   - the scalar being visualised is uploaded as a single float per node,
 *   - material colour is uploaded *once per mesh*, not per frame,
 *   - the colour ramp lives in a texture, so switching field mode costs nothing
 *     and no per-node colour arithmetic happens in JavaScript at all.
 *
 * Nothing about the simulation changes: this reads exactly the same state the
 * Canvas 2D path reads, and the Canvas 2D path is retained as a fallback for
 * devices with no WebGL and for the moments after a context loss.
 *
 * GLSL is written to the ES 1.00 profile so one shader pair serves both a
 * WebGL 2 and a WebGL 1 context.
 */

import { RAMP_DAMAGE, RAMP_PLASTIC, RAMP_TEMP, RAMP_VELOCITY, RAMP_STRESS, hexToRgb } from './palette.js';

const RAMP_ROWS = ['material', 'damage', 'plastic', 'temp', 'velocity', 'stress'];
const RAMP_FNS = {
  material: RAMP_DAMAGE, damage: RAMP_DAMAGE, plastic: RAMP_PLASTIC,
  temp: RAMP_TEMP, velocity: RAMP_VELOCITY, stress: RAMP_STRESS,
};

const VERT = `
precision highp float;
attribute vec2 aPos;
attribute float aVal;
attribute vec3 aCol;
attribute float aFlag;      // 1 = alive, 2 = detached

uniform vec2  uCam;
uniform float uScale;
uniform vec2  uViewport;
uniform vec2  uOffset;
uniform float uPointSize;
uniform float uOnlyFree;    // 1 = draw detached nodes only

varying float vVal;
varying vec3  vCol;
varying float vFree;

void main() {
  if (aFlag < 0.5 || (uOnlyFree > 0.5 && aFlag < 2.5)) {   // dead (or filtered out): park it outside the frustum
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vVal = 0.0; vCol = vec3(0.0); vFree = 0.0;
    return;
  }
  vec2 s = vec2((aPos.x - uCam.x) * uScale + uViewport.x * 0.5,
                uViewport.y * 0.5 - (aPos.y - uCam.y) * uScale);
  s += uOffset;
  gl_Position = vec4(s.x / uViewport.x * 2.0 - 1.0,
                     1.0 - s.y / uViewport.y * 2.0, 0.0, 1.0);
  gl_PointSize = uPointSize;
  vVal = clamp(aVal, 0.0, 1.0);
  vCol = aCol;
  vFree = aFlag >= 2.5 ? 1.0 : 0.0;
}
`;

const FRAG = `
precision highp float;
varying float vVal;
varying vec3  vCol;
varying float vFree;

uniform sampler2D uRamp;
uniform float uRow;          // ramp row, already normalised
uniform float uMaterialMode; // 1 = colour by material tinted by damage
uniform float uDark;         // extruded depth pass
uniform float uAlpha;

void main() {
  vec3 ramp = texture2D(uRamp, vec2(vVal, uRow)).rgb;
  vec3 mat  = vCol * (1.14 - 0.72 * vVal);
  vec3 c = mix(ramp, mat, uMaterialMode);
  // detached material reads warm so spall separates from the parent body
  c = mix(c, c * vec3(1.30, 1.04, 0.72), vFree * 0.85);
  c *= (1.0 - uDark);
  gl_FragColor = vec4(c, uAlpha);
}
`;

/**
 * SMOOTH SURFACE (two programs)
 * -----------------------------
 * Drawn as discrete squares, a continuum body is a staircase: the nose of a
 * penetrator or the bulged back face of a plate shows the lattice rather than
 * the shape the solver arrived at. The smooth path instead *accumulates* every
 * node as a compact kernel into an offscreen texture and thresholds the sum.
 *
 *   splat      each node adds  w(r) = (1 - (r/R)^2)^2 / S  to alpha and
 *              w * colour to rgb, additively. S is the kernel's lattice sum, so
 *              the interior of a body saturates at 1.
 *   composite  one full-screen pass: coverage = smoothstep around 0.5, colour
 *              = rgb / alpha. For a flat edge the 0.5 level sits half a cell
 *              outside the outermost nodes, which is where the material ends.
 *
 * Both passes read exactly the node state the discrete path reads; nothing is
 * added. One node alone only accumulates 1/S (about 0.37), below the 0.5
 * threshold, so an isolated node would vanish. Detached material (spall,
 * ejecta, eroded debris) is therefore ALSO drawn as discrete squares by the
 * ordinary point pass, restricted to detached nodes - debris stays visible as
 * individual pieces exactly as it did before.
 */
const SPLAT_FRAG = `
precision highp float;
varying float vVal;
varying vec3  vCol;
varying float vFree;

uniform sampler2D uRamp;
uniform float uRow;
uniform float uMaterialMode;
uniform float uNorm;

void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 >= 1.0) discard;
  float k = 1.0 - r2;
  float w = k * k * uNorm;
  vec3 ramp = texture2D(uRamp, vec2(vVal, uRow)).rgb;
  vec3 mat  = vCol * (1.14 - 0.72 * vVal);
  vec3 c = mix(ramp, mat, uMaterialMode);
  c = mix(c, c * vec3(1.30, 1.04, 0.72), vFree * 0.85);
  gl_FragColor = vec4(c * w, w);
}
`;

const COMP_VERT = `
precision highp float;
attribute vec2 aQuad;
void main() { gl_Position = vec4(aQuad, 0.0, 1.0); }
`;

const COMP_FRAG = `
precision highp float;
uniform sampler2D uAccum;
uniform vec2  uViewport;
uniform vec2  uShift;      // screen-space shift in pixels (x right, y down)
uniform float uDark;
uniform float uAlpha;
uniform float uLo;
uniform float uHi;
uniform float uClip;       // 1 = keep only the lateral band (the extruded copy)
uniform vec2  uBandC;      // band origin, screen pixels (x right, y down)
uniform vec2  uBandL;      // lateral unit vector, screen space
uniform vec2  uBandT;      // band extent along it, pixels: lo, hi

void main() {
  if (uClip > 0.5) {
    vec2 s = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y);
    float t = dot(s - uBandC, uBandL);
    if (t < uBandT.x || t > uBandT.y) discard;
  }
  vec2 p = gl_FragCoord.xy - vec2(uShift.x, -uShift.y);
  vec2 px = 1.0 / uViewport;
  vec4 a = texture2D(uAccum, p * px);
  if (a.a < 0.05) discard;   // empty space: skip the gradient taps
  // Anti-aliased iso-contour: the coverage ramps over one screen pixel,
  // measured from the field's own gradient, so the edge is as sharp as the
  // display allows however steep or shallow the field is there.
  float gx = texture2D(uAccum, (p + vec2(1.0, 0.0)) * px).a - texture2D(uAccum, (p - vec2(1.0, 0.0)) * px).a;
  float gy = texture2D(uAccum, (p + vec2(0.0, 1.0)) * px).a - texture2D(uAccum, (p - vec2(0.0, 1.0)) * px).a;
  float g = max(0.5 * (abs(gx) + abs(gy)), 1e-3);
  float cov = clamp((a.a - 0.5 * (uLo + uHi)) / g + 0.5, 0.0, 1.0);
  vec3 c = clamp(a.rgb / max(a.a, 1e-3), 0.0, 1.0) * (1.0 - uDark);
  gl_FragColor = vec4(c * cov * uAlpha, cov * uAlpha);
}
`;

/**
 * Lattice sum of the splat kernel for a kernel radius of R lattice spacings.
 * Dividing by it makes the interior of a body accumulate to exactly 1.
 */
export function kernelLatticeSum(R) {
  let s = 0;
  const m = Math.ceil(R);
  for (let i = -m; i <= m; i++) {
    for (let j = -m; j <= m; j++) {
      const q = (i * i + j * j) / (R * R);
      if (q < 1) { const k = 1 - q; s += k * k; }
    }
  }
  return s;
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`shader compile failed: ${log}`);
  }
  return s;
}

export class NodeGL {
  /** @returns {NodeGL|null} null when the platform cannot provide a context */
  static create(canvas) {
    try {
      const opts = {
        alpha: true, antialias: false, depth: false, stencil: false,
        premultipliedAlpha: true, preserveDrawingBuffer: false,
        powerPreference: 'high-performance', desynchronized: true,
      };
      const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
      if (!gl) return null;
      return new NodeGL(canvas, gl);
    } catch (e) {
      console.warn('WebGL unavailable, falling back to Canvas 2D:', e.message);
      return null;
    }
  }

  constructor(canvas, gl) {
    this.canvas = canvas;
    this.gl = gl;
    this.isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    this.lost = false;
    this.capacity = 0;
    this.matCache = new Map();
    // GL_POINTS has a hardware ceiling on gl_PointSize, and it is not
    // generous: 64 px on some mobile GPUs. Past it the driver silently clamps,
    // so zooming in far enough turns a continuous body into a grid of dots
    // with gaps between them - the view would then be showing the lattice
    // rather than the material. The renderer reads this and hands the frame to
    // the Canvas 2-D path instead of drawing something misleading.
    const rng = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    this.maxPointSize = rng && rng.length ? Math.max(1, rng[1]) : 64;

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; }, false);
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); this.capacity = 0; }, false);

    this.init();
  }

  init() {
    const gl = this.gl;
    const prog = this.buildProgram(VERT, FRAG);
    this.prog = prog;
    this.loc = {
      uOnlyFree: gl.getUniformLocation(prog, 'uOnlyFree'),
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aVal: gl.getAttribLocation(prog, 'aVal'),
      aCol: gl.getAttribLocation(prog, 'aCol'),
      aFlag: gl.getAttribLocation(prog, 'aFlag'),
      uCam: gl.getUniformLocation(prog, 'uCam'),
      uScale: gl.getUniformLocation(prog, 'uScale'),
      uViewport: gl.getUniformLocation(prog, 'uViewport'),
      uOffset: gl.getUniformLocation(prog, 'uOffset'),
      uPointSize: gl.getUniformLocation(prog, 'uPointSize'),
      uRamp: gl.getUniformLocation(prog, 'uRamp'),
      uRow: gl.getUniformLocation(prog, 'uRow'),
      uMaterialMode: gl.getUniformLocation(prog, 'uMaterialMode'),
      uDark: gl.getUniformLocation(prog, 'uDark'),
      uAlpha: gl.getUniformLocation(prog, 'uAlpha'),
    };

    this.bufPos = gl.createBuffer();
    this.bufVal = gl.createBuffer();
    this.bufCol = gl.createBuffer();
    this.bufFlag = gl.createBuffer();
    this.ramp = this.buildRamp();

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // The smooth-surface programs are optional: if either fails to build the
    // discrete path above still works and the renderer is told to use it.
    this.smoothOK = false;
    this.accum = null; this.fbo = null; this.accumW = 0; this.accumH = 0;
    try {
      const splat = this.buildProgram(VERT, SPLAT_FRAG);
      const comp = this.buildProgram(COMP_VERT, COMP_FRAG, ['aQuad']);
      this.splat = {
        prog: splat,
        uCam: gl.getUniformLocation(splat, 'uCam'),
        uScale: gl.getUniformLocation(splat, 'uScale'),
        uViewport: gl.getUniformLocation(splat, 'uViewport'),
        uOffset: gl.getUniformLocation(splat, 'uOffset'),
        uPointSize: gl.getUniformLocation(splat, 'uPointSize'),
        uOnlyFree: gl.getUniformLocation(splat, 'uOnlyFree'),
        uRamp: gl.getUniformLocation(splat, 'uRamp'),
        uRow: gl.getUniformLocation(splat, 'uRow'),
        uMaterialMode: gl.getUniformLocation(splat, 'uMaterialMode'),
        uNorm: gl.getUniformLocation(splat, 'uNorm'),
      };
      this.comp = {
        prog: comp,
        uAccum: gl.getUniformLocation(comp, 'uAccum'),
        uViewport: gl.getUniformLocation(comp, 'uViewport'),
        uShift: gl.getUniformLocation(comp, 'uShift'),
        uDark: gl.getUniformLocation(comp, 'uDark'),
        uAlpha: gl.getUniformLocation(comp, 'uAlpha'),
        uLo: gl.getUniformLocation(comp, 'uLo'),
        uHi: gl.getUniformLocation(comp, 'uHi'),
        uClip: gl.getUniformLocation(comp, 'uClip'),
        uBandC: gl.getUniformLocation(comp, 'uBandC'),
        uBandL: gl.getUniformLocation(comp, 'uBandL'),
        uBandT: gl.getUniformLocation(comp, 'uBandT'),
      };
      this.bufQuad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bufQuad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      this.smoothOK = true;
    } catch (e) {
      console.warn('smooth surface unavailable, using discrete nodes:', e.message);
    }
  }

  /**
   * Compile and link a program. Attribute locations are fixed so every
   * program that shares the node buffers agrees on which array is which, and
   * so a leftover enabled array from one program can never alias another's.
   */
  buildProgram(vsSrc, fsSrc, attribs = ['aPos', 'aVal', 'aCol', 'aFlag']) {
    const gl = this.gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
    attribs.forEach((a, i) => gl.bindAttribLocation(prog, i, a));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    return prog;
  }

  /** Offscreen accumulation target, rebuilt whenever the canvas size changes. */
  ensureAccum(w, h) {
    const gl = this.gl;
    if (this.accum && this.accumW === w && this.accumH === h) return true;
    if (this.accum) gl.deleteTexture(this.accum);
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    // Half-float where the context can render to it: thousands of small
    // overlapping weights lose their low bits in an 8-bit target and show as
    // mottled, smeared colour.
    const isGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    let floatOK = false;
    if (isGL2 && (gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      floatOK = true;
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    this.accumFloat = floatOK;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (!ok && floatOK) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.accumFloat = false;
      ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) {
      gl.deleteTexture(tex); gl.deleteFramebuffer(fbo);
      this.accum = null; this.fbo = null;
      this.smoothOK = false;
      return false;
    }
    this.accum = tex; this.fbo = fbo; this.accumW = w; this.accumH = h;
    return true;
  }

  /** One 256 x 8 RGBA texture holding every colour ramp, one per row. */
  buildRamp() {
    const gl = this.gl;
    const W = 256, H = 8;
    const data = new Uint8Array(W * H * 4);
    RAMP_ROWS.forEach((key, row) => {
      const fn = RAMP_FNS[key];
      for (let x = 0; x < W; x++) {
        const c = fn(x / (W - 1));
        const o = (row * W + x) * 4;
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
      }
    });
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.rampRows = H;
    return tex;
  }

  rowFor(mode) {
    const i = RAMP_ROWS.indexOf(mode);
    return ((i < 0 ? 1 : i) + 0.5) / this.rampRows;
  }

  /** Grow the CPU staging arrays and the GPU buffers to hold `n` points. */
  ensure(n) {
    if (n <= this.capacity) return;
    const cap = Math.max(1024, 1 << Math.ceil(Math.log2(n + 1)));
    const gl = this.gl;
    this.pos = new Float32Array(cap * 2);
    this.val = new Float32Array(cap);
    this.col = new Float32Array(cap * 3);
    this.flag = new Float32Array(cap);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.bufferData(gl.ARRAY_BUFFER, cap * 2 * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufVal);
    gl.bufferData(gl.ARRAY_BUFFER, cap * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCol);
    gl.bufferData(gl.ARRAY_BUFFER, cap * 3 * 4, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufFlag);
    gl.bufferData(gl.ARRAY_BUFFER, cap * 4, gl.DYNAMIC_DRAW);
    this.capacity = cap;
    this.colourStamp = null;      // force a material-colour re-upload
  }

  resize(w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  clear() {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /**
   * Upload the per-node material colours. Static for the life of a mesh, so
   * this runs once per shot rather than once per frame.
   */
  uploadColours(domain, hexOf) {
    const gl = this.gl;
    const n = domain.n;
    for (let i = 0; i < n; i++) {
      const key = domain.matTable[domain.matIndex[i]].mat.color;
      let c = this.matCache.get(key);
      if (!c) { const v = hexToRgb(key); c = [v[0] / 255, v[1] / 255, v[2] / 255]; this.matCache.set(key, c); }
      this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCol);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.col.subarray(0, n * 3));
    this.colourStamp = domain;
  }

  bindAttribs() {
    const gl = this.gl, L = this.loc;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.enableVertexAttribArray(L.aPos);
    gl.vertexAttribPointer(L.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufVal);
    gl.enableVertexAttribArray(L.aVal);
    gl.vertexAttribPointer(L.aVal, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufCol);
    gl.enableVertexAttribArray(L.aCol);
    gl.vertexAttribPointer(L.aCol, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufFlag);
    gl.enableVertexAttribArray(L.aFlag);
    gl.vertexAttribPointer(L.aFlag, 1, gl.FLOAT, false, 0, 0);
  }

  /**
   * @param {object} o {count, cam, mode, pointSize, extrude:[dx,dy], alpha}
   */
  /** Upload this frame's per-node position, value and flag. */
  uploadNodes(count) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pos.subarray(0, count * 2));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufVal);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.val.subarray(0, count));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufFlag);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.flag.subarray(0, count));
  }

  /**
   * Smooth, anti-aliased surface of the node field (see SPLAT_FRAG). Returns
   * false when it could not draw, so the caller can fall back to drawPoints.
   * @param {object} o {count, cam, mode, radiusPx, norm, extrude:[dx,dy], alpha,
   *                    dark, lo, hi}
   */
  drawSmooth(o) {
    if (this.lost || !this.smoothOK || o.count <= 0) return false;
    const gl = this.gl;
    const W = this.canvas.width, H = this.canvas.height;
    if (!this.ensureAccum(W, H)) return false;
    this.uploadNodes(o.count);

    // pass 1: accumulate every node's kernel into the offscreen target
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const S = this.splat;
    gl.useProgram(S.prog);
    this.bindAttribs();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.ramp);
    gl.uniform1i(S.uRamp, 0);
    gl.uniform2f(S.uCam, o.cam.x, o.cam.y);
    gl.uniform1f(S.uScale, o.cam.scale);
    gl.uniform2f(S.uViewport, W, H);
    gl.uniform2f(S.uOffset, 0, 0);
    gl.uniform1f(S.uPointSize, o.radiusPx * 2);
    gl.uniform1f(S.uOnlyFree, 0);
    gl.uniform1f(S.uRow, this.rowFor(o.mode));
    gl.uniform1f(S.uMaterialMode, o.mode === 'material' ? 1 : 0);
    gl.uniform1f(S.uNorm, o.norm);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, o.count);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);

    // pass 2: threshold the accumulated field onto the canvas, a dark
    // extruded copy first and the lit surface over it
    const C = this.comp;
    gl.useProgram(C.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufQuad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.accum);
    gl.uniform1i(C.uAccum, 0);
    gl.uniform2f(C.uViewport, W, H);
    gl.uniform1f(C.uLo, o.lo ?? 0.42);
    gl.uniform1f(C.uHi, o.hi ?? 0.58);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(C.uClip, 0);
    if (o.extrude && (o.extrude[0] || o.extrude[1])) {
      // The extruded copy is clipped to the corridor band: outside it the
      // static far field draws its own back face, and the two have to meet
      // at the band edge rather than overlap.
      if (o.band) {
        gl.uniform1f(C.uClip, 1);
        gl.uniform2f(C.uBandC, o.band.cx, o.band.cy);
        gl.uniform2f(C.uBandL, o.band.lx, o.band.ly);
        gl.uniform2f(C.uBandT, o.band.lo, o.band.hi);
      }
      gl.uniform2f(C.uShift, o.extrude[0], o.extrude[1]);
      gl.uniform1f(C.uDark, o.dark ?? 0.5);
      gl.uniform1f(C.uAlpha, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.uniform1f(C.uClip, 0);
    }
    gl.uniform2f(C.uShift, 0, 0);
    gl.uniform1f(C.uDark, 0);
    gl.uniform1f(C.uAlpha, o.alpha ?? 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }

  drawPoints(o) {
    if (this.lost) return;
    const gl = this.gl, L = this.loc;
    if (o.count <= 0) return;

    gl.useProgram(this.prog);
    if (!o.skipUpload) this.uploadNodes(o.count);
    this.bindAttribs();
    gl.uniform1f(L.uOnlyFree, o.onlyFree ? 1 : 0);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.ramp);
    gl.uniform1i(L.uRamp, 0);
    gl.uniform2f(L.uCam, o.cam.x, o.cam.y);
    gl.uniform1f(L.uScale, o.cam.scale);
    gl.uniform2f(L.uViewport, this.canvas.width, this.canvas.height);
    gl.uniform1f(L.uRow, this.rowFor(o.mode));
    gl.uniform1f(L.uMaterialMode, o.mode === 'material' ? 1 : 0);

    // extruded depth pass first, then the lit pass
    if (o.extrude && (o.extrude[0] || o.extrude[1])) {
      gl.uniform2f(L.uOffset, o.extrude[0], o.extrude[1]);
      gl.uniform1f(L.uPointSize, o.pointSize);
      gl.uniform1f(L.uDark, 0.86);
      gl.uniform1f(L.uAlpha, 0.6);
      gl.drawArrays(gl.POINTS, 0, o.count);
    }
    gl.uniform2f(L.uOffset, 0, 0);
    gl.uniform1f(L.uPointSize, o.pointSize);
    gl.uniform1f(L.uDark, 0);
    gl.uniform1f(L.uAlpha, o.alpha ?? 1);
    gl.drawArrays(gl.POINTS, 0, o.count);
  }
}
