/**
 * Solar System catalogue. World units are astronomical units in a heliocentric
 * ecliptic frame: +x toward the vernal equinox, +y toward the north ecliptic pole.
 * Planet elements are the JPL approximate J2000 elements with secular rates;
 * dwarf planets, comets and moons use approximate elements and phases.
 */

export type SolarType =
  | "star"
  | "planet"
  | "dwarf"
  | "moon"
  | "small"
  | "probe"
  | "region"
  | "landmark";

export const AU_KM = 149597870.7;
export const AU_PER_LY = 63241.08;
export const J2000 = 2451545.0;

export interface Elements {
  /** Semi-major axis (AU; km for moons). */
  a: number;
  e: number;
  /** Inclination, deg. */
  i: number;
  /** Longitude of ascending node, deg. */
  om: number;
  /** Argument of perihelion, deg. */
  w: number;
  /** Mean anomaly at J2000, deg. */
  m0: number;
  /** Mean motion, deg/day. */
  n: number;
  /** Secular rates per Julian century (deg) for the planets. */
  rates?: { a: number; e: number; i: number; om: number; w: number };
}

export interface SolarEntry {
  id: string;
  name: string;
  alt?: string;
  type: SolarType;
  /** Mean radius, km. */
  radiusKm?: number;
  color?: string;
  el?: Elements;
  /** Moons: parent body id; `el.a` is then in km and tilt is the orbit's tilt from the ecliptic (deg). */
  parent?: string;
  tilt?: number;
  /** Fixed position for regions/probes/landmarks (AU). */
  pos?: [number, number, number];
  /** Radius of a region shell (AU). */
  r?: number;
  shape?: "sphere" | "shell";
  approx?: boolean;
  desc: string;
  /** Facts shown on the card. */
  facts?: [string, string][];
}

export const SOLAR_TYPE_META: Record<
  SolarType,
  { label: string; plural: string; color: string; order: number }
> = {
  star: { label: "Star", plural: "The Sun", color: "#ffe680", order: 0 },
  planet: { label: "Planet", plural: "Planets", color: "#9fd3ff", order: 1 },
  dwarf: { label: "Dwarf planet", plural: "Dwarf planets", color: "#ffd27a", order: 2 },
  moon: { label: "Moon", plural: "Moons", color: "#d9dde8", order: 3 },
  small: { label: "Asteroid / comet", plural: "Asteroids & comets", color: "#ffa64d", order: 4 },
  probe: { label: "Spacecraft", plural: "Spacecraft", color: "#5cf2d6", order: 5 },
  region: { label: "Region", plural: "Belts, clouds & boundaries", color: "#c084fc", order: 6 },
  landmark: { label: "Landmark", plural: "Landmarks", color: "#ffffff", order: 7 },
};

/** JPL approximate elements: a, e, I, L, long.peri, long.node + rates per century. */
function planet(
  id: string,
  name: string,
  radiusKm: number,
  color: string,
  v: [number, number, number, number, number, number],
  rates: [number, number, number, number, number, number],
  desc: string,
  facts: [string, string][],
): SolarEntry {
  const [a, e, i, L, lp, om] = v;
  const [da, de, di, dL, dlp, dom] = rates;
  return {
    id,
    name,
    type: "planet",
    radiusKm,
    color,
    desc,
    facts,
    el: {
      a,
      e,
      i,
      om,
      w: lp - om,
      m0: L - lp,
      n: dL / 36525,
      rates: { a: da, e: de, i: di, om: dom, w: dlp - dom },
    },
  };
}

function kepler(a: number): number {
  // Mean motion in deg/day for a heliocentric orbit of semi-major axis a (AU).
  return 360 / (365.25 * Math.pow(a, 1.5));
}

function dwarf(
  id: string,
  name: string,
  radiusKm: number,
  el: [number, number, number, number, number, number],
  desc: string,
  facts: [string, string][],
  type: SolarType = "dwarf",
  alt?: string,
): SolarEntry {
  const [a, e, i, om, w, m0] = el;
  return {
    id,
    name,
    alt,
    type,
    radiusKm,
    color: SOLAR_TYPE_META[type].color,
    el: { a, e, i, om, w, m0, n: kepler(a) },
    approx: true,
    desc,
    facts,
  };
}

