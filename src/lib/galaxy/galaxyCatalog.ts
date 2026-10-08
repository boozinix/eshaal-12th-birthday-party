/**
 * Milky Way catalogue. World units are kiloparsecs in a galactocentric frame:
 * origin at Sagittarius A*, +x toward the Sun, +y toward the north galactic pole.
 * Objects are given in heliocentric galactic coordinates (l, b in degrees, d in kpc).
 */

export type GalaxyType =
  | "star"
  | "cluster"
  | "nebula"
  | "arm"
  | "structure"
  | "satellite"
  | "landmark";

export interface GalaxyEntry {
  id: string;
  name: string;
  alt?: string;
  type: GalaxyType;
  /** Galactic longitude/latitude (deg) and heliocentric distance (kpc). */
  l?: number;
  b?: number;
  d?: number;
  /** Or an explicit galactocentric position (kpc, three.js frame). */
  pos?: [number, number, number];
  /** Radius in kpc (sphere) or semi-axes for ellipsoids. */
  r?: number;
  size?: [number, number, number];
  /** Rotation of an ellipsoid about the vertical axis, degrees (0 = long axis toward the Sun). */
  yaw?: number;
  shape?: "point" | "sphere" | "ellipsoid" | "shell";
  approx?: boolean;
  desc: string;
}

export interface GalaxyObject extends GalaxyEntry {
  pos: [number, number, number];
  radius: number;
  /** Distance from the Sun in kpc. */
  dSun: number;
}

export const KPC_TO_LY = 3261.56;
export const SUN_R = 8.2; // kpc from the Galactic Centre
export const SUN_POS: [number, number, number] = [SUN_R, 0.02, 0];

export const GALAXY_TYPE_META: Record<
  GalaxyType,
  { label: string; plural: string; color: string; order: number }
> = {
  star: { label: "Star", plural: "Stars near the Sun", color: "#fff4d6", order: 0 },
  cluster: { label: "Star cluster", plural: "Star clusters", color: "#ffd27a", order: 1 },
  nebula: {
    label: "Nebula / star-forming region",
    plural: "Nebulae & star-forming regions",
    color: "#ff8fb0",
    order: 2,
  },
  arm: { label: "Spiral arm", plural: "Spiral arms", color: "#9fd3ff", order: 3 },
  structure: {
    label: "Galactic structure",
    plural: "Galactic structure",
    color: "#c084fc",
    order: 4,
  },
  satellite: {
    label: "Satellite galaxy",
    plural: "Satellite galaxies",
    color: "#5cf2d6",
    order: 5,
  },
  landmark: { label: "Landmark", plural: "Landmarks", color: "#ffffff", order: 6 },
};

/** Heliocentric galactic (l, b, d) → galactocentric three.js position. */
export function galToXYZ(lDeg: number, bDeg: number, d: number): [number, number, number] {
  const l = (lDeg * Math.PI) / 180;
  const b = (bDeg * Math.PI) / 180;
  const xh = d * Math.cos(b) * Math.cos(l); // toward the Galactic Centre
  const yh = d * Math.cos(b) * Math.sin(l); // toward l = 90° (direction of rotation)
  const zh = d * Math.sin(b); // toward the north galactic pole
  return [SUN_POS[0] - xh, SUN_POS[1] + zh, SUN_POS[2] + yh];
}

