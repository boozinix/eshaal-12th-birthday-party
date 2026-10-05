/**
 * Procedural "cosmic web" galaxy field.
 *
 * Real all-sky galaxy catalogues are not bundled with the app, so the faint
 * background galaxies are a STATISTICAL rendering: random points pushed onto
 * the surfaces of randomly packed bubbles (voids), which reproduces the
 * foam-like sheets, filaments and knots seen in redshift surveys. Named
 * structures in catalog.ts are placed at their real coordinates.
 */

export interface PointField {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  count: number;
}

// Deterministic PRNG so the universe looks the same on every load.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInSphere(
  rand: () => number,
  rMin: number,
  rMax: number,
  out: Float32Array,
  o: number,
) {
  // Uniform in volume between rMin and rMax.
  const u = rand();
  const r = Math.cbrt(rMin ** 3 + u * (rMax ** 3 - rMin ** 3));
  const cosT = 2 * rand() - 1;
  const sinT = Math.sqrt(1 - cosT * cosT);
  const phi = 2 * Math.PI * rand();
  out[o] = r * sinT * Math.cos(phi);
  out[o + 1] = r * cosT;
  out[o + 2] = r * sinT * Math.sin(phi);
}

/**
 * Local cosmic web: shells + filaments within `rMax` Mpc. Points closer than
 * `rMin` are suppressed so the real Local Group galaxies stand alone.
 */
