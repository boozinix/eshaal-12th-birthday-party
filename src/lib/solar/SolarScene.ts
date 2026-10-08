import * as THREE from "three";
import {
  ExplorerScene,
  fieldToPoints,
  gauss,
  makePointMaterial,
  makeRimMaterial,
  mulberry32,
  type PointField,
  type SceneCallbacks,
} from "@/lib/explorer/engine";
import { dateToJD, jdToDate, orbitPath, orbitPosition } from "./orbits";
import {
  AU_KM,
  formatAU,
  formatAUAlt,
  J2000,
  SOLAR_CATALOG,
  SOLAR_TYPE_META,
  type SolarEntry,
  type SolarType,
} from "./solarCatalog";

interface Body {
  entry: SolarEntry;
  pos: THREE.Vector3;
  mesh?: THREE.Mesh;
  marker?: THREE.Points;
  moonGroup?: THREE.Group;
  radiusAU: number;
}

const DEG = Math.PI / 180;

export class SolarScene extends ExplorerScene {
  readonly objects: SolarEntry[] = SOLAR_CATALOG;
  private bodies = new Map<string, Body>();
  private jd = dateToJD(new Date());
  private rate = 0; // simulated days per real second
  private sunLight!: THREE.PointLight;

  constructor(container: HTMLElement, labelLayer: HTMLDivElement, cb: SceneCallbacks) {
    super(container, labelLayer, cb, {
      near: 0.000002,
      far: 8e6,
      minDistance: 0.00003,
      maxDistance: 1.2e6,
      initialPos: [14, 9, 22],
      ringRadii: [0.01, 0.1, 1, 10, 100, 1000, 10000, 100000],
      ringLabel: (r) => `${formatAU(r)} · ${formatAUAlt(r)}`,
      logDepth: true,
    });
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    this.sunLight = new THREE.PointLight(0xfff4d6, 2.2, 0, 0);
    this.scene.add(this.sunLight);
    this.buildStars();
    this.buildBodies();
    this.buildBelts();
    this.updatePositions();
    this.start();
  }

  // ───────────────────────────── time ─────────────────────────────

  setTimeRate(daysPerSecond: number) {
    this.rate = daysPerSecond;
  }

  getTimeRate() {
    return this.rate;
  }

  setDate(d: Date) {
    this.jd = dateToJD(d);
    this.updatePositions();
  }

  getDate(): Date {
    return jdToDate(this.jd);
  }

  protected hudExtra(): string {
    const d = jdToDate(this.jd);
    const s = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return this.rate ? `${s} · running` : s;
  }

  // ───────────────────────────── content ─────────────────────────────

  private buildStars() {
    // Distant backdrop of stars so the view has an "up" and a sense of rotation.
    const rand = mulberry32(99);
    const n = 3500;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const R = 4e6;
    for (let i = 0; i < n; i++) {
      const ct = 2 * rand() - 1;
      const st = Math.sqrt(1 - ct * ct);
      const ph = rand() * Math.PI * 2;
      positions.set([R * st * Math.cos(ph), R * ct, R * st * Math.sin(ph)], i * 3);
      const t = rand();
      colors.set([0.8 + 0.2 * t, 0.85 + 0.1 * t, 1.0 - 0.3 * t * t], i * 3);
      sizes[i] = 1e9;
    }
    const mat = this.registerMaterial(makePointMaterial(0.8, 2.4, 0.5 + 0.0 * 1));
    mat.uniforms.uMinPx.value = 1.0;
    mat.uniforms.uMaxPx.value = 1.0;
    const pts = fieldToPoints({ positions, colors, sizes, count: n }, mat);
    this.scene.add(pts);
    this.backgroundObjects.push(pts);
  }

