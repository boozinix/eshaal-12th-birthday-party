/**
 * Procedural Milky Way star field in the galactocentric frame (kpc).
 * Density follows an exponential disc with log-spiral arm enhancement from the
 * arm model in galaxyCatalog.ts, plus a tilted bar, a bulge and a sparse halo.
 */
import { gauss, mulberry32, type PointField } from "@/lib/explorer/engine";
import { ARMS, ARM_K, armRadius } from "./galaxyCatalog";

function wrapPi(a: number) {
  return a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
}

/** Arm weight 0..1 at (r, phi): 1 on an arm ridge, 0 between arms. */
export function armWeight(r: number, phi: number): { w: number; local: boolean } {
  let best = 0;
  let local = false;
  const sigma = 0.42 + 0.02 * r;
  for (const arm of ARMS) {
    // Azimuth of this arm at radius r (may wrap several times).
    const phiArm = Math.log(r / arm.r0) / ARM_K;
    if (phiArm < arm.phiMin - 0.3 || phiArm > arm.phiMax + 0.3) continue;
    const dphi = wrapPi(phi - phiArm);
    const perp = r * dphi * Math.cos(Math.atan(ARM_K));
    const w = Math.exp(-(perp * perp) / (2 * sigma * sigma));
    if (w > best) {
      best = w;
      local = arm.id === "local";
    }
  }
  return { w: best, local };
}

export function generateGalaxyField(seed = 11): {
  disc: PointField;
  core: PointField;
  halo: PointField;
} {
  const rand = mulberry32(seed);

  // ───────── disc with arms ─────────
  const discN = 260000;
  const pos = new Float32Array(discN * 3);
  const col = new Float32Array(discN * 3);
  const siz = new Float32Array(discN);
  let n = 0;
  let tries = 0;
  while (n < discN && tries < discN * 12) {
    tries++;
    // Exponential disc, scale length 2.8 kpc, truncated.
    const r = -2.8 * Math.log(1 - rand() * (1 - Math.exp(-18 / 2.8)));
    if (r < 0.6) continue;
    const phi = rand() * Math.PI * 2;
    const { w, local } = armWeight(r, phi);
    // Arms fade inside the bar region.
    const armFade = Math.min(1, Math.max(0, (r - 2.8) / 1.5));
    const keep = 0.16 + 0.84 * w * armFade;
    if (rand() > keep) continue;
    const thick = rand() < 0.15;
    const h = (thick ? 0.9 : 0.28) * (1 + r / 14);
    const z = gauss(rand) * h * 0.7;
    pos[n * 3] = r * Math.cos(phi);
    pos[n * 3 + 1] = z;
    pos[n * 3 + 2] = -r * Math.sin(phi);
    const onArm = w * armFade > 0.55 && !thick;
    const t = rand();
    if (onArm && t < 0.07) {
      // HII regions: pink and a little bigger.
      col.set([1.0, 0.55, 0.7], n * 3);
      siz[n] = 0.05 + 0.05 * rand();
    } else if (onArm) {
      col.set([0.72 + 0.2 * t, 0.8 + 0.15 * t, 1.0], n * 3);
      siz[n] = 0.02 + 0.03 * rand();
    } else {
      col.set([1.0, 0.9 - 0.1 * t, 0.72 + 0.1 * t], n * 3);
      siz[n] = 0.015 + 0.025 * rand();
    }
    if (local && onArm) siz[n] *= 1.1;
    n++;
  }
  const disc: PointField = {
    positions: pos.subarray(0, n * 3),
    colors: col.subarray(0, n * 3),
    sizes: siz.subarray(0, n),
    count: n,
  };

  // ───────── bar + bulge ─────────
  const coreN = 90000;
  const cp = new Float32Array(coreN * 3);
  const cc = new Float32Array(coreN * 3);
  const cs = new Float32Array(coreN);
  const yaw = (27 * Math.PI) / 180;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  for (let i = 0; i < coreN; i++) {
    let x: number, y: number, z: number;
    if (i < coreN * 0.45) {
      // Bar: elongated Gaussian, long axis tilted 27° from the Sun–centre line.
      const u = gauss(rand) * 1.6;
      const v = gauss(rand) * 0.45;
      y = gauss(rand) * 0.3;
      x = u * cy + v * sy;
      z = u * sy - v * cy;
      cc.set([1.0, 0.82, 0.55], i * 3);
    } else {
      // Bulge: flattened spheroid.
      const rr = Math.abs(gauss(rand)) * 0.75 + 0.02;
      const ct = 2 * rand() - 1;
      const st = Math.sqrt(1 - ct * ct);
      const ph = rand() * Math.PI * 2;
      x = rr * st * Math.cos(ph);
      y = rr * ct * 0.65;
      z = rr * st * Math.sin(ph);
      cc.set([1.0, 0.88, 0.62], i * 3);
    }
    cp.set([x, y, z], i * 3);
    cs[i] = 0.012 + 0.02 * rand();
  }
  const core: PointField = { positions: cp, colors: cc, sizes: cs, count: coreN };

  // ───────── halo + globular clusters ─────────
  const haloN = 14000;
  const hp = new Float32Array(haloN * 3);
  const hc = new Float32Array(haloN * 3);
  const hs = new Float32Array(haloN);
  for (let i = 0; i < haloN; i++) {
    const isGC = i < 160;
    const rMin = isGC ? 1.0 : 2.0;
    const rMax = isGC ? 40 : 80;
    // Density ∝ r^-3 → N(<r) ∝ ln r.
    const r = rMin * Math.pow(rMax / rMin, rand());
    const ct = 2 * rand() - 1;
    const st = Math.sqrt(1 - ct * ct);
    const ph = rand() * Math.PI * 2;
    hp.set([r * st * Math.cos(ph), r * ct * 0.85, r * st * Math.sin(ph)], i * 3);
    if (isGC) {
      hc.set([1.0, 0.95, 0.8], i * 3);
      hs[i] = 0.12 + 0.1 * rand();
    } else {
      hc.set([0.8, 0.85, 1.0], i * 3);
      hs[i] = 0.04 + 0.06 * rand();
    }
  }
  const halo: PointField = { positions: hp, colors: hc, sizes: hs, count: haloN };

  return { disc, core, halo };
}