export function generateCosmicWeb(opts: {
  count: number;
  rMin: number;
  rMax: number;
  seed?: number;
}): PointField {
  const { count, rMin, rMax } = opts;
  const rand = mulberry32(opts.seed ?? 42);

  // Void bubbles. Radii in Mpc. Larger bubbles are rarer.
  const voidCount = Math.round((rMax / 450) ** 3 * 2200);
  const vx = new Float32Array(voidCount);
  const vy = new Float32Array(voidCount);
  const vz = new Float32Array(voidCount);
  const vr = new Float32Array(voidCount);
  const tmp = new Float32Array(3);
  for (let i = 0; i < voidCount; i++) {
    randomInSphere(rand, 0, rMax * 1.08, tmp, 0);
    vx[i] = tmp[0];
    vy[i] = tmp[1];
    vz[i] = tmp[2];
    const u = rand();
    vr[i] = 14 + 40 * u * u; // 14 .. 54 Mpc, skewed small
  }

  // Spatial hash for nearest-void lookups.
  const cell = 60;
  const grid = new Map<number, number[]>();
  const key = (ix: number, iy: number, iz: number) =>
    ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512);
  for (let i = 0; i < voidCount; i++) {
    const R = vr[i];
    const x0 = Math.floor((vx[i] - R) / cell),
      x1 = Math.floor((vx[i] + R) / cell);
    const y0 = Math.floor((vy[i] - R) / cell),
      y1 = Math.floor((vy[i] + R) / cell);
    const z0 = Math.floor((vz[i] - R) / cell),
      z1 = Math.floor((vz[i] + R) / cell);
    for (let ix = x0; ix <= x1; ix++)
      for (let iy = y0; iy <= y1; iy++)
        for (let iz = z0; iz <= z1; iz++) {
          const k = key(ix, iy, iz);
          let arr = grid.get(k);
          if (!arr) grid.set(k, (arr = []));
          arr.push(i);
        }
  }

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  let n = 0;

  const pushOut = (p: Float32Array, o: number) => {
    // Push the point out of every bubble that contains it (a few passes).
    for (let pass = 0; pass < 3; pass++) {
      const ix = Math.floor(p[o] / cell),
        iy = Math.floor(p[o + 1] / cell),
        iz = Math.floor(p[o + 2] / cell);
      const arr = grid.get(key(ix, iy, iz));
      if (!arr) return;
      let moved = false;
      for (let j = 0; j < arr.length; j++) {
        const i = arr[j];
        const dx = p[o] - vx[i],
          dy = p[o + 1] - vy[i],
          dz = p[o + 2] - vz[i];
        const d2 = dx * dx + dy * dy + dz * dz;
        const R = vr[i];
        if (d2 < R * R && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const target = R * (1 + 0.06 * rand());
          const s = target / d;
          p[o] = vx[i] + dx * s;
          p[o + 1] = vy[i] + dy * s;
          p[o + 2] = vz[i] + dz * s;
          moved = true;
        }
      }
      if (!moved) return;
    }
  };

  const mainCount = Math.round(count * 0.82);
  for (let i = 0; i < mainCount; i++) {
    randomInSphere(rand, 0, rMax, positions, n * 3);
    pushOut(positions, n * 3);
    const r = Math.hypot(positions[n * 3], positions[n * 3 + 1], positions[n * 3 + 2]);
    if (r < rMin || r > rMax) continue;
    // Soft inner edge so the Local Volume isn't a hard hole.
    if (r < rMin * 2 && rand() > (r - rMin) / rMin) continue;
    const t = rand();
    colors[n * 3] = 0.55 + 0.45 * t;
    colors[n * 3 + 1] = 0.6 + 0.3 * t;
    colors[n * 3 + 2] = 0.85 + 0.15 * (1 - t);
    sizes[n] = 0.35 + 0.9 * rand() * rand();
    n++;
  }

  // Knots: dense clumps (galaxy groups and clusters) seeded on existing web points.
  const knotCount = Math.round(mainCount / 450);
  const perKnot = Math.max(1, Math.floor((count - n) / Math.max(1, knotCount)));
  for (let k = 0; k < knotCount && n < count; k++) {
    const src = Math.floor(rand() * n);
    const cx = positions[src * 3],
      cy = positions[src * 3 + 1],
      cz = positions[src * 3 + 2];
    const sigma = 1 + 2.5 * rand();
    for (let j = 0; j < perKnot && n < count; j++) {
      // Gaussian via Box–Muller.
      const g = () => Math.sqrt(-2 * Math.log(rand() + 1e-9)) * Math.cos(2 * Math.PI * rand());
      positions[n * 3] = cx + g() * sigma;
      positions[n * 3 + 1] = cy + g() * sigma;
      positions[n * 3 + 2] = cz + g() * sigma;
      const warm = rand();
      colors[n * 3] = 0.95;
      colors[n * 3 + 1] = 0.8 + 0.15 * warm;
      colors[n * 3 + 2] = 0.55 + 0.3 * (1 - warm);
      sizes[n] = 0.5 + 1.2 * rand();
      n++;
    }
  }

  return {
    positions: positions.subarray(0, n * 3),
    colors: colors.subarray(0, n * 3),
    sizes: sizes.subarray(0, n),
    count: n,
  };
}

/**
 * Distant field: sparse galaxies between rMin and rMax with a log-uniform
 * radial distribution, so every zoom level has a similar sprinkle of light.
 */
export function generateFarField(opts: {
  count: number;
  rMin: number;
  rMax: number;
  seed?: number;
}): PointField {
  const { count, rMin, rMax } = opts;
  const rand = mulberry32(opts.seed ?? 7);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const lnRatio = Math.log(rMax / rMin);
  for (let i = 0; i < count; i++) {
    const r = rMin * Math.exp(rand() * lnRatio);
    const cosT = 2 * rand() - 1;
    const sinT = Math.sqrt(1 - cosT * cosT);
    const phi = 2 * Math.PI * rand();
    positions[i * 3] = r * sinT * Math.cos(phi);
    positions[i * 3 + 1] = r * cosT;
    positions[i * 3 + 2] = r * sinT * Math.sin(phi);
    // Redder with distance (cosmological redshift, loosely).
    const f = Math.log(r / rMin) / lnRatio;
    colors[i * 3] = 0.9;
    colors[i * 3 + 1] = 0.85 - 0.35 * f;
    colors[i * 3 + 2] = 0.95 - 0.6 * f;
    sizes[i] = (0.6 + 1.2 * rand()) * (r / 300);
  }
  return { positions, colors, sizes, count };
}
