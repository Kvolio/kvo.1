/**
 * Display formatting. The solver is strictly SI; only these helpers convert.
 */

const sub = (v, digits) => (Math.abs(v) >= 100 ? v.toFixed(0)
  : Math.abs(v) >= 10 ? v.toFixed(Math.min(1, digits))
    : v.toFixed(digits));

export const mm = (m, d = 1) => `${sub(m * 1000, d)} mm`;
export const mmv = (m) => m * 1000;
export const cm = (m, d = 1) => `${sub(m * 100, d)} cm`;

export function len(m, d = 1) {
  const a = Math.abs(m);
  if (a < 0.001) return `${(m * 1e6).toFixed(0)} µm`;
  if (a < 1) return `${sub(m * 1000, d)} mm`;
  return `${sub(m, d + 1)} m`;
}

export function vel(v, d = 0) { return `${v.toFixed(d)} m/s`; }

export function mass(kg) {
  const a = Math.abs(kg);
  if (a < 1e-3) return `${(kg * 1e6).toFixed(1)} mg`;
  if (a < 1) return `${(kg * 1000).toFixed(1)} g`;
  return `${kg.toFixed(3)} kg`;
}

export function energy(j) {
  const a = Math.abs(j);
  if (a < 1000) return `${j.toFixed(0)} J`;
  if (a < 1e6) return `${(j / 1e3).toFixed(1)} kJ`;
  return `${(j / 1e6).toFixed(2)} MJ`;
}

export function pressure(pa) {
  const a = Math.abs(pa);
  if (a < 1e6) return `${(pa / 1e3).toFixed(0)} kPa`;
  if (a < 1e9) return `${(pa / 1e6).toFixed(0)} MPa`;
  return `${(pa / 1e9).toFixed(2)} GPa`;
}

export function time(s) {
  const a = Math.abs(s);
  if (a < 1e-6) return `${(s * 1e9).toFixed(0)} ns`;
  if (a < 1e-3) return `${(s * 1e6).toFixed(1)} µs`;
  if (a < 1) return `${(s * 1e3).toFixed(2)} ms`;
  return `${s.toFixed(3)} s`;
}

export function temp(k) { return `${(k - 273.15).toFixed(0)} °C`; }

export const pct = (x, d = 0) => `${(x * 100).toFixed(d)} %`;

export function deg(r) { return `${(r * 180 / Math.PI).toFixed(1)}°`; }