/** Spiral-arm model used both for the star field and for arm labels. */
export const PITCH = (12.5 * Math.PI) / 180;
export const ARM_K = Math.tan(PITCH);
export interface ArmDef {
  id: string;
  name: string;
  /** Radius (kpc) where the arm crosses the Sun's azimuth. */
  r0: number;
  /** Azimuth range (radians, counter-clockwise seen from the north pole). */
  phiMin: number;
  phiMax: number;
  /** Azimuth where the label sits. */
  phiLabel: number;
  desc: string;
}
export const ARMS: ArmDef[] = [
  {
    id: "norma",
    name: "Norma Arm",
    r0: 3.6,
    phiMin: -0.2,
    phiMax: 7.0,
    phiLabel: 0.9,
    desc: "The innermost major arm, starting at the end of the bar and winding out behind the Galactic Centre. Seen from Earth it lies low in the southern sky in Norma.",
  },
  {
    id: "sctcen",
    name: "Scutum–Centaurus Arm",
    r0: 5.0,
    phiMin: -1.5,
    phiMax: 6.5,
    phiLabel: -0.55,
    desc: "One of the two dominant arms, rich in young stars and giant molecular clouds. Its tangent points are in Scutum (toward the centre) and Centaurus.",
  },
  {
    id: "sgrcar",
    name: "Sagittarius–Carina Arm",
    r0: 6.6,
    phiMin: -2.5,
    phiMax: 5.0,
    phiLabel: -0.35,
    desc: "The arm just inside the Sun's orbit, home of the Lagoon, Eagle, Omega and Carina nebulae. It passes about 1.5 kpc inward from the Sun.",
  },
  {
    id: "local",
    name: "Orion Spur",
    alt: "Local Arm",
    r0: 8.4,
    phiMin: -0.7,
    phiMax: 1.1,
    phiLabel: 0.35,
    desc: "The short spur the Sun lives in, between the Sagittarius and Perseus arms. It holds Orion, Cygnus X and most of the bright stars in our sky.",
  } as ArmDef & { alt: string },
  {
    id: "perseus",
    name: "Perseus Arm",
    r0: 9.9,
    phiMin: -3.0,
    phiMax: 3.5,
    phiLabel: 0.3,
    desc: "The major arm just outside the Sun's orbit, about 2 kpc away toward Perseus and Cassiopeia. The Double Cluster and the Heart and Soul nebulae lie in it.",
  },
  {
    id: "outer",
    name: "Outer Arm",
    alt: "Norma–Outer Arm",
    r0: 13.0,
    phiMin: -2.5,
    phiMax: 2.0,
    phiLabel: 0.1,
    desc: "A sparse outer arm 4 to 5 kpc beyond the Sun, probably the continuation of the Norma Arm after a full turn around the Galaxy.",
  } as ArmDef & { alt: string },
];

export function armRadius(arm: ArmDef, phi: number) {
  return arm.r0 * Math.exp(ARM_K * phi);
}

export function armPoint(arm: ArmDef, phi: number): [number, number, number] {
  const r = armRadius(arm, phi);
  return [r * Math.cos(phi), 0, -r * Math.sin(phi)];
}

const S = (
  id: string,
  name: string,
  l: number,
  b: number,
  d: number,
  desc: string,
  alt?: string,
): GalaxyEntry => ({ id, name, alt, type: "star", l, b, d, r: 0.0005, desc });
const C = (
  id: string,
  name: string,
  l: number,
  b: number,
  d: number,
  r: number,
  desc: string,
  alt?: string,
): GalaxyEntry => ({ id, name, alt, type: "cluster", l, b, d, r, desc });
const N = (
  id: string,
  name: string,
  l: number,
  b: number,
  d: number,
  r: number,
  desc: string,
  alt?: string,
): GalaxyEntry => ({ id, name, alt, type: "nebula", l, b, d, r, desc });

