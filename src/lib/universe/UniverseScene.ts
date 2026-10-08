import * as THREE from "three";
import {
  ExplorerScene,
  fieldToPoints,
  makePointMaterial,
  makeRimMaterial,
  type Marker,
  type SceneCallbacks,
} from "@/lib/explorer/engine";
import { buildUniverse, TYPE_META, type ObjectType, type UniverseObject } from "./catalog";
import { generateCosmicWeb, generateFarField } from "./cosmicWeb";
import { CMB_RADIUS_MPC, formatLy, formatMpc } from "./cosmology";

const CMB_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CMB_FRAG = /* glsl */ `
  uniform float uAlpha;
  varying vec3 vDir;
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  void main() {
    vec3 p = vDir * 9.0;
    float n = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 6; i++) {
      n += amp * noise(p);
      p = p * 2.03 + vec3(7.1, 3.3, 1.7);
      amp *= 0.5;
    }
    n = clamp((n - 0.5) * 3.2 + 0.5, 0.0, 1.0);
    vec3 cold = vec3(0.05, 0.18, 0.75);
    vec3 mid = vec3(0.18, 0.72, 0.85);
    vec3 warm = vec3(0.95, 0.75, 0.15);
    vec3 hot = vec3(0.85, 0.12, 0.08);
    vec3 col = n < 0.33 ? mix(cold, mid, n / 0.33) : n < 0.66 ? mix(mid, warm, (n - 0.33) / 0.33) : mix(warm, hot, (n - 0.66) / 0.34);
    gl_FragColor = vec4(col * uAlpha, uAlpha);
  }
`;

/** [base Mpc, multiplier of radius] for the label's maximum camera distance. */
const LABEL_FLOOR: Record<ObjectType, [number, number]> = {
  galaxy: [30, 800],
  group: [45, 40],
  cluster: [70, 150],
  supercluster: [300, 25],
  void: [300, 25],
  wall: [500, 20],
  quasar: [1e9, 0],
  landmark: [1e9, 0],
};

/** Tangential basis at a position: east (RA), north (Dec), radial (line of sight). */
function tangentBasis(pos: THREE.Vector3) {
  const r = pos.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  let e = new THREE.Vector3().crossVectors(up, r);
  if (e.lengthSq() < 1e-8) e = new THREE.Vector3(1, 0, 0);
  e.normalize();
  const n = new THREE.Vector3().crossVectors(r, e).normalize();
  return { e, n, r };
}

export class UniverseScene extends ExplorerScene {
  readonly objects: UniverseObject[];
  private web!: THREE.Points;
  private far!: THREE.Points;
  private webMat!: THREE.ShaderMaterial;
  private farMat!: THREE.ShaderMaterial;
  private cmbMat!: THREE.ShaderMaterial;
  private typeMaterials = new Map<ObjectType, THREE.ShaderMaterial>();

  constructor(container: HTMLElement, labelLayer: HTMLDivElement, cb: SceneCallbacks) {
    super(container, labelLayer, cb, {
      near: 0.001,
      far: 400000,
      minDistance: 0.02,
      maxDistance: 60000,
      initialPos: [28, 14, 38],
      ringRadii: [0.1, 1, 10, 100, 1000, 10000],
      ringLabel: (r) => `${formatMpc(r)} · ${formatLy(r)}`,
    });
    this.objects = buildUniverse();
    this.buildBackground();
    this.buildObjects();
    this.start();
  }

