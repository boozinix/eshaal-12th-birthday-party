import { J2000, type Elements } from "./solarCatalog";

const DEG = Math.PI / 180;

/** Julian Day for a JS Date (UTC). */
export function dateToJD(d: Date): number {
  return d.getTime() / 86400000 + 2440587.5;
}

export function jdToDate(jd: number): Date {
  return new Date((jd - 2440587.5) * 86400000);
}

function solveKepler(M: number, e: number): number {
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 30; k++) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

/**
 * Position in the orbit's reference plane frame → three.js frame (x toward the
 * reference direction, y up / north pole, z = -y_ref). Returns [x, y, z] in the
 * units of `el.a`.
 */
export function orbitPosition(el: Elements, jd: number): [number, number, number] {
  const T = (jd - J2000) / 36525;
  const a = el.a + (el.rates?.a ?? 0) * T;
  const e = el.e + (el.rates?.e ?? 0) * T;
  const i = (el.i + (el.rates?.i ?? 0) * T) * DEG;
  const om = (el.om + (el.rates?.om ?? 0) * T) * DEG;
  const w = (el.w + (el.rates?.w ?? 0) * T) * DEG;
  let M = ((el.m0 + el.n * (jd - J2000)) % 360) * DEG;
  if (M < 0) M += 2 * Math.PI;
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  return rotateToFrame(xp, yp, i, om, w);
}

function rotateToFrame(
  xp: number,
  yp: number,
  i: number,
  om: number,
  w: number,
): [number, number, number] {
  const cw = Math.cos(w),
    sw = Math.sin(w);
  const co = Math.cos(om),
    so = Math.sin(om);
  const ci = Math.cos(i),
    si = Math.sin(i);
  const x = (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp;
  const y = (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp;
  const z = sw * si * xp + cw * si * yp;
  // Reference frame (x, y, z) with z = north pole → three.js (x, z, -y).
  return [x, z, -y];
}

/** Sample the whole orbit as a polyline (for drawing). */
export function orbitPath(el: Elements, segments = 256): Float32Array {
  const out = new Float32Array(segments * 3);
  const i = el.i * DEG,
    om = el.om * DEG,
    w = el.w * DEG;
  for (let k = 0; k < segments; k++) {
    const E = (k / segments) * Math.PI * 2;
    const xp = el.a * (Math.cos(E) - el.e);
    const yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    out.set(rotateToFrame(xp, yp, i, om, w), k * 3);
  }
  return out;
}