  private buildBodies() {
    const sphereGeo = new THREE.SphereGeometry(1, 48, 32);
    const orbitMats: Partial<Record<SolarType, THREE.LineBasicMaterial>> = {};
    const orbitMat = (t: SolarType) =>
      (orbitMats[t] ??= new THREE.LineBasicMaterial({
        color: new THREE.Color(SOLAR_TYPE_META[t].color),
        transparent: true,
        opacity: t === "moon" ? 0.45 : 0.32,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }));

    for (const e of this.objects) {
      const radiusAU = (e.radiusKm ?? 0) / AU_KM;
      const body: Body = { entry: e, pos: new THREE.Vector3(), radiusAU };
      this.bodies.set(e.id, body);
      const group = this.layer(e.type);
      const meta = SOLAR_TYPE_META[e.type];

      // Real-size sphere for anything with a radius.
      if (e.radiusKm && e.type !== "probe") {
        const isSun = e.type === "star";
        const mat = isSun
          ? new THREE.MeshBasicMaterial({ color: e.color ?? "#fff2b0" })
          : new THREE.MeshLambertMaterial({ color: e.color ?? meta.color });
        const mesh = new THREE.Mesh(sphereGeo, mat);
        mesh.scale.setScalar(radiusAU);
        mesh.frustumCulled = false;
        group.add(mesh);
        body.mesh = mesh;
        if (e.id === "saturn") {
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(1.24, 2.33, 128),
            new THREE.MeshBasicMaterial({
              color: "#d8c49a",
              transparent: true,
              opacity: 0.7,
              side: THREE.DoubleSide,
            }),
          );
          ring.rotation.x = Math.PI / 2 - 26.7 * DEG;
          mesh.add(ring);
        }
      }

      // Constant-pixel marker dot (hidden when the real sphere is big on screen).
      const px = {
        star: 11,
        planet: 7,
        dwarf: 5.5,
        moon: 4,
        small: 4.5,
        probe: 6,
        region: 0,
        landmark: 6,
      }[e.type];
      if (px > 0) {
        const c = new THREE.Color(
          e.type === "planet" || e.type === "star" ? (e.color ?? meta.color) : meta.color,
        );
        const mat = this.registerMaterial(makePointMaterial(px, px, 1));
        const marker = fieldToPoints(
          {
            positions: new Float32Array(3),
            colors: new Float32Array([c.r, c.g, c.b]),
            sizes: new Float32Array([1e9]),
            count: 1,
          },
          mat,
        );
        group.add(marker);
        body.marker = marker;
      }

      // Orbit line.
      if (e.el && !e.parent) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute(
          "position",
          new THREE.BufferAttribute(orbitPath(e.el, e.el.e > 0.5 ? 720 : 360), 3),
        );
        const line = new THREE.LineLoop(geo, orbitMat(e.type));
        line.frustumCulled = false;
        group.add(line);
      }

      // Region shells.
      if (e.shape === "shell" && e.r) {
        const faint = e.r > 1000;
        const mat = makeRimMaterial(
          meta.color,
          faint ? 0.14 : 0.35,
          faint ? 1.8 : 2.4,
          faint ? 0.01 : 0.03,
          true,
        );
        const mesh = new THREE.Mesh(sphereGeo, mat);
        mesh.scale.setScalar(e.r);
        mesh.frustumCulled = false;
        group.add(mesh);
      }

