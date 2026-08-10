/**
 * Colour system. Field colour maps are perceptually ordered ramps so that a
 * reading can be taken off the image, not just admired.
 */

import { clamp } from '../core/math.js';

export const UI = {
  bg0: '#0a0d12',
  bg1: '#11151c',
  grid: 'rgba(120,150,180,0.07)',
  gridMajor: 'rgba(120,150,180,0.15)',
  ink: '#d6dde6',
  dim: '#7d8794',
  accent: '#4fb0d8',
  warn: '#e0a23c',
  danger: '#d8564a',
  ok: '#5fbf7f',
  corridor: 'rgba(79,176,216,0.20)',
};

function ramp(stops) {
  return (t) => {
    t = clamp(t, 0, 1);
    for (let i = 0; i < stops.length - 1; i++) {
      const [a, ca] = stops[i], [b, cb] = stops[i + 1];
      if (t >= a && t <= b) {
        const f = (t - a) / (b - a || 1);
        return [
          Math.round(ca[0] + (cb[0] - ca[0]) * f),
          Math.round(ca[1] + (cb[1] - ca[1]) * f),
          Math.round(ca[2] + (cb[2] - ca[2]) * f),
        ];
      }
    }
    return stops[stops.length - 1][1];
  };
}

/** Damage: intact steel-grey -> hot orange -> failed black-red. */
export const RAMP_DAMAGE = ramp([
  [0.00, [125, 135, 152]],
  [0.25, [150, 138, 120]],
  [0.55, [196, 122, 62]],
  [0.80, [176, 66, 46]],
  [1.00, [72, 30, 30]],
]);

/** Plastic strain: cold blue -> white-hot worked metal. */
export const RAMP_PLASTIC = ramp([
  [0.00, [58, 78, 104]],
  [0.35, [96, 150, 186]],
  [0.70, [214, 206, 176]],
  [1.00, [252, 246, 232]],
]);

/** Temperature: black-body-like. */
export const RAMP_TEMP = ramp([
  [0.00, [46, 52, 62]],
  [0.30, [140, 54, 40]],
  [0.55, [214, 112, 38]],
  [0.78, [244, 190, 76]],
  [1.00, [255, 248, 226]],
]);

/** Velocity magnitude: viridis-like, safe in both light and dark surrounds. */
export const RAMP_VELOCITY = ramp([
  [0.00, [42, 46, 58]],
  [0.25, [46, 92, 130]],
  [0.50, [40, 150, 140]],
  [0.75, [140, 190, 78]],
  [1.00, [248, 232, 116]],
]);

/** Stress: diverging — compression blue, tension red. */
export const RAMP_STRESS = ramp([
  [0.00, [58, 108, 190]],
  [0.35, [90, 120, 150]],
  [0.50, [120, 128, 136]],
  [0.65, [176, 116, 92]],
  [1.00, [216, 74, 58]],
]);

/**
 * Fixed normalisation constants for the scalar fields. They are shared by the
 * renderer, the GPU shader and the frame recorder so that a scrubbed frame is
 * coloured on exactly the same scale as the live one.
 */
export const FIELD_SCALES = {
  tempSpan: 1200,     // K above ambient mapped across the ramp
  velocity: 2000,     // m/s at the top of the ramp
  stress: 2.5e9,      // Pa at each end of the diverging ramp
  plasticSpan: 3,     // multiples of the material failure strain
};

export const FIELD_MODES = [
  { key: 'material', label: 'Material', legend: 'body colour by material, darkened by local damage' },
  { key: 'damage', label: 'Damage φ', unit: '0–1', legend: 'fraction of a node\'s bonds that have failed' },
  { key: 'plastic', label: 'Plastic strain', unit: '0–εf', legend: 'accumulated equivalent plastic strain' },
  { key: 'temp', label: 'Temperature', unit: '°C', legend: 'adiabatic heating from plastic work' },
  { key: 'velocity', label: 'Velocity', unit: 'm/s', legend: 'node speed' },
  { key: 'stress', label: 'Stress (virial)', unit: 'Pa', legend: 'nodal virial stress, tension positive' },
];

export function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }

export function shade(c, f) {
  return `rgb(${Math.round(c[0] * f)},${Math.round(c[1] * f)},${Math.round(c[2] * f)})`;
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