export const GALAXY_CATALOG: GalaxyEntry[] = [
  {
    id: "sun",
    name: "Sun",
    alt: "Solar System",
    type: "landmark",
    pos: SUN_POS,
    r: 0.0002,
    desc: "Our star, 26,700 light-years from the Galactic Centre, orbiting once every 230 million years at 230 km/s. It sits 65 light-years above the mid-plane, in the Orion Spur.",
  },
  {
    id: "sgra",
    name: "Sagittarius A*",
    alt: "Galactic Centre",
    type: "landmark",
    pos: [0, 0, 0],
    r: 0.00001,
    desc: "The 4-million-solar-mass black hole at the centre of the Milky Way, imaged by the Event Horizon Telescope in 2022. The surrounding nuclear star cluster packs millions of stars into a few light-years.",
  },

  // ───────────── nearby stars ─────────────
  S(
    "acen",
    "Alpha Centauri",
    315.7,
    -0.7,
    0.00134,
    "The nearest star system: a Sun-like pair plus the red dwarf Proxima, 4.2 light-years away, which has at least one Earth-sized planet.",
    "Proxima Centauri",
  ),
  S(
    "sirius",
    "Sirius",
    227.2,
    -8.9,
    0.00264,
    "The brightest star in the night sky, a hot white star with a white-dwarf companion, 8.6 light-years away.",
  ),
  S(
    "vega",
    "Vega",
    67.4,
    19.2,
    0.0077,
    "The bright blue-white star of Lyra, 25 light-years away, surrounded by a debris disc. It was the pole star 12,000 years ago.",
  ),
  S(
    "arcturus",
    "Arcturus",
    15.1,
    69.1,
    0.0113,
    "An orange giant 37 light-years away, the brightest star in the northern sky, passing through the solar neighbourhood on an orbit from the thick disc.",
  ),
  S(
    "canopus",
    "Canopus",
    261.2,
    -25.3,
    0.095,
    "The second-brightest star in the sky, a white supergiant 310 light-years away, used by spacecraft for navigation.",
  ),
  S(
    "polaris",
    "Polaris",
    123.3,
    26.5,
    0.133,
    "The current pole star, a Cepheid supergiant about 430 light-years away.",
  ),
  S(
    "betelgeuse",
    "Betelgeuse",
    199.8,
    -9.0,
    0.17,
    "A red supergiant in Orion's shoulder, about 550 light-years away and expected to explode as a supernova sometime in the next 100,000 years.",
  ),
  S(
    "antares",
    "Antares",
    351.9,
    15.1,
    0.17,
    "The red supergiant heart of Scorpius, 550 light-years away, 700 times the Sun's diameter.",
  ),
  S(
    "rigel",
    "Rigel",
    209.2,
    -25.2,
    0.26,
    "A blue supergiant in Orion's foot, about 860 light-years away and 120,000 times as luminous as the Sun.",
  ),
  S(
    "deneb",
    "Deneb",
    84.3,
    2.0,
    0.8,
    "One of the most luminous stars visible to the eye, a blue-white supergiant roughly 2,600 light-years away in Cygnus.",
  ),

  // ───────────── clusters ─────────────
  C(
    "hyades",
    "Hyades",
    180.1,
    -22.4,
    0.047,
    0.005,
    "The nearest open cluster, the V-shaped face of Taurus, 150 light-years away.",
  ),
  C(
    "pleiades",
    "Pleiades",
    166.6,
    -23.5,
    0.136,
    0.004,
    "The Seven Sisters: a young cluster of hot blue stars 440 light-years away, passing through a cloud of dust.",
    "M45",
  ),
  C(
    "dbl",
    "Double Cluster",
    135.0,
    -3.6,
    2.3,
    0.01,
    "Two rich young clusters side by side in the Perseus Arm, each only about 13 million years old.",
    "NGC 869 / NGC 884",
  ),
  C(
    "m4",
    "M4",
    351.0,
    16.0,
    1.9,
    0.02,
    "The nearest globular cluster, 6,000 light-years away next to Antares, with stars 12.7 billion years old.",
  ),
  C(
    "m22",
    "M22",
    9.9,
    -7.6,
    3.2,
    0.025,
    "One of the brightest globular clusters, 10,000 light-years away toward the Galactic Centre.",
  ),
  C(
    "47tuc",
    "47 Tucanae",
    305.9,
    -44.9,
    4.5,
    0.03,
    "The second-brightest globular cluster, a dense ball of a million stars 15,000 light-years away below the disc.",
  ),
  C(
    "omegacen",
    "Omega Centauri",
    309.1,
    15.0,
    5.2,
    0.04,
    "The largest globular cluster, 10 million stars in a 150-light-year ball. It is probably the stripped core of a dwarf galaxy the Milky Way swallowed.",
    "NGC 5139",
  ),
  C(
    "wd1",
    "Westerlund 1",
    339.6,
    -0.4,
    3.9,
    0.003,
    "A super star cluster hidden behind dust, packed with hypergiants and Wolf–Rayet stars, and host of a rare magnetar.",
  ),
  C(
    "m13",
    "Hercules Cluster",
    59.0,
    40.9,
    7.1,
    0.04,
    "The great northern globular cluster, 23,000 light-years away in the halo, target of the 1974 Arecibo message.",
    "M13",
  ),
  C(
    "ngc3603",
    "NGC 3603",
    291.6,
    -0.5,
    7.0,
    0.003,
    "The densest known starburst cluster in the Galaxy, in the Carina arm beyond the Carina Nebula.",
  ),
  C(
    "ngc2419",
    "NGC 2419",
    180.4,
    25.2,
    82.6,
    0.05,
    "The 'Intergalactic Wanderer': a bright globular cluster 270,000 light-years out in the halo, farther than the Magellanic Clouds.",
  ),

  // ───────────── nebulae & star-forming regions ─────────────
  N(
    "orion",
    "Orion Nebula",
    209.0,
    -19.4,
    0.41,
    0.012,
    "The nearest massive star-forming region, 1,340 light-years away, lit by the four stars of the Trapezium. Visible to the naked eye as the middle 'star' of Orion's sword.",
    "M42",
  ),
  N(
    "vela",
    "Vela Supernova Remnant",
    263.9,
    -3.3,
    0.29,
    0.03,
    "The expanding shell of a star that exploded 11,000 years ago, 900 light-years away, with the Vela pulsar at its heart.",
  ),
  N(
    "cygloop",
    "Cygnus Loop",
    74.0,
    -8.6,
    0.74,
    0.02,
    "A 20,000-year-old supernova remnant 2,400 light-years away, whose brightest filaments are the Veil Nebula.",
    "Veil Nebula",
  ),
  N(
    "lagoon",
    "Lagoon Nebula",
    6.0,
    -1.2,
    1.25,
    0.02,
    "A bright emission nebula in Sagittarius, in the Sagittarius Arm toward the centre.",
    "M8",
  ),
  N(
    "cygx",
    "Cygnus X",
    80.2,
    0.8,
    1.4,
    0.1,
    "The richest star-forming complex within 5,000 light-years, containing the Cygnus OB2 association of thousands of hot young stars.",
  ),
  N(
    "rosette",
    "Rosette Nebula",
    206.3,
    -2.1,
    1.6,
    0.025,
    "A ring of glowing gas 5,000 light-years away in Monoceros, hollowed out by the cluster at its centre.",
  ),
  N(
    "eagle",
    "Eagle Nebula",
    17.0,
    0.8,
    1.7,
    0.02,
    "Home of the Pillars of Creation, 5,700 light-years away in the Sagittarius Arm.",
    "M16",
  ),
  N(
    "omega",
    "Omega Nebula",
    15.1,
    -0.7,
    1.7,
    0.02,
    "A bright star-forming cloud next to the Eagle Nebula in Sagittarius.",
    "M17",
  ),
  N(
    "crab",
    "Crab Nebula",
    184.6,
    -5.8,
    2.0,
    0.003,
    "The remnant of the supernova seen in 1054 AD, 6,500 light-years away in the Perseus Arm, powered by a pulsar spinning 30 times a second.",
    "M1",
  ),
  N(
    "carina",
    "Carina Nebula",
    287.6,
    -0.6,
    2.3,
    0.05,
    "A giant star-forming region four times larger than Orion's, 7,500 light-years away, containing the unstable supergiant Eta Carinae.",
    "NGC 3372",
  ),
  N(
    "w51",
    "W51",
    49.5,
    -0.4,
    5.4,
    0.05,
    "One of the most massive star-forming clouds in the Galaxy, 17,000 light-years away in the Sagittarius Arm.",
  ),
  N(
    "w49",
    "W49",
    43.2,
    0.0,
    11.1,
    0.05,
    "A giant molecular cloud and radio source on the far side of the Galaxy, 36,000 light-years away.",
  ),

  // ───────────── galactic structure ─────────────
  {
    id: "localbubble",
    name: "Local Bubble",
    type: "structure",
    pos: SUN_POS,
    r: 0.15,
    shape: "sphere",
    desc: "A 1,000-light-year cavity of hot thin gas blown by supernovae 14 million years ago. The Sun entered it about 5 million years ago; young stars are now forming on its surface.",
  },
  {
    id: "radcliffe",
    name: "Radcliffe Wave",
    type: "structure",
    l: 150,
    b: 0,
    d: 0.45,
    size: [1.3, 0.1, 0.2],
    yaw: 40,
    shape: "ellipsoid",
    approx: true,
    desc: "A 9,000-light-year-long undulating chain of gas clouds found in 2020, including Orion, Taurus, Perseus and Cepheus. The nearest part passes 500 light-years from the Sun.",
  },
  {
    id: "cmz",
    name: "Central Molecular Zone",
    type: "structure",
    pos: [0, 0, 0],
    r: 0.25,
    shape: "sphere",
    desc: "The innermost 1,600 light-years: a ring of dense molecular clouds holding 60 million solar masses of gas around the central black hole.",
  },
  {
    id: "bulge",
    name: "Galactic Bulge",
    type: "structure",
    pos: [0, 0, 0],
    r: 1.5,
    shape: "sphere",
    desc: "The peanut-shaped bulge of old stars at the heart of the Galaxy, 10,000 light-years across, built mostly from the buckled inner bar.",
  },
  {
    id: "bar",
    name: "Central Bar",
    type: "structure",
    pos: [0, 0, 0],
    size: [4.5, 0.4, 1.2],
    yaw: 27,
    shape: "ellipsoid",
    desc: "A bar of stars 30,000 light-years long, tilted about 27° from our line of sight so its near end points into Sagittarius. The spiral arms start from its ends.",
  },
  {
    id: "fermin",
    name: "Fermi Bubble (north)",
    type: "structure",
    pos: [0, 4.2, 0],
    size: [3, 4, 3],
    shape: "ellipsoid",
    approx: true,
    desc: "One of two gamma-ray lobes rising 25,000 light-years above and below the centre, inflated by an outburst from the central black hole a few million years ago.",
  },
  {
    id: "fermis",
    name: "Fermi Bubble (south)",
    type: "structure",
    pos: [0, -4.2, 0],
    size: [3, 4, 3],
    shape: "ellipsoid",
    approx: true,
    desc: "The southern gamma-ray lobe, mirror of the northern one.",
  },
  {
    id: "disc",
    name: "Stellar disc",
    type: "structure",
    pos: [0, 0, 0],
    r: 16,
    shape: "sphere",
    approx: true,
    desc: "The thin disc of 100 billion stars, about 100,000 light-years across but only 1,000 thick. All the spiral arms, gas and star formation live here.",
  },
  {
    id: "halo",
    name: "Stellar halo",
    type: "landmark",
    pos: [0, 0, 0],
    r: 100,
    shape: "shell",
    desc: "A sparse, roughly spherical cloud of old stars and globular clusters extending at least 300,000 light-years, wrapped in a dark-matter halo ten times larger still.",
  },
  {
    id: "sunorbit",
    name: "Sun's orbit",
    type: "landmark",
    pos: [SUN_R * Math.cos(1.2), 0, -SUN_R * Math.sin(1.2)],
    r: SUN_R,
    desc: "The Sun circles the Galactic Centre once every 230 million years. It has made about 20 laps since it formed.",
  },

  // ───────────── satellites ─────────────
  {
    id: "sgrdw",
    name: "Sagittarius Dwarf",
    type: "satellite",
    l: 5.6,
    b: -14.2,
    d: 26,
    r: 1.5,
    shape: "sphere",
    desc: "A dwarf galaxy on the far side of the Galactic Centre, being shredded by the Milky Way. Its stars trail around the whole sky in the Sagittarius Stream.",
  },
  {
    id: "cma",
    name: "Canis Major Overdensity",
    type: "satellite",
    l: 240,
    b: -8,
    d: 7.2,
    r: 1.0,
    shape: "sphere",
    approx: true,
    desc: "A clump of stars in the outer disc toward Canis Major, possibly the remains of a swallowed dwarf galaxy or just a warp in the disc.",
  },
  {
    id: "smith",
    name: "Smith's Cloud",
    type: "satellite",
    l: 39,
    b: -13,
    d: 12,
    r: 0.5,
    shape: "sphere",
    approx: true,
    desc: "A 10,000-light-year hydrogen cloud falling into the disc at 300 km/s, due to hit in about 30 million years.",
  },
  {
    id: "lmc",
    name: "Large Magellanic Cloud",
    type: "satellite",
    l: 280.5,
    b: -32.9,
    d: 50,
    r: 4.3,
    shape: "sphere",
    desc: "The largest satellite of the Milky Way, 160,000 light-years away, on its first close pass. Its gravity is pulling the Milky Way's halo out of shape.",
  },
  {
    id: "smc",
    name: "Small Magellanic Cloud",
    type: "satellite",
    l: 302.8,
    b: -44.3,
    d: 62,
    r: 2.2,
    shape: "sphere",
    desc: "The LMC's smaller companion, 200,000 light-years away, connected to it by a bridge of gas and stars.",
  },
  {
    id: "draco",
    name: "Draco Dwarf",
    type: "satellite",
    l: 86.4,
    b: 34.7,
    d: 76,
    r: 0.5,
    shape: "sphere",
    desc: "A faint dwarf spheroidal galaxy 250,000 light-years away, one of the most dark-matter-dominated objects known.",
  },
  {
    id: "umi",
    name: "Ursa Minor Dwarf",
    type: "satellite",
    l: 105.0,
    b: 44.8,
    d: 76,
    r: 0.5,
    shape: "sphere",
    desc: "An ancient dwarf spheroidal satellite whose stars all formed over 10 billion years ago.",
  },
  {
    id: "sculptor",
    name: "Sculptor Dwarf",
    type: "satellite",
    l: 287.5,
    b: -83.2,
    d: 86,
    r: 0.6,
    shape: "sphere",
    desc: "The first dwarf spheroidal galaxy ever found (1937), 280,000 light-years below the Galactic plane.",
  },
  {
    id: "fornax",
    name: "Fornax Dwarf",
    type: "satellite",
    l: 237.1,
    b: -65.7,
    d: 147,
    r: 1.0,
    shape: "sphere",
    desc: "The brightest of the classic dwarf spheroidals, 480,000 light-years away, unusual for owning its own globular clusters.",
  },
];