      // Labels.
      let flyDist: number;
      if (e.type === "star") flyDist = 0.06;
      else if (e.type === "probe") flyDist = 40;
      else if (e.type === "landmark") flyDist = 60000;
      else if (e.shape === "shell") flyDist = (e.r ?? 1) * 2.4;
      else if (e.type === "region") flyDist = (e.r ?? 1) * 3;
      else if (e.parent) flyDist = Math.max(radiusAU * 12, 0.00004);
      else {
        const moons = this.objects.filter((m) => m.parent === e.id);
        const outer = Math.max(0, ...moons.map((m) => m.el!.a / AU_KM));
        flyDist = Math.max(radiusAU * 10, outer * 1.35, 0.0001);
      }
      const labelMax = e.parent ? (e.el!.a / AU_KM) * 80 : Infinity;
      this.addMarker({
        id: e.id,
        name: e.name,
        pos: [0, 0, 0],
        cls: `s-${e.type}`,
        layer: e.type,
        radius: e.r ?? radiusAU,
        labelMax,
        priority:
          e.type === "star"
            ? 1e6
            : (8 - meta.order) * 1000 + (e.el ? -Math.log10(e.el.a + 1) * 10 : 0),
        flyDist,
        approx: e.approx,
        horizon: e.shape === "shell",
        ignoreScale: e.type !== "moon",
      });
    }

    // Moon systems: a group per parent carrying the moon orbits.
    for (const e of this.objects) {
      if (!e.parent) continue;
      const parent = this.bodies.get(e.parent)!;
      if (!parent.moonGroup) {
        parent.moonGroup = new THREE.Group();
        this.layer("moon").add(parent.moonGroup);
      }
      const a = e.el!.a / AU_KM;
      const pts: number[] = [];
      for (let k = 0; k < 128; k++) {
        const th = (k / 128) * Math.PI * 2;
        pts.push(a * Math.cos(th), 0, a * Math.sin(th));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const line = new THREE.LineLoop(geo, orbitMat("moon"));
      line.rotation.x = (e.tilt ?? 0) * DEG;
      line.frustumCulled = false;
      parent.moonGroup.add(line);
    }
  }

  private buildBelts() {
    const rand = mulberry32(2024);
    const group = this.layer("region");
    const make = (
      count: number,
      color: [number, number, number],
      sizeOf: (r: number) => number,
      gen: () => [number, number, number],
    ) => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        const p = gen();
        positions.set(p, i * 3);
        const f = 0.75 + 0.25 * rand();
        colors.set([color[0] * f, color[1] * f, color[2] * f], i * 3);
        sizes[i] = sizeOf(Math.hypot(p[0], p[1], p[2])) * (0.5 + rand());
      }
      const field: PointField = { positions, colors, sizes, count };
      const mat = this.registerMaterial(makePointMaterial(0.9, 2.4, 0.8));
      const pts = fieldToPoints(field, mat);
      group.add(pts);
      return pts;
    };
    const onOrbit = (a: number, e: number, i: number): [number, number, number] =>
      orbitPosition({ a, e, i, om: rand() * 360, w: rand() * 360, m0: rand() * 360, n: 0 }, J2000);

    // Main belt.
    make(
      26000,
      [0.85, 0.72, 0.55],
      () => 0.004,
      () => onOrbit(2.1 + rand() * 1.2, rand() * 0.2, Math.abs(gauss(rand)) * 7),
    );
    // Jupiter Trojans at L4/L5 (placed relative to Jupiter's current longitude at J2000).
    const jup = orbitPosition(this.objects.find((o) => o.id === "jupiter")!.el!, J2000);
    const jupLon = Math.atan2(-jup[2], jup[0]);
    for (const off of [60, -60]) {
      make(
        2500,
        [0.85, 0.72, 0.55],
        () => 0.004,
        () => {
          const lon = jupLon + off * DEG + gauss(rand) * 14 * DEG;
          const r = 5.2 + gauss(rand) * 0.25;
          const lat = gauss(rand) * 10 * DEG;
          return [
            r * Math.cos(lat) * Math.cos(lon),
            r * Math.sin(lat),
            -r * Math.cos(lat) * Math.sin(lon),
          ];
        },
      );
    }
    // Kuiper belt: classical + plutinos.
    make(
      30000,
      [0.7, 0.8, 1.0],
      () => 0.06,
      () => onOrbit(39 + rand() * 9, rand() * 0.1, Math.abs(gauss(rand)) * 6),
    );
    make(
      4000,
      [0.7, 0.8, 1.0],
      () => 0.06,
      () => onOrbit(39.4 + gauss(rand) * 0.3, 0.1 + rand() * 0.2, Math.abs(gauss(rand)) * 12),
    );
    // Scattered disc: perihelia near Neptune, aphelia far out.
    make(
      3500,
      [0.85, 0.75, 1.0],
      (r) => 0.02 + r * 0.0015,
      () => {
        const a = 50 * Math.pow(16, rand());
        const q = 30 + rand() * 12;
        return onOrbit(a, 1 - q / a, Math.abs(gauss(rand)) * 20);
      },
    );
    // Inner Oort (Hills) cloud: flattened.
    make(
      30000,
      [0.75, 0.8, 1.0],
      (r) => r * 0.012,
      () => {
        const r = 2000 * Math.pow(10, rand());
        const lat = gauss(rand) * 22 * DEG;
        const lon = rand() * Math.PI * 2;
        return [
          r * Math.cos(lat) * Math.cos(lon),
          r * Math.sin(lat),
          -r * Math.cos(lat) * Math.sin(lon),
        ];
      },
    );
    // Outer Oort cloud: spherical, thinning outward.
    make(
      60000,
      [0.75, 0.8, 1.0],
      (r) => r * 0.012,
      () => {
        const r = 20000 * Math.pow(5, Math.pow(rand(), 0.6));
        const ct = 2 * rand() - 1;
        const st = Math.sqrt(1 - ct * ct);
        const ph = rand() * Math.PI * 2;
        return [r * st * Math.cos(ph), r * ct, r * st * Math.sin(ph)];
      },
    );
  }

  private updatePositions() {
    for (const body of this.bodies.values()) {
      const e = body.entry;
      if (e.el && !e.parent) body.pos.set(...orbitPosition(e.el, this.jd));
      else if (e.pos) body.pos.set(...e.pos);
    }
    for (const body of this.bodies.values()) {
      const e = body.entry;
      if (e.parent) {
        const parent = this.bodies.get(e.parent)!;
        const a = e.el!.a / AU_KM;
        const th = ((e.el!.m0 + e.el!.n * (this.jd - J2000)) % 360) * DEG;
        const local = new THREE.Vector3(a * Math.cos(th), 0, a * Math.sin(th));
        local.applyAxisAngle(new THREE.Vector3(1, 0, 0), (e.tilt ?? 0) * DEG);
        body.pos.copy(parent.pos).add(local);
      }
      if (body.moonGroup) body.moonGroup.position.copy(body.pos);
      body.mesh?.position.copy(body.pos);
      if (body.marker) {
        const attr = body.marker.geometry.getAttribute("position") as THREE.BufferAttribute;
        attr.setXYZ(0, body.pos.x, body.pos.y, body.pos.z);
        attr.needsUpdate = true;
      }
      if (e.shape !== "shell") this.setMarkerPos(e.id, [body.pos.x, body.pos.y, body.pos.z]);
    }
  }

  protected tick(_now: number, dt: number, _camDist: number, _targetDist: number) {
    if (this.rate) {
      this.jd += this.rate * dt;
      this.updatePositions();
    }
    // Hide the marker dot once the real sphere is big on screen.
    const cam = this.camera.position;
    for (const body of this.bodies.values()) {
      if (!body.marker || !body.mesh) continue;
      const d = cam.distanceTo(body.pos);
      body.marker.visible = d > body.radiusAU * 250;
    }
  }
}
