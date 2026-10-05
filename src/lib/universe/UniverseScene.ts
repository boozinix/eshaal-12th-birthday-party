import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildUniverse, TYPE_META, type ObjectType, type UniverseObject } from "./catalog";
import { generateCosmicWeb, generateFarField, type PointField } from "./cosmicWeb";
import { CMB_RADIUS_MPC, formatLy, formatMpc } from "./cosmology";

export interface FrameInfo {
  /** Camera distance from the Milky Way, Mpc. */
  camDist: number;
  /** Width of the view at the orbit target, Mpc. */
  viewWidth: number;
  /** Distance from camera to orbit target, Mpc. */
  targetDist: number;
}

export interface SceneCallbacks {
  onSelect: (obj: UniverseObject | null) => void;
  onHover: (obj: UniverseObject | null, x: number, y: number) => void;
  onFrame: (info: FrameInfo) => void;
  onInteract: () => void;
}

const POINT_VERT = /* glsl */ `
  attribute float size;
  attribute vec3 color;
  uniform float uScale;
  uniform float uMinPx;
  uniform float uMaxPx;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float depth = max(-mv.z, 1e-6);
    float px = size * uScale / depth;
    vFade = clamp(px / uMinPx, 0.0, 1.0);
    px = clamp(px, uMinPx, uMaxPx);
    gl_PointSize = px * uPixelRatio;
    gl_Position = projectionMatrix * mv;
    vColor = color;
  }
`;

const POINT_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float a = smoothstep(1.0, 0.0, d);
    a *= a;
    float core = smoothstep(0.4, 0.0, d);
    gl_FragColor = vec4(vColor * (a + 0.7 * core) * uOpacity * vFade, 1.0);
  }
`;

const RIM_VERT = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const RIM_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uPower;
  uniform float uFill;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    float ndv = abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(1.0 - ndv, uPower);
    float a = uAlpha * (rim + uFill);
    gl_FragColor = vec4(uColor * a, a);
  }
`;

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

interface Marker {
  obj: UniverseObject;
  el: HTMLDivElement;
  sx: number;
  sy: number;
  onScreen: boolean;
  labelVisible: boolean;
  shapes: THREE.Object3D[];
  shapeMaterials: THREE.ShaderMaterial[];
  /** Max camera-to-object distance at which the label shows. */
  labelMax: number;
  priority: number;
  w: number;
  h: number;
}

interface Ring {
  radius: number;
  line: THREE.LineLoop;
  el: HTMLDivElement;
}