export function buildGalaxy(): GalaxyObject[] {
  const out: GalaxyObject[] = [];
  for (const e of GALAXY_CATALOG) {
    const pos = e.pos ?? galToXYZ(e.l!, e.b!, e.d!);
    const radius = e.r ?? (e.size ? Math.max(...e.size) : 0.001);
    const dSun = Math.hypot(pos[0] - SUN_POS[0], pos[1] - SUN_POS[1], pos[2] - SUN_POS[2]);
    out.push({ ...e, pos, radius, dSun });
  }
  for (const a of ARMS) {
    const pos = armPoint(a, a.phiLabel);
    const dSun = Math.hypot(pos[0] - SUN_POS[0], pos[1] - SUN_POS[1], pos[2] - SUN_POS[2]);
    out.push({
      id: `arm-${a.id}`,
      name: a.name,
      alt: (a as ArmDef & { alt?: string }).alt,
      type: "arm",
      pos,
      radius: 0.6,
      dSun,
      desc: a.desc,
    });
  }
  return out;
}

export function formatKpc(kpc: number): string {
  const ly = kpc * KPC_TO_LY;
  if (ly < 1) return `${(ly * 63241).toFixed(0)} AU`;
  if (ly < 1000) return `${ly < 10 ? ly.toFixed(1) : ly.toFixed(0)} ly`;
  if (ly < 1e6) return `${(ly / 1000).toFixed(ly < 1e4 ? 1 : 0)} thousand ly`;
  return `${(ly / 1e6).toFixed(2)} million ly`;
}

export function formatPc(kpc: number): string {
  const pc = kpc * 1000;
  if (pc < 1) return `${(pc * 206265).toFixed(0)} AU`;
  if (pc < 1000) return `${pc < 10 ? pc.toFixed(1) : pc.toFixed(0)} pc`;
  return `${kpc.toFixed(kpc < 10 ? 2 : 1)} kpc`;
}
