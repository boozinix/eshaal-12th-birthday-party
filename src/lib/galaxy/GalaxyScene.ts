import * as THREE from "three";
import {
  ExplorerScene,
  fieldToPoints,
  makePointMaterial,
  makeRimMaterial,
  type SceneCallbacks,
} from "@/lib/explorer/engine";
import {
  ARMS,
  armPoint,
  buildGalaxy,
  formatKpc,
  formatPc,
  GALAXY_TYPE_META,
  SUN_R,
  type GalaxyObject,
  type GalaxyType,
} from "./galaxyCatalog";
import { generateGalaxyField } from "./galaxyField";

const LABEL_MAX: Record<GalaxyType, (r: number) => number> = {
  star: () => 1.6,
  cluster: (r) => 12 + r * 200,
  nebula: (r) => 10 + r * 200,
  arm: () => 70,
  structure: (r) => 25 + r * 25,
  satellite: (r) => 400 + r * 50,
  landmark: () => Infinity,
};

export class GalaxyScene extends ExplorerScene {
  readonly objects: GalaxyObject[];
  private discMat!: THREE.ShaderMaterial;
  private haloMat!: THREE.ShaderMaterial;
  private coreMat!: THREE.ShaderMaterial;

  constructor(container: HTMLElement, labelLayer: HTMLDivElement, cb: SceneCallbacks) {
    super(container, labelLayer, cb, {
      near: 0.00001,
      far: 20000,
      minDistance: 0.0003,
      maxDistance: 900,
      initialPos: [6, 24, 30],
      ringRadii: [0.01, 0.1, 1, 10, 100],
      ringLabel: (r) => `${formatPc(r)} · ${formatKpc(r)}`,
    });
    this.objects = buildGalaxy();
    this.buildField();
    this.buildObjects();
    this.start();
  }