function makePointMaterial(
  minPx: number,
  maxPx: number,
  opacity: number,
  blending = THREE.AdditiveBlending,
) {
  return new THREE.ShaderMaterial({
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    uniforms: {
      uScale: { value: 1 },
      uMinPx: { value: minPx },
      uMaxPx: { value: maxPx },
      uPixelRatio: { value: 1 },
      uOpacity: { value: opacity },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending,
  });
}

function makeRimMaterial(
  color: string,
  alpha: number,
  power: number,
  fill: number,
  additive: boolean,
) {
  return new THREE.ShaderMaterial({
    vertexShader: RIM_VERT,
    fragmentShader: RIM_FRAG,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uAlpha: { value: alpha },
      uPower: { value: power },
      uFill: { value: fill },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function fieldToPoints(field: PointField, material: THREE.ShaderMaterial): THREE.Points {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(field.positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(field.colors, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(field.sizes, 1));
  const pts = new THREE.Points(geo, material);
  pts.frustumCulled = false;
  return pts;
}

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

const LABEL_FLOOR: Record<ObjectType, [number, number]> = {
  // [base Mpc, multiplier of radius]
  galaxy: [30, 800],
  group: [45, 40],
  cluster: [70, 150],
  supercluster: [300, 25],
  void: [300, 25],
  wall: [500, 20],
  quasar: [1e9, 0],
  landmark: [1e9, 0],
};

export class UniverseScene {
  readonly objects: UniverseObject[];
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private container: HTMLElement;
  private labelLayer: HTMLDivElement;
  private markers: Marker[] = [];
  private byId = new Map<string, Marker>();
  private typeGroups = new Map<
    ObjectType,
    { points: THREE.Points; material: THREE.ShaderMaterial; group: THREE.Group }
  >();
  private layerVisible: Record<ObjectType, boolean>;
  private web!: THREE.Points;
  private far!: THREE.Points;
  private webMat!: THREE.ShaderMaterial;
  private farMat!: THREE.ShaderMaterial;
  private cmbMat!: THREE.ShaderMaterial;
  private rings: Ring[] = [];
  private ringsGroup = new THREE.Group();
  private pointMaterials: THREE.ShaderMaterial[] = [];
  private cb: SceneCallbacks;
  private raf = 0;
  private disposed = false;
  private resizeObs: ResizeObserver;
  private selected: Marker | null = null;
  private hovered: Marker | null = null;
  private showLabels = true;
  private showWeb = true;
  private flight: null | {
    t0: number;
    dur: number;
    p0: THREE.Vector3;
    p1: THREE.Vector3;
    t0v: THREE.Vector3;
    t1v: THREE.Vector3;
  } = null;
  private lastHud = 0;
  private pointerDown: { x: number; y: number } | null = null;
  private dragging = false;

  constructor(container: HTMLElement, labelLayer: HTMLDivElement, cb: SceneCallbacks) {
    this.container = container;
    this.labelLayer = labelLayer;
    this.cb = cb;
    this.objects = buildUniverse();
    this.layerVisible = Object.fromEntries(Object.keys(TYPE_META).map((k) => [k, true])) as Record<
      ObjectType,
      boolean
    >;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x02030a, 1);
    this.renderer.sortObjects = false;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(55, w / h, 0.001, 400000);
    this.camera.position.set(28, 14, 38);

    this.controls = new OrbitControls(this.camera, container);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomToCursor = true;
    this.controls.zoomSpeed = 1.4;
    this.controls.rotateSpeed = 0.7;
    this.controls.panSpeed = 0.8;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.02;
    this.controls.maxDistance = 60000;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.25;
    this.controls.addEventListener("start", () => {
      this.controls.autoRotate = false;
      this.flight = null;
      this.cb.onInteract();
    });

    this.buildBackground();
    this.buildObjects();
    this.buildRings();
    this.bindPointer();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.loop(performance.now());
  }

  // ───────────────────────────── construction ─────────────────────────────

  private buildBackground() {
    const webField = generateCosmicWeb({ count: 230000, rMin: 9, rMax: 450 });
    this.webMat = makePointMaterial(1.0, 3.2, 0.75);
    this.pointMaterials.push(this.webMat);
    this.web = fieldToPoints(webField, this.webMat);
    this.scene.add(this.web);

    const farField = generateFarField({ count: 70000, rMin: 450, rMax: 12500 });
    this.farMat = makePointMaterial(0.8, 2.2, 0.55);
    this.pointMaterials.push(this.farMat);
    this.far = fieldToPoints(farField, this.farMat);
    this.scene.add(this.far);

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
    this.scene.add(cmb);
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
      const group = new THREE.Group();
      this.scene.add(group);
      const positions = new Float32Array(objs.length * 3);
      const colors = new Float32Array(objs.length * 3);
      const sizes = new Float32Array(objs.length);
      const col = new THREE.Color(TYPE_META[type].color);
      objs.forEach((o, i) => {
        positions.set(o.pos, i * 3);
        colors.set([col.r, col.g, col.b], i * 3);
        sizes[i] = 1;
      });
      const px = markerPx[type];
      const material = makePointMaterial(px, px, type === "galaxy" ? 1.0 : 0.9);
      // Markers are constant-size: give them a huge world size so they always hit the clamp.
      material.uniforms.uMinPx.value = px;
      material.uniforms.uMaxPx.value = px;
      this.pointMaterials.push(material);
      const points = fieldToPoints(
        { positions, colors, sizes: sizes.fill(1e9), count: objs.length },
        material,
      );
      points.visible = px > 0 && objs.length > 0;
      group.add(points);
      this.typeGroups.set(type, { points, material, group });
    }

    for (const obj of this.objects) {
      const el = document.createElement("div");
      el.className = `uv-label uv-${obj.type}`;
      el.dataset.id = obj.id;
      const name = document.createElement("span");
      name.className = "uv-label-name";
      name.textContent = obj.name;
      el.appendChild(name);
      if (obj.approx) el.title = "Position or size is approximate";
      this.labelLayer.appendChild(el);

      const [base, mult] = LABEL_FLOOR[obj.type];
      const labelMax =
        obj.type === "quasar" || obj.type === "landmark" ? Infinity : base + obj.radius * mult;
      const marker: Marker = {
        obj,
        el,
        sx: 0,
        sy: 0,
        onScreen: false,
        labelVisible: false,
        shapes: [],
        shapeMaterials: [],
        labelMax,
        priority:
          obj.id === "mw"
            ? 1e6
            : TYPE_META[obj.type].order * 1000 + Math.log10(obj.radius + 1e-3) * 50,
        w: 0,
        h: 0,
      };
      // Measure once while hidden so collision tests have real sizes.
      el.style.visibility = "hidden";
      el.style.display = "block";
      marker.w = name.offsetWidth + 8;
      marker.h = name.offsetHeight;
      el.style.display = "none";
      el.style.visibility = "";
      this.buildShape(marker);
      this.markers.push(marker);
      this.byId.set(obj.id, marker);
    }
  }

  private buildShape(m: Marker) {
    const o = m.obj;
    const group = this.typeGroups.get(o.type)!.group;
    const pos = new THREE.Vector3(...o.pos);
    const color = TYPE_META[o.type].color;
    const add = (obj3d: THREE.Object3D, mat?: THREE.ShaderMaterial) => {
      group.add(obj3d);
      m.shapes.push(obj3d);
      if (mat) m.shapeMaterials.push(mat);
    };

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
      add(mesh, mat);
      if (isBig) {
        // Light sprinkle of member galaxies / near-emptiness so the volume reads in 3D.
        const n = isVoid ? 120 : Math.min(2600, Math.round(o.radius * 30));
        add(
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
      add(holder, mat);
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
      add(holder, mat);
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
      add(mesh, mat);
      if (!isHorizon) {
        add(
          this.sprinkle(2500, color, 0.9, o.radius * 0.01, (p) => {
            const r = o.radius * (0.96 + 0.08 * Math.random());
            const ct = 2 * Math.random() - 1;
            const st = Math.sqrt(1 - ct * ct);
            const ph = Math.random() * Math.PI * 2;
            p.set(r * st * Math.cos(ph), r * ct, r * st * Math.sin(ph)).add(pos);
          }),
        );
      }
    } else if ((o.type === "group" || o.type === "cluster") && o.r) {
      const mat = makeRimMaterial(color, 0.5, 3.0, 0.02, true);
      const mesh = new THREE.Mesh(sphereGeo, mat);
      mesh.position.copy(pos);
      mesh.scale.setScalar(o.radius);
      mesh.frustumCulled = false;
      add(mesh, mat);
    }
  }

  private sprinkle(
    count: number,
    color: string,
    opacity: number,
    worldSize: number,
    fill: (p: THREE.Vector3) => void,
  ): THREE.Points {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const c = new THREE.Color(color);
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      fill(p);
      positions.set([p.x, p.y, p.z], i * 3);
      const f = 0.7 + 0.3 * Math.random();
      colors.set([c.r * f + 0.15, c.g * f + 0.15, c.b * f + 0.15], i * 3);
      sizes[i] = worldSize * (0.5 + Math.random());
    }
    const mat = makePointMaterial(0.9, 2.6, opacity);
    this.pointMaterials.push(mat);
    return fieldToPoints({ positions, colors, sizes, count }, mat);
  }

  private buildRings() {
    this.scene.add(this.ringsGroup);
    const mat = new THREE.LineBasicMaterial({
      color: 0x6f8cff,
      transparent: true,
      opacity: 0.22,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (const radius of [0.1, 1, 10, 100, 1000, 10000]) {
      const pts: number[] = [];
      const seg = 256;
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        pts.push(radius * Math.cos(a), 0, radius * Math.sin(a));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const line = new THREE.LineLoop(geo, mat);
      line.frustumCulled = false;
      this.ringsGroup.add(line);
      const el = document.createElement("div");
      el.className = "uv-ring-label";
      el.textContent = `${formatMpc(radius)} · ${formatLy(radius)}`;
      this.labelLayer.appendChild(el);
      this.rings.push({ radius, line, el });
    }
  }

  // ───────────────────────────── interaction ─────────────────────────────

  private bindPointer() {
    const el = this.container;
    el.addEventListener("pointerdown", (e) => {
      this.pointerDown = { x: e.clientX, y: e.clientY };
      this.dragging = false;
    });
    el.addEventListener("pointermove", (e) => {
      if (this.pointerDown) {
        if (Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y) > 5)
          this.dragging = true;
        return;
      }
      const m = this.pick(e.clientX, e.clientY, 16);
      if (m !== this.hovered) {
        this.hovered?.el.classList.remove("uv-hover");
        this.hovered = m;
        m?.el.classList.add("uv-hover");
        this.cb.onHover(m?.obj ?? null, e.clientX, e.clientY);
      } else if (m) {
        this.cb.onHover(m.obj, e.clientX, e.clientY);
      }
    });
    el.addEventListener("pointerup", (e) => {
      const wasDrag = this.dragging;
      this.pointerDown = null;
      this.dragging = false;
      if (wasDrag || e.button !== 0) return;
      const m = this.pick(e.clientX, e.clientY, 18);
      this.select(m?.obj.id ?? null);
    });
    el.addEventListener("pointerleave", () => {
      if (this.hovered) {
        this.hovered.el.classList.remove("uv-hover");
        this.hovered = null;
        this.cb.onHover(null, 0, 0);
      }
    });
    el.addEventListener("dblclick", (e) => {
      const m = this.pick(e.clientX, e.clientY, 18);
      if (m) this.flyTo(m.obj.id);
    });
    this.labelLayer.addEventListener("click", (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(".uv-label");
      if (target?.dataset.id) this.select(target.dataset.id);
    });
    this.labelLayer.addEventListener("dblclick", (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>(".uv-label");
      if (target?.dataset.id) this.flyTo(target.dataset.id);
    });
  }

  private pick(clientX: number, clientY: number, radiusPx: number): Marker | null {
    const rect = this.container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: Marker | null = null;
    let bestD = radiusPx;
    for (const m of this.markers) {
      if (!m.onScreen || !m.labelVisible) continue;
      const d = Math.hypot(m.sx - x, m.sy - y);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }

  select(id: string | null) {
    const m = id ? (this.byId.get(id) ?? null) : null;
    if (this.selected === m) {
      if (m) this.cb.onSelect(m.obj);
      return;
    }
    this.selected?.el.classList.remove("uv-selected");
    this.selected = m;
    m?.el.classList.add("uv-selected");
    this.cb.onSelect(m?.obj ?? null);
  }

  flyTo(id: string) {
    const m = this.byId.get(id);
    if (!m) return;
    const o = m.obj;
    this.select(id);
    const target = new THREE.Vector3(...o.pos);
    let dist: number;
    if (o.atOrigin) dist = o.radius * 2.4;
    else if (o.shape === "sphere" || o.shape === "shell") dist = o.radius * 2.9;
    else if (o.shape === "ellipsoid" || o.shape === "ring") dist = o.radius * 2.6;
    else if (o.type === "galaxy") dist = Math.max(0.25, o.radius * 30);
    else if (o.type === "quasar") dist = Math.max(40, o.radius * 60);
    else dist = Math.max(0.5, o.radius * 3);
    this.startFlight(target, dist);
  }

  /** Look at the Milky Way from `dist` Mpc away, keeping the current viewing direction. */
  flyToOrigin(dist: number) {
    this.startFlight(new THREE.Vector3(0, 0, 0), dist);
  }

  private startFlight(target: THREE.Vector3, dist: number) {
    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-12) dir.set(0.6, 0.35, 0.72);
    dir.normalize();
    // Lift the approach slightly so flat structures aren't seen edge-on.
    const p1 = target.clone().add(dir.multiplyScalar(dist));
    this.flight = {
      t0: performance.now(),
      dur: 1600,
      p0: this.camera.position.clone(),
      p1,
      t0v: this.controls.target.clone(),
      t1v: target.clone(),
    };
    this.controls.autoRotate = false;
  }

  private stepFlight(now: number) {
    const f = this.flight;
    if (!f) return;
    const u = Math.min(1, (now - f.t0) / f.dur);
    const s = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; // ease in-out cubic
    const target = f.t0v.clone().lerp(f.t1v, s);
    // Interpolate camera offset in log-distance so zooms across decades feel even.
    const off0 = f.p0.clone().sub(f.t0v);
    const off1 = f.p1.clone().sub(f.t1v);
    const d0 = Math.max(off0.length(), 1e-6);
    const d1 = Math.max(off1.length(), 1e-6);
    const d = Math.exp(Math.log(d0) * (1 - s) + Math.log(d1) * s);
    const dir = off0.normalize().lerp(off1.normalize(), s).normalize();
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(dir.multiplyScalar(d));
    if (u >= 1) this.flight = null;
  }

  setLayer(type: ObjectType, visible: boolean) {
    this.layerVisible[type] = visible;
    const g = this.typeGroups.get(type);
    if (g) g.group.visible = visible;
    if (type === "landmark") this.cmbMat.visible = visible;
  }

  setShowWeb(v: boolean) {
    this.showWeb = v;
    this.web.visible = v;
    this.far.visible = v;
  }

  setShowRings(v: boolean) {
    this.ringsGroup.visible = v;
    if (!v) for (const r of this.rings) r.el.style.display = "none";
  }

  setShowLabels(v: boolean) {
    this.showLabels = v;
    this.labelLayer.style.visibility = v ? "visible" : "hidden";
  }

  resetView() {
    this.flight = null;
    this.controls.target.set(0, 0, 0);
    this.camera.position.set(28, 14, 38);
    this.controls.autoRotate = true;
  }

  // ───────────────────────────── per frame ─────────────────────────────

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const scale = h / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    const pr = this.renderer.getPixelRatio();
    for (const m of this.pointMaterials) {
      m.uniforms.uScale.value = scale;
      m.uniforms.uPixelRatio.value = pr;
    }
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.stepFlight(now);
    this.controls.update();

    const cam = this.camera;
    const camDist = cam.position.length();
    const targetDist = cam.position.distanceTo(this.controls.target);

    // Background density: fade the local web as we pull far away so it doesn't become a white blob.
    const webFade = THREE.MathUtils.clamp(1800 / Math.max(camDist, 1), 0.08, 1);
    this.webMat.uniforms.uOpacity.value = 0.75 * webFade;
    this.farMat.uniforms.uOpacity.value = 0.55 * THREE.MathUtils.clamp(camDist / 60, 0.15, 1);
    // CMB: faint sky when deep inside, brighter near the edge, solid ball from outside.
    const cmbInside = THREE.MathUtils.smoothstep(camDist, 500, 9000);
    const cmbOutside = THREE.MathUtils.smoothstep(
      camDist,
      CMB_RADIUS_MPC * 0.9,
      CMB_RADIUS_MPC * 1.4,
    );
    this.cmbMat.uniforms.uAlpha.value = 0.06 + 0.26 * cmbInside + 0.1 * cmbOutside;
    // Nearby galaxy markers fade once the Local Volume is a dot.
    const gal = this.typeGroups.get("galaxy")!;
    gal.material.uniforms.uOpacity.value = THREE.MathUtils.clamp(
      600 / Math.max(targetDist, 1),
      0.15,
      1,
    );
    const grp = this.typeGroups.get("group")!;
    grp.material.uniforms.uOpacity.value = THREE.MathUtils.clamp(
      1200 / Math.max(targetDist, 1),
      0.2,
      0.9,
    );

    this.updateLabels(camDist, targetDist);
    this.renderer.render(this.scene, cam);

    if (now - this.lastHud > 120) {
      this.lastHud = now;
      const viewWidth = 2 * targetDist * Math.tan((cam.fov * Math.PI) / 360) * cam.aspect;
      this.cb.onFrame({ camDist, viewWidth, targetDist });
    }
  };

  private projected = new THREE.Vector3();
  private placed: { x: number; y: number; w: number; h: number }[] = [];

  private updateLabels(camDist: number, targetDist: number) {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const cam = this.camera;
    cam.updateMatrixWorld();
    const camPos = cam.position;

    // Horizon shells (reionization, CMB) are centred on us: put their label on the shell
    // a little above the view direction when we are inside, or on the near side when outside.
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const lookUp = fwd
      .clone()
      .multiplyScalar(Math.cos(0.32))
      .add(camUp.clone().multiplyScalar(Math.sin(0.32)))
      .normalize();
    for (const m of this.markers) {
      const o = m.obj;
      if (!o.atOrigin) continue;
      const R = o.radius;
      if (camDist < R) {
        const b = camPos.dot(lookUp);
        const c = camPos.lengthSq() - R * R;
        const t = -b + Math.sqrt(Math.max(0, b * b - c));
        const p = camPos.clone().add(lookUp.clone().multiplyScalar(t));
        o.pos = [p.x, p.y, p.z];
      } else {
        // Outside: label the upper limb of the ball rather than its centre.
        const n = camPos.clone().normalize();
        const u = camUp.clone().sub(n.clone().multiplyScalar(camUp.dot(n)));
        if (u.lengthSq() < 1e-8) u.set(0, 1, 0);
        u.normalize();
        const a = Math.acos(Math.min(1, R / camDist));
        const p = n
          .multiplyScalar(Math.cos(a))
          .add(u.multiplyScalar(Math.sin(a)))
          .multiplyScalar(R);
        o.pos = [p.x, p.y, p.z];
      }
    }

    const candidates: Marker[] = [];
    for (const m of this.markers) {
      const o = m.obj;
      m.labelVisible = false;
      if (!this.layerVisible[o.type]) {
        m.onScreen = false;
        m.el.style.display = "none";
        continue;
      }
      this.projected.set(o.pos[0], o.pos[1], o.pos[2]);
      const d = this.projected.distanceTo(camPos);
      this.projected.project(cam);
      const behind = this.projected.z > 1 || this.projected.z < -1;
      const sx = (this.projected.x * 0.5 + 0.5) * w;
      const sy = (-this.projected.y * 0.5 + 0.5) * h;
      m.sx = sx;
      m.sy = sy;
      m.onScreen = !behind && sx >= -40 && sx <= w + 40 && sy >= -20 && sy <= h + 20;
      if (!m.onScreen) {
        m.el.style.display = "none";
        continue;
      }
      // Distance gating: hide when too far away for this object's scale, or when it fills the view.
      // Also hide things far beyond the current scale of view so the Local Group isn't labelled with supervoids.
      let ok = d <= m.labelMax && d <= targetDist * 30;
      if (o.atOrigin) ok = camDist > o.radius * 0.2;
      else if (o.shape && o.shape !== "point" && d < o.radius * 0.35 && o.type !== "supercluster")
        ok = false;
      if (!ok || !this.showLabels) {
        m.el.style.display = "none";
        continue;
      }
      candidates.push(m);
    }

    // Greedy label de-cluttering: important/large first, then nearer labels.
    candidates.sort((a, b) => {
      if (a === this.selected) return -1;
      if (b === this.selected) return 1;
      return b.priority - a.priority;
    });
    this.placed.length = 0;
    let shown = 0;
    for (const m of candidates) {
      const lw = m.w || 90;
      const lh = m.h || 18;
      const rect = { x: m.sx + 8, y: m.sy - lh / 2, w: lw, h: lh };
      let collides = false;
      if (m !== this.selected && m !== this.hovered) {
        for (const p of this.placed) {
          if (
            rect.x < p.x + p.w + 4 &&
            rect.x + rect.w + 4 > p.x &&
            rect.y < p.y + p.h + 2 &&
            rect.y + rect.h + 2 > p.y
          ) {
            collides = true;
            break;
          }
        }
      }
      if (collides || shown > 70) {
        m.el.style.display = "none";
        continue;
      }
      this.placed.push(rect);
      m.labelVisible = true;
      shown++;
      m.el.style.display = "block";
      m.el.style.transform = `translate(${m.sx.toFixed(1)}px, ${m.sy.toFixed(1)}px)`;
    }

    // Scale rings.
    if (this.ringsGroup.visible) {
      for (const r of this.rings) {
        const show =
          camDist > r.radius / 60 && camDist < r.radius * 60 && r.radius > targetDist / 20;
        r.line.visible = show;
        if (!show) {
          r.el.style.display = "none";
          continue;
        }
        // Label the ring at the point nearest the camera's azimuth.
        const az = Math.atan2(camPos.z, camPos.x);
        this.projected.set(r.radius * Math.cos(az), 0, r.radius * Math.sin(az)).project(cam);
        const behind = this.projected.z > 1 || this.projected.z < -1;
        const sx = (this.projected.x * 0.5 + 0.5) * w;
        const sy = (-this.projected.y * 0.5 + 0.5) * h;
        if (behind || sx < 0 || sx > w || sy < 0 || sy > h) {
          r.el.style.display = "none";
          continue;
        }
        r.el.style.display = "block";
        r.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      }
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelLayer.replaceChildren();
  }
}