  private buildBackground() {
    const webField = generateCosmicWeb({ count: 230000, rMin: 9, rMax: 450 });
    this.webMat = this.registerMaterial(makePointMaterial(1.0, 3.2, 0.75));
    this.web = fieldToPoints(webField, this.webMat);
    this.scene.add(this.web);

    const farField = generateFarField({ count: 70000, rMin: 450, rMax: 12500 });
    this.farMat = this.registerMaterial(makePointMaterial(0.8, 2.2, 0.55));
    this.far = fieldToPoints(farField, this.farMat);
    this.scene.add(this.far);
    this.backgroundObjects.push(this.web, this.far);

    this.cmbMat = new THREE.ShaderMaterial({
      vertexShader: CMB_VERT,
      fragmentShader: CMB_FRAG,
      uniforms: { uAlpha: { value: 0.25 } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    const cmb = new THREE.Mesh(new THREE.SphereGeometry(CMB_RADIUS_MPC, 128, 64), this.cmbMat);
    cmb.frustumCulled = false;
    this.layer("landmark").add(cmb);
  }

  private buildObjects() {
    const types = Object.keys(TYPE_META) as ObjectType[];
    const markerPx: Record<ObjectType, number> = {
      galaxy: 5.5,
      group: 5,
      cluster: 7,
      supercluster: 4,
      void: 3.5,
      wall: 4,
      quasar: 6,
      landmark: 0,
    };

    for (const type of types) {
      const objs = this.objects.filter((o) => o.type === type && !o.atOrigin);
      const group = this.layer(type);
      const positions = new Float32Array(objs.length * 3);
      const colors = new Float32Array(objs.length * 3);
      const sizes = new Float32Array(objs.length).fill(1e9);
      const col = new THREE.Color(TYPE_META[type].color);
      objs.forEach((o, i) => {
        positions.set(o.pos, i * 3);
        colors.set([col.r, col.g, col.b], i * 3);
      });
      const px = markerPx[type];
      const material = this.registerMaterial(
        makePointMaterial(px, px, type === "galaxy" ? 1.0 : 0.9),
      );
      this.typeMaterials.set(type, material);
      const points = fieldToPoints({ positions, colors, sizes, count: objs.length }, material);
      points.visible = px > 0 && objs.length > 0;
      group.add(points);
    }

    for (const o of this.objects) {
      const [base, mult] = LABEL_FLOOR[o.type];
      const always = o.type === "quasar" || o.type === "landmark";
      let flyDist: number;
      if (o.atOrigin) flyDist = o.radius * 2.4;
      else if (o.shape === "sphere" || o.shape === "shell") flyDist = o.radius * 2.9;
      else if (o.shape === "ellipsoid" || o.shape === "ring") flyDist = o.radius * 2.6;
      else if (o.type === "galaxy") flyDist = Math.max(0.25, o.radius * 30);
      else if (o.type === "quasar") flyDist = Math.max(40, o.radius * 60);
      else flyDist = Math.max(0.5, o.radius * 3);
      const m = this.addMarker({
        id: o.id,
        name: o.name,
        pos: o.pos,
        cls: o.type,
        layer: o.type,
        radius: o.radius,
        labelMax: always ? Infinity : base + o.radius * mult,
        priority:
          o.id === "mw" ? 1e6 : TYPE_META[o.type].order * 1000 + Math.log10(o.radius + 1e-3) * 50,
        flyDist,
        approx: o.approx,
        horizon: !!o.atOrigin,
        hideInside: !!o.shape && o.shape !== "point" && o.type !== "supercluster",
        ignoreScale: always,
      });
      this.buildShape(m, o);
    }
  }

  private buildShape(m: Marker, o: UniverseObject) {
    const group = this.layer(o.type);
    const pos = new THREE.Vector3(...o.pos);
    const color = TYPE_META[o.type].color;
    const sphereGeo = new THREE.SphereGeometry(1, 48, 32);

    if (o.shape === "sphere") {
      const isVoid = o.type === "void";
      const isBig = o.type === "supercluster" || isVoid;
      const mat = isVoid
        ? makeRimMaterial("#5560ff", 0.42, 2.2, 0.035, false)
        : makeRimMaterial(color, isBig ? 0.32 : 0.5, isBig ? 2.4 : 3.0, isBig ? 0.03 : 0.02, true);
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.copy(pos);
      mesh.scale.setScalar(o.radius);
      mesh.frustumCulled = false;
      group.add(mesh);
      if (isBig) {
        const n = isVoid ? 120 : Math.min(2600, Math.round(o.radius * 30));
        group.add(
          this.sprinkle(n, color, isVoid ? 0.25 : 0.8, o.radius * 0.012, (p) => {
            const r = isVoid
              ? o.radius * (0.97 + 0.06 * Math.random())
              : o.radius * Math.cbrt(Math.random());
            const ct = 2 * Math.random() - 1;
            const st = Math.sqrt(1 - ct * ct);
            const ph = Math.random() * Math.PI * 2;
            p.set(r * st * Math.cos(ph), r * ct, r * st * Math.sin(ph)).add(pos);
          }),
        );
      }
    } else if (o.shape === "ellipsoid" && o.size) {
      const [a, b, c] = o.size;
      const { e, n, r } = tangentBasis(pos);
      const holder = new THREE.Object3D();
      holder.matrixAutoUpdate = false;
      holder.matrix.makeBasis(e, n, r).setPosition(pos);
      const mat = makeRimMaterial(color, 0.35, 2.6, 0.03, true);
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.scale.set(a, b, c);
      mesh.frustumCulled = false;
      holder.add(mesh);
      const count = Math.min(7000, Math.max(800, Math.round(a * 6)));
      holder.add(
        this.sprinkle(count, color, 0.9, Math.max(a, b, c) * 0.006, (p) => {
          let x = 0,
            y = 0,
            z = 0;
          do {
            x = 2 * Math.random() - 1;
            y = 2 * Math.random() - 1;
            z = 2 * Math.random() - 1;
          } while (x * x + y * y + z * z > 1);
          p.set(x * a, y * b, z * c * (0.4 + 0.6 * Math.random()));
        }),
      );
      group.add(holder);
    } else if (o.shape === "ring" && o.size) {
      const [a, , c] = o.size;
      const { e, n, r } = tangentBasis(pos);
      const holder = new THREE.Object3D();
      holder.matrixAutoUpdate = false;
      holder.matrix.makeBasis(e, n, r).setPosition(pos);
      const mat = makeRimMaterial(color, 0.4, 2.0, 0.05, true);
      const torus = new THREE.Mesh(new THREE.TorusGeometry(a, c * 0.5, 16, 96), mat);
      torus.frustumCulled = false;
      holder.add(torus);
      holder.add(
        this.sprinkle(1500, color, 0.9, a * 0.01, (p) => {
          const th = Math.random() * Math.PI * 2;
          const g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
          const rr = a + g() * c * 0.5;
          p.set(rr * Math.cos(th), rr * Math.sin(th), g() * c * 0.5);
        }),
      );
      group.add(holder);
    } else if (o.shape === "shell") {
      if (o.id === "cmb") return; // drawn by the dedicated CMB sphere
      const isHorizon = !!o.atOrigin;
      const mat = makeRimMaterial(
        isHorizon ? "#ffffff" : color,
        isHorizon ? 0.12 : 0.35,
        isHorizon ? 1.5 : 2.6,
        isHorizon ? 0.01 : 0.02,
        true,
      );
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.copy(pos);
      mesh.scale.setScalar(o.radius);
      mesh.frustumCulled = false;
      group.add(mesh);
      if (!isHorizon) {
        group.add(
          this.sprinkle(2500, color, 0.9, o.radius * 0.01, (p) => {
            const rr = o.radius * (0.96 + 0.08 * Math.random());
            const ct = 2 * Math.random() - 1;
            const st = Math.sqrt(1 - ct * ct);
            const ph = Math.random() * Math.PI * 2;
            p.set(rr * st * Math.cos(ph), rr * ct, rr * st * Math.sin(ph)).add(pos);
          }),
        );
      }
    } else if ((o.type === "group" || o.type === "cluster") && o.r) {
      const mat = makeRimMaterial(color, 0.5, 3.0, 0.02, true);
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.copy(pos);
      mesh.scale.setScalar(o.radius);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  protected tick(_now: number, _dt: number, camDist: number, targetDist: number) {
    const webFade = THREE.MathUtils.clamp(1800 / Math.max(camDist, 1), 0.08, 1);
    this.webMat.uniforms.uOpacity.value = 0.75 * webFade;
    this.farMat.uniforms.uOpacity.value = 0.55 * THREE.MathUtils.clamp(camDist / 60, 0.15, 1);
    const cmbInside = THREE.MathUtils.smoothstep(camDist, 500, 9000);
    const cmbOutside = THREE.MathUtils.smoothstep(
      camDist,
      CMB_RADIUS_MPC * 0.9,
      CMB_RADIUS_MPC * 1.4,
    );
    this.cmbMat.uniforms.uAlpha.value = 0.06 + 0.26 * cmbInside + 0.1 * cmbOutside;
    this.typeMaterials.get("galaxy")!.uniforms.uOpacity.value = THREE.MathUtils.clamp(
      600 / Math.max(targetDist, 1),
      0.15,
      1,
    );
    this.typeMaterials.get("group")!.uniforms.uOpacity.value = THREE.MathUtils.clamp(
      1200 / Math.max(targetDist, 1),
      0.2,
      0.9,
    );
  }
}