  private buildField() {
    const { disc, core, halo } = generateGalaxyField();
    this.discMat = this.registerMaterial(makePointMaterial(1.0, 4.0, 0.85));
    this.coreMat = this.registerMaterial(makePointMaterial(1.0, 3.5, 0.7));
    this.haloMat = this.registerMaterial(makePointMaterial(0.8, 3.0, 0.6));
    const discPts = fieldToPoints(disc, this.discMat);
    const corePts = fieldToPoints(core, this.coreMat);
    const haloPts = fieldToPoints(halo, this.haloMat);
    this.scene.add(discPts, corePts, haloPts);
    this.backgroundObjects.push(discPts, corePts, haloPts);

    // Spiral arm ridges as faint guide lines so the arms read even where the star field is sparse.
    const armGroup = this.layer("arm");
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x9fd3ff,
      transparent: true,
      opacity: 0.14,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (const arm of ARMS) {
      const pts: number[] = [];
      for (let phi = arm.phiMin; phi <= arm.phiMax; phi += 0.02) pts.push(...armPoint(arm, phi));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const line = new THREE.Line(geo, lineMat);
      line.frustumCulled = false;
      armGroup.add(line);
    }

    // Sun's orbit.
    const orbit: number[] = [];
    for (let i = 0; i < 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      orbit.push(SUN_R * Math.cos(a), 0, SUN_R * Math.sin(a));
    }
    const og = new THREE.BufferGeometry();
    og.setAttribute("position", new THREE.Float32BufferAttribute(orbit, 3));
    const orbitLine = new THREE.LineLoop(
      og,
      new THREE.LineBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0.3,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    orbitLine.frustumCulled = false;
    this.layer("landmark").add(orbitLine);
  }

  private buildObjects() {
    const px: Record<GalaxyType, number> = {
      star: 5,
      cluster: 5.5,
      nebula: 6,
      arm: 0,
      structure: 3.5,
      satellite: 6,
      landmark: 0,
    };
    const types = Object.keys(GALAXY_TYPE_META) as GalaxyType[];
    for (const type of types) {
      const objs = this.objects.filter((o) => o.type === type);
      const group = this.layer(type);
      if (px[type] > 0 && objs.length) {
        const positions = new Float32Array(objs.length * 3);
        const colors = new Float32Array(objs.length * 3);
        const sizes = new Float32Array(objs.length).fill(1e9);
        const c = new THREE.Color(GALAXY_TYPE_META[type].color);
        objs.forEach((o, i) => {
          positions.set(o.pos, i * 3);
          colors.set([c.r, c.g, c.b], i * 3);
        });
        const mat = this.registerMaterial(makePointMaterial(px[type], px[type], 0.95));
        group.add(fieldToPoints({ positions, colors, sizes, count: objs.length }, mat));
      }
    }

    // The Sun and Sgr A* get their own bright markers.
    for (const [id, color, size] of [
      ["sun", "#ffe680", 9],
      ["sgra", "#ffffff", 7],
    ] as const) {
      const o = this.objects.find((x) => x.id === id)!;
      const c = new THREE.Color(color);
      const mat = this.registerMaterial(makePointMaterial(size, size, 1));
      this.layer("landmark").add(
        fieldToPoints(
          {
            positions: new Float32Array(o.pos),
            colors: new Float32Array([c.r, c.g, c.b]),
            sizes: new Float32Array([1e9]),
            count: 1,
          },
          mat,
        ),
      );
    }

    const sphereGeo = new THREE.SphereGeometry(1, 48, 32);
    for (const o of this.objects) {
      const meta = GALAXY_TYPE_META[o.type];
      let flyDist: number;
      if (o.type === "star") flyDist = 0.03;
      else if (o.type === "cluster" || o.type === "nebula") flyDist = Math.max(0.06, o.radius * 8);
      else if (o.type === "arm") flyDist = 4;
      else if (o.id === "sun") flyDist = 0.3;
      else if (o.id === "sgra") flyDist = 0.8;
      else if (o.id === "sunorbit") flyDist = 14;
      else if (o.shape === "shell") flyDist = o.radius * 2.4;
      else flyDist = Math.max(0.3, o.radius * 2.9);
      const always = o.type === "landmark";
      this.addMarker({
        id: o.id,
        name: o.name,
        pos: o.pos,
        cls: `g-${o.type}`,
        layer: o.type,
        radius: o.radius,
        labelMax: LABEL_MAX[o.type](o.radius),
        priority:
          o.id === "sun" || o.id === "sgra"
            ? 1e6
            : meta.order * 1000 + Math.log10(o.radius + 1e-4) * 50,
        flyDist,
        approx: o.approx,
        horizon: o.shape === "shell",
        hideInside: !!o.shape && o.shape !== "point" && o.shape !== "shell",
        ignoreScale: always || o.type === "satellite",
      });

      const group = this.layer(o.type);
      const pos = new THREE.Vector3(...o.pos);
      if (o.shape === "sphere") {
        const mat = makeRimMaterial(
          meta.color,
          o.type === "satellite" ? 0.45 : 0.35,
          2.6,
          0.03,
          true,
        );
        const mesh = new THREE.Mesh(sphereGeo, mat);
        mesh.position.copy(pos);
        mesh.scale.setScalar(o.radius);
        mesh.frustumCulled = false;
        group.add(mesh);
        if (o.type === "satellite" && o.radius >= 1) {
          group.add(
            this.sprinkle(Math.round(o.radius * 900), "#bff6ec", 0.8, o.radius * 0.03, (p) => {
              const rr = o.radius * Math.cbrt(Math.random());
              const ct = 2 * Math.random() - 1;
              const st = Math.sqrt(1 - ct * ct);
              const ph = Math.random() * Math.PI * 2;
              p.set(rr * st * Math.cos(ph), rr * ct * 0.5, rr * st * Math.sin(ph)).add(pos);
            }),
          );
        }
      } else if (o.shape === "ellipsoid" && o.size) {
        const [a, b, c] = o.size;
        const mat = makeRimMaterial(meta.color, 0.3, 2.6, 0.03, true);
        const mesh = new THREE.Mesh(sphereGeo, mat);
        mesh.position.copy(pos);
        mesh.scale.set(a, b, c);
        mesh.rotation.y = ((o.yaw ?? 0) * Math.PI) / 180;
        mesh.frustumCulled = false;
        group.add(mesh);
      } else if (o.shape === "shell") {
        const mat = makeRimMaterial("#ffffff", 0.1, 1.5, 0.01, true);
        const mesh = new THREE.Mesh(sphereGeo, mat);
        mesh.scale.setScalar(o.radius);
        mesh.frustumCulled = false;
        group.add(mesh);
      }
    }
  }

  protected tick(_now: number, _dt: number, camDist: number, targetDist: number) {
    // Up close the disc field is just a handful of dots; let the named stars carry the view.
    this.discMat.uniforms.uOpacity.value = 0.85 * THREE.MathUtils.clamp(targetDist / 0.6, 0.35, 1);
    this.haloMat.uniforms.uOpacity.value = 0.6 * THREE.MathUtils.clamp(camDist / 15, 0.1, 1);
  }
}