function moon(
  id: string,
  name: string,
  parent: string,
  aKm: number,
  periodDays: number,
  radiusKm: number,
  tilt: number,
  desc: string,
  phase = 0,
): SolarEntry {
  return {
    id,
    name,
    type: "moon",
    parent,
    radiusKm,
    tilt,
    color: "#d9dde8",
    el: { a: aKm, e: 0, i: 0, om: 0, w: 0, m0: phase, n: 360 / periodDays },
    approx: true,
    desc,
  };
}

/** Ecliptic longitude/latitude (deg) and distance (AU) → three.js position. */
export function eclToXYZ(lonDeg: number, latDeg: number, d: number): [number, number, number] {
  const lon = (lonDeg * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  return [d * Math.cos(lat) * Math.cos(lon), d * Math.sin(lat), -d * Math.cos(lat) * Math.sin(lon)];
}

export const SOLAR_CATALOG: SolarEntry[] = [
  {
    id: "sun",
    name: "Sun",
    type: "star",
    radiusKm: 695700,
    color: "#fff2b0",
    pos: [0, 0, 0],
    desc: "A middle-aged yellow dwarf holding 99.86% of the Solar System's mass. Its light takes 8 minutes to reach Earth, 4 hours to reach Neptune, and over a year to reach the edge of the Oort cloud.",
    facts: [
      ["Diameter", "1.39 million km"],
      ["Age", "4.6 billion years"],
      ["Surface", "5,500 °C"],
    ],
  },

  planet(
    "mercury",
    "Mercury",
    2440,
    "#b8b0a8",
    [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593],
    [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    "The smallest planet and the closest to the Sun, a cratered world with no air whose day-side bakes at 430 °C while the poles hide water ice in permanent shadow.",
    [
      ["Orbit", "88 days"],
      ["Diameter", "4,880 km"],
      ["Distance", "0.39 AU"],
    ],
  ),
  planet(
    "venus",
    "Venus",
    6052,
    "#e8c57a",
    [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255],
    [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
    "Earth's twin in size but wrapped in a crushing carbon-dioxide atmosphere with sulphuric-acid clouds. Its surface is 465 °C, hotter than Mercury, and it spins backwards once every 243 days.",
    [
      ["Orbit", "225 days"],
      ["Diameter", "12,100 km"],
      ["Distance", "0.72 AU"],
    ],
  ),
  planet(
    "earth",
    "Earth",
    6371,
    "#6fa8ff",
    [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
    "Home. The only world known to carry life, with liquid oceans covering 71% of its surface and a large Moon that steadies its tilt.",
    [
      ["Orbit", "365.25 days"],
      ["Diameter", "12,742 km"],
      ["Distance", "1 AU = 150 million km"],
    ],
  ),
  planet(
    "mars",
    "Mars",
    3390,
    "#e07b4f",
    [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    "The red planet: a cold desert with the Solar System's tallest volcano (Olympus Mons, 22 km) and deepest canyon (Valles Marineris), and ancient river beds from a wetter past.",
    [
      ["Orbit", "687 days"],
      ["Diameter", "6,779 km"],
      ["Distance", "1.52 AU"],
    ],
  ),
  planet(
    "jupiter",
    "Jupiter",
    69911,
    "#e3b98a",
    [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    "The giant: 318 Earth masses, more than all the other planets combined, with a storm (the Great Red Spot) wider than Earth and at least 95 moons.",
    [
      ["Orbit", "11.9 years"],
      ["Diameter", "139,820 km"],
      ["Distance", "5.2 AU"],
    ],
  ),
  planet(
    "saturn",
    "Saturn",
    58232,
    "#f0d9a0",
    [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    "The ringed planet. Its rings are 280,000 km wide but mostly under 100 m thick, made of water ice. Less dense than water, it would float in a big enough bath.",
    [
      ["Orbit", "29.5 years"],
      ["Diameter", "116,460 km"],
      ["Distance", "9.5 AU"],
    ],
  ),
  planet(
    "uranus",
    "Uranus",
    25362,
    "#9fe3e8",
    [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503],
    [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    "An ice giant tipped on its side, rolling around the Sun with its poles pointing almost at it. Its 42-year seasons are the most extreme in the Solar System.",
    [
      ["Orbit", "84 years"],
      ["Diameter", "50,724 km"],
      ["Distance", "19.2 AU"],
    ],
  ),
  planet(
    "neptune",
    "Neptune",
    24622,
    "#5b7fff",
    [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
    "The outermost planet, a deep-blue ice giant with the fastest winds known (2,100 km/h). It was found in 1846 from its pull on Uranus, before anyone saw it.",
    [
      ["Orbit", "165 years"],
      ["Diameter", "49,244 km"],
      ["Distance", "30 AU"],
    ],
  ),

  // ───────────── dwarf planets & trans-Neptunian objects ─────────────
  dwarf(
    "ceres",
    "Ceres",
    470,
    [2.7666, 0.0785, 10.59, 80.3, 73.6, 7.0],
    "The largest body in the asteroid belt and the only dwarf planet inside Neptune's orbit. Bright salt deposits in Occator crater hint at brine seeping up from below.",
    [
      ["Orbit", "4.6 years"],
      ["Diameter", "940 km"],
    ],
  ),
  dwarf(
    "pluto",
    "Pluto",
    1188,
    [39.482, 0.2488, 17.14, 110.3, 113.8, 14.9],
    "The best-known dwarf planet, a world of nitrogen-ice plains and water-ice mountains visited by New Horizons in 2015. Its orbit sometimes brings it inside Neptune's.",
    [
      ["Orbit", "248 years"],
      ["Diameter", "2,377 km"],
      ["Moons", "5"],
    ],
  ),
  dwarf(
    "haumea",
    "Haumea",
    780,
    [43.1, 0.195, 28.2, 122.2, 239.0, 210.0],
    "An egg-shaped dwarf planet spinning once every 4 hours, with two moons and a thin ring.",
    [
      ["Orbit", "284 years"],
      ["Length", "2,100 km"],
    ],
  ),
  dwarf(
    "makemake",
    "Makemake",
    715,
    [45.4, 0.161, 29.0, 79.4, 294.8, 160.0],
    "A reddish dwarf planet covered in frozen methane, the second-brightest object in the Kuiper belt.",
    [
      ["Orbit", "306 years"],
      ["Diameter", "1,430 km"],
    ],
  ),
  dwarf(
    "quaoar",
    "Quaoar",
    555,
    [43.7, 0.04, 8.0, 189.0, 147.0, 290.0],
    "A Kuiper-belt dwarf planet with a ring far outside where rings should be able to survive.",
    [
      ["Orbit", "289 years"],
      ["Diameter", "1,110 km"],
    ],
  ),
  dwarf(
    "orcus",
    "Orcus",
    460,
    [39.2, 0.22, 20.6, 268.7, 72.4, 170.0],
    "Pluto's 'anti-twin': in the same resonance with Neptune but always on the opposite side of the Sun.",
    [
      ["Orbit", "245 years"],
      ["Diameter", "910 km"],
    ],
  ),
  dwarf(
    "gonggong",
    "Gonggong",
    615,
    [67.4, 0.5, 30.7, 336.8, 207.0, 105.0],
    "A red, slowly spinning dwarf planet in the scattered disc, with a moon called Xiangliu.",
    [
      ["Orbit", "554 years"],
      ["Diameter", "1,230 km"],
    ],
  ),
  dwarf(
    "eris",
    "Eris",
    1163,
    [67.9, 0.436, 44.0, 35.9, 151.6, 205.0],
    "Slightly smaller than Pluto but more massive. Its discovery in 2005 forced the definition of 'planet' and Pluto's reclassification.",
    [
      ["Orbit", "559 years"],
      ["Diameter", "2,326 km"],
      ["Now", "about 96 AU out"],
    ],
  ),
  dwarf(
    "sedna",
    "Sedna",
    500,
    [506, 0.85, 11.9, 144.5, 311.4, 357.6],
    "A reddish world on an 11,400-year orbit that never comes closer than 76 AU. It is near perihelion now; at aphelion it will be 900 AU out, in the inner Oort cloud.",
    [
      ["Orbit", "11,400 years"],
      ["Diameter", "1,000 km"],
    ],
  ),
  dwarf(
    "vp113",
    "2012 VP113",
    300,
    [262, 0.69, 24.0, 90.8, 293.8, 3.0],
    "'Biden': a sednoid whose perihelion of 80 AU lies far beyond the Kuiper belt, one of the clues for a hypothetical distant planet.",
    [["Orbit", "4,300 years"]],
    "small",
  ),
  dwarf(
    "vesta",
    "Vesta",
    263,
    [2.3617, 0.0887, 7.14, 103.8, 151.2, 20.0],
    "The brightest asteroid, with a basaltic crust and a giant impact basin at its south pole. Pieces of it fall to Earth as meteorites.",
    [
      ["Orbit", "3.6 years"],
      ["Diameter", "525 km"],
    ],
    "small",
  ),
  dwarf(
    "pallas",
    "Pallas",
    256,
    [2.772, 0.231, 34.8, 173.1, 310.0, 60.0],
    "The third-largest asteroid, on an unusually tilted orbit that carries it well above and below the belt.",
    [
      ["Orbit", "4.6 years"],
      ["Diameter", "512 km"],
    ],
    "small",
  ),
  dwarf(
    "halley",
    "Halley's Comet",
    6,
    [17.83, 0.967, 162.3, 58.4, 111.3, 320.0],
    "The famous periodic comet, last seen in 1986 and returning in 2061. It travels backwards around the Sun on an orbit stretching past Neptune.",
    [
      ["Orbit", "75 years"],
      ["Perihelion", "0.59 AU"],
    ],
    "small",
    "1P/Halley",
  ),

  // ───────────── moons ─────────────
  moon(
    "moon",
    "Moon",
    "earth",
    384400,
    27.32,
    1737,
    5.1,
    "Earth's only natural satellite, a quarter of Earth's diameter, formed from debris after a Mars-sized body hit the young Earth.",
    40,
  ),
  moon(
    "phobos",
    "Phobos",
    "mars",
    9376,
    0.319,
    11,
    26,
    "Mars's larger moon, a 22-km potato orbiting so close that it crosses the sky in 4 hours and will crash into Mars in 50 million years.",
    10,
  ),
  moon(
    "deimos",
    "Deimos",
    "mars",
    23463,
    1.263,
    6,
    26,
    "Mars's tiny outer moon, 12 km across.",
    200,
  ),
  moon(
    "io",
    "Io",
    "jupiter",
    421800,
    1.769,
    1822,
    3,
    "The most volcanically active world in the Solar System, kneaded by Jupiter's tides, with lava lakes and plumes 500 km high.",
    0,
  ),
  moon(
    "europa",
    "Europa",
    "jupiter",
    671100,
    3.551,
    1561,
    3,
    "An ice-crusted moon with a salty ocean beneath holding twice the water of Earth's oceans, a prime target in the search for life.",
    90,
  ),
  moon(
    "ganymede",
    "Ganymede",
    "jupiter",
    1070400,
    7.155,
    2634,
    3,
    "The largest moon in the Solar System, bigger than Mercury, and the only moon with its own magnetic field.",
    180,
  ),
  moon(
    "callisto",
    "Callisto",
    "jupiter",
    1882700,
    16.69,
    2410,
    3,
    "The most heavily cratered body known, an ancient icy moon that has barely changed in 4 billion years.",
    270,
  ),
  moon(
    "mimas",
    "Mimas",
    "saturn",
    185540,
    0.942,
    198,
    27,
    "The 'Death Star' moon, dominated by the 130-km crater Herschel.",
    30,
  ),
  moon(
    "enceladus",
    "Enceladus",
    "saturn",
    238040,
    1.37,
    252,
    27,
    "A small bright moon spraying water jets from its south pole into space, fed by a global ocean that may be habitable.",
    120,
  ),
  moon(
    "tethys",
    "Tethys",
    "saturn",
    294670,
    1.888,
    531,
    27,
    "An icy moon split by the 2,000-km canyon Ithaca Chasma.",
    210,
  ),
  moon(
    "dione",
    "Dione",
    "saturn",
    377420,
    2.737,
    561,
    27,
    "An icy moon with bright cliffs of fractured ice.",
    300,
  ),
  moon(
    "rhea",
    "Rhea",
    "saturn",
    527070,
    4.518,
    764,
    27,
    "Saturn's second-largest moon, which may once have had rings of its own.",
    60,
  ),
  moon(
    "titan",
    "Titan",
    "saturn",
    1221870,
    15.95,
    2575,
    27,
    "Saturn's giant moon, larger than Mercury, with a thick orange atmosphere and lakes of liquid methane. NASA's Dragonfly rotorcraft will land there in 2034.",
    150,
  ),
  moon(
    "iapetus",
    "Iapetus",
    "saturn",
    3560840,
    79.33,
    735,
    15,
    "A two-toned moon, one hemisphere coal-dark and the other bright ice, with a mountain ridge running around its equator.",
    240,
  ),
  moon(
    "miranda",
    "Miranda",
    "uranus",
    129900,
    1.413,
    236,
    98,
    "A small moon with a jumbled surface of cliffs up to 20 km high, as if it were shattered and reassembled.",
    0,
  ),
  moon(
    "ariel",
    "Ariel",
    "uranus",
    190900,
    2.52,
    579,
    98,
    "The brightest of Uranus's moons, crossed by long valleys.",
    90,
  ),
  moon(
    "umbriel",
    "Umbriel",
    "uranus",
    266000,
    4.144,
    585,
    98,
    "A dark, ancient moon of Uranus.",
    180,
  ),
  moon(
    "titania",
    "Titania",
    "uranus",
    436300,
    8.706,
    789,
    98,
    "Uranus's largest moon, with huge canyons.",
    270,
  ),
  moon(
    "oberon",
    "Oberon",
    "uranus",
    583500,
    13.46,
    761,
    98,
    "The outermost major moon of Uranus, heavily cratered.",
    45,
  ),
  moon(
    "triton",
    "Triton",
    "neptune",
    354760,
    5.877,
    1353,
    157,
    "Neptune's big moon, orbiting backwards: a captured Kuiper-belt object with nitrogen geysers and a surface at −235 °C.",
    0,
  ),
  moon(
    "charon",
    "Charon",
    "pluto",
    19591,
    6.387,
    606,
    120,
    "Pluto's half-sized companion; the two orbit a point between them, so they are often called a double dwarf planet.",
    0,
  ),
  moon(
    "dysnomia",
    "Dysnomia",
    "eris",
    37300,
    15.8,
    350,
    60,
    "Eris's moon, whose orbit let astronomers weigh Eris and show it is heavier than Pluto.",
    0,
  ),

  // ───────────── spacecraft (positions approximate for 2026) ─────────────
  {
    id: "voyager1",
    name: "Voyager 1",
    type: "probe",
    pos: eclToXYZ(255, 35, 168),
    approx: true,
    desc: "Launched in 1977 and now the most distant human-made object, 168 AU out and leaving the Solar System at 17 km/s. It crossed the heliopause in 2012.",
    facts: [
      ["Distance", "~168 AU"],
      ["Light delay", "23 hours"],
    ],
  },
  {
    id: "voyager2",
    name: "Voyager 2",
    type: "probe",
    pos: eclToXYZ(290, -36, 141),
    approx: true,
    desc: "The only spacecraft to have visited Uranus and Neptune, now 141 AU out in interstellar space heading south of the ecliptic.",
    facts: [["Distance", "~141 AU"]],
  },
  {
    id: "pioneer10",
    name: "Pioneer 10",
    type: "probe",
    pos: eclToXYZ(70, 3, 138),
    approx: true,
    desc: "The first spacecraft to cross the asteroid belt and fly past Jupiter (1973). Contact was lost in 2003; it drifts toward Aldebaran.",
    facts: [["Distance", "~138 AU"]],
  },
  {
    id: "pioneer11",
    name: "Pioneer 11",
    type: "probe",
    pos: eclToXYZ(280, 15, 116),
    approx: true,
    desc: "The first spacecraft to visit Saturn (1979), silent since 1995, heading toward the constellation Scutum.",
    facts: [["Distance", "~116 AU"]],
  },
  {
    id: "newhorizons",
    name: "New Horizons",
    type: "probe",
    pos: eclToXYZ(285, 2, 63),
    approx: true,
    desc: "Flew past Pluto in 2015 and the Kuiper-belt object Arrokoth in 2019; still operating in the outer Kuiper belt.",
    facts: [["Distance", "~63 AU"]],
  },

  // ───────────── regions ─────────────
  {
    id: "abelt",
    name: "Asteroid belt",
    type: "region",
    pos: [2.7, 0, 0],
    r: 0.6,
    desc: "Over a million rocky bodies between Mars and Jupiter, 2.1 to 3.3 AU from the Sun, with a total mass only 3% of the Moon's. Ceres holds a third of it.",
    facts: [["Span", "2.1 to 3.3 AU"]],
  },
  {
    id: "trojans",
    name: "Jupiter Trojans",
    type: "region",
    pos: [5.2, 0, 0],
    r: 0.8,
    desc: "Two swarms of asteroids sharing Jupiter's orbit, 60° ahead and behind it, trapped at the stable Lagrange points. NASA's Lucy mission is touring them.",
    facts: [["Count", "~10,000 known"]],
  },
  {
    id: "kbelt",
    name: "Kuiper belt",
    type: "region",
    pos: [44, 0, 0],
    r: 6,
    desc: "A doughnut of icy bodies beyond Neptune, 30 to 50 AU out, left over from planet formation. Pluto, Haumea and Makemake are its largest members.",
    facts: [["Span", "30 to 50 AU"]],
  },
  {
    id: "sdisc",
    name: "Scattered disc",
    type: "region",
    pos: [120, 20, 0],
    r: 60,
    approx: true,
    desc: "Bodies flung onto stretched, tilted orbits by Neptune, reaching hundreds of AU out. Eris and Gonggong live here; it feeds the short-period comets.",
    facts: [["Span", "50 to ~1,000 AU"]],
  },
  {
    id: "heliopause",
    name: "Heliopause",
    type: "region",
    pos: [0, 0, 0],
    r: 120,
    shape: "shell",
    desc: "Where the solar wind stops and interstellar space begins, about 120 AU out. Both Voyagers have crossed it. The Sun's gravity, though, reaches a thousand times farther.",
    facts: [["Radius", "~120 AU"]],
  },
  {
    id: "hills",
    name: "Inner Oort cloud",
    alt: "Hills cloud",
    type: "region",
    pos: [0, 0, 0],
    r: 20000,
    shape: "shell",
    approx: true,
    desc: "A flattened inner reservoir of comets from about 2,000 to 20,000 AU, never observed directly but inferred from Sedna-like orbits.",
    facts: [["Span", "2,000 to 20,000 AU"]],
  },
  {
    id: "oort",
    name: "Oort cloud",
    type: "region",
    pos: [0, 0, 0],
    r: 100000,
    shape: "shell",
    approx: true,
    desc: "A spherical halo of trillions of comet nuclei out to 100,000 AU (1.6 light-years), the outer edge of the Sun's domain. Passing stars occasionally nudge one of them sunward as a long-period comet.",
    facts: [
      ["Span", "20,000 to 100,000 AU"],
      ["Light travel", "1.6 years to the edge"],
    ],
  },
  {
    id: "acen",
    name: "Alpha Centauri",
    type: "landmark",
    pos: eclToXYZ(239.5, -42.6, 4.37 * AU_PER_LY),
    desc: "The nearest star system, 4.37 light-years (276,000 AU) away. The Oort cloud reaches more than a third of the way there.",
    facts: [["Distance", "4.37 ly = 276,000 AU"]],
  },
];

export function formatAU(au: number): string {
  if (au < 0.002) return `${(au * AU_KM).toLocaleString("en-US", { maximumFractionDigits: 0 })} km`;
  if (au < 0.05) return `${((au * AU_KM) / 1e6).toFixed(2)} million km`;
  if (au < 1000) return `${au < 10 ? au.toFixed(2) : au.toFixed(0)} AU`;
  if (au < 1e6) return `${(au / 1000).toFixed(au < 1e4 ? 1 : 0)} thousand AU`;
  return `${(au / 1e6).toFixed(2)} million AU`;
}

export function formatAUAlt(au: number): string {
  // Light travel time: a second scale that stays meaningful from the Moon to the Oort cloud.
  const sec = au * 499.005;
  if (sec < 90) return `${sec.toFixed(1)} light-seconds`;
  if (sec < 5400) return `${(sec / 60).toFixed(1)} light-minutes`;
  if (sec < 172800) return `${(sec / 3600).toFixed(1)} light-hours`;
  if (sec < 31557600 * 0.5) return `${(sec / 86400).toFixed(1)} light-days`;
  return `${(sec / 31557600).toFixed(2)} light-years`;
}
