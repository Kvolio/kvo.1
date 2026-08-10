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

varying float vVal;
varying vec3  vCol;
varying float vFree;

void main() {
  if (aFlag < 0.5) {                 // dead node: park it outside the frustum
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

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; }, false);
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.init(); this.capacity = 0; }, false);

    this.init();
  }

  init() {
    const gl = this.gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`link failed: ${gl.getProgramInfoLog(prog)}`);
    }
    this.prog = prog;
    this.loc = {
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
  drawPoints(o) {
    if (this.lost) return;
    const gl = this.gl, L = this.loc;
    if (o.count <= 0) return;

    gl.useProgram(this.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufPos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pos.subarray(0, o.count * 2));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufVal);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.val.subarray(0, o.count));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufFlag);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.flag.subarray(0, o.count));
    this.bindAttribs();

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
