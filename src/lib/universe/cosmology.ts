// Small cosmology + coordinate helpers for the universe explorer.
// All distances are COMOVING distances in megaparsecs (Mpc).
// Flat ΛCDM: H0 = 70 km/s/Mpc, Ωm = 0.3, Ωr ≈ 9e-5, ΩΛ = 1 - Ωm - Ωr.

const H0 = 70;
const C_KMS = 299792.458;
const OMEGA_M = 0.3;
const OMEGA_R = 9e-5;
const OMEGA_L = 1 - OMEGA_M - OMEGA_R;
const HUBBLE_DISTANCE = C_KMS / H0; // ≈ 4283 Mpc

export const MPC_TO_MLY = 3.2616; // 1 Mpc ≈ 3.26 million light-years
export const CMB_RADIUS_MPC = comovingDistance(1090); // ≈ 14,000 Mpc

function invE(z: number): number {
  const a = 1 + z;
  return 1 / Math.sqrt(OMEGA_R * a ** 4 + OMEGA_M * a ** 3 + OMEGA_L);
}

/** Comoving line-of-sight distance to redshift z, in Mpc. */
export function comovingDistance(z: number): number {
  if (z <= 0) return 0;
  // Integrate dz / E(z) in u = ln(1+z) for stability at large z.
  const steps = 1200;
  const uMax = Math.log(1 + z);
  const h = uMax / steps;
  let sum = 0;
  for (let i = 0; i <= steps; i++) {
    const u = i * h;
    const zz = Math.exp(u) - 1;
    const f = invE(zz) * Math.exp(u); // dz = e^u du
    const w = i === 0 || i === steps ? 1 : i % 2 === 1 ? 4 : 2;
    sum += w * f;
  }
  return (HUBBLE_DISTANCE * sum * h) / 3;
}

/**
 * Convert equatorial RA/Dec (degrees) + distance (Mpc) to a right-handed
 * three.js frame: +Y is celestial north (Dec +90), +X points to RA 0h,
 * and -Z points to RA 6h.
 */
export function raDecToXYZ(raDeg: number, decDeg: number, dist: number): [number, number, number] {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  const cd = Math.cos(dec);
  return [dist * cd * Math.cos(ra), dist * Math.sin(dec), -dist * cd * Math.sin(ra)];
}

export function formatMpc(mpc: number): string {
  if (mpc < 0.001) return `${(mpc * 1e6).toFixed(0)} pc`;
  if (mpc < 1) return `${(mpc * 1000).toFixed(0)} kpc`;
  if (mpc < 1000) return `${mpc < 10 ? mpc.toFixed(2) : mpc.toFixed(0)} Mpc`;
  return `${(mpc / 1000).toFixed(2)} Gpc`;
}

export function formatLy(mpc: number): string {
  const mly = mpc * MPC_TO_MLY;
  if (mly < 0.001) return `${(mly * 1e6).toFixed(0)} ly`;
  if (mly < 1) return `${(mly * 1000).toFixed(0)} thousand ly`;
  if (mly < 1000) return `${mly < 10 ? mly.toFixed(2) : mly.toFixed(0)} million ly`;
  return `${(mly / 1000).toFixed(2)} billion ly`;
}

export function formatBoth(mpc: number): string {
  return `${formatMpc(mpc)} (${formatLy(mpc)})`;
}
