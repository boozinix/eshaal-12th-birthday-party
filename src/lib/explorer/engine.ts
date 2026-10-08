/**
 * Shared explorer engine: renderer, orbit camera with zoom-to-cursor, screen-space
 * labels with de-cluttering, picking, fly-to animation, scale rings and a HUD feed.
 * The three scales (solar system, Milky Way, universe) subclass this and only add
 * their own content.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export interface FrameInfo {
  /** Camera distance from the origin, in world units. */
  camDist: number;
  /** Width of the view at the orbit target, world units. */
  viewWidth: number;
  /** Camera distance to the orbit target, world units. */
  targetDist: number;
  /** Optional status line (e.g. the simulated date). */
  extra?: string;
}

export interface SceneCallbacks {
  onSelect: (id: string | null) => void;
  onHover: (id: string | null, x: number, y: number) => void;
  onFrame: (info: FrameInfo) => void;
  onInteract: () => void;
}

export interface MarkerDef {
  id: string;
  name: string;
  pos: [number, number, number];
  /** CSS class suffix: the label gets `uv-label uv-<cls>`. */
  cls: string;
  /** Layer key for show/hide. */
  layer: string;
  /** Characteristic radius, world units (used for inside-hiding and horizon shells). */
  radius: number;
  /** Hide the label when the camera is farther than this from the object. */
  labelMax: number;
  /** Larger wins when labels collide. */
  priority: number;
  /** Distance the camera stops at when flying here. */
  flyDist: number;
  approx?: boolean;
  /** Shell centred on the origin: the label floats on the shell instead of at the centre. */
  horizon?: boolean;
  /** Hide the label when the camera is deep inside the object. */
  hideInside?: boolean;
  /** Skip the "far beyond current scale" rule (always-visible landmarks). */
  ignoreScale?: boolean;
}

export interface Marker extends MarkerDef {
  el: HTMLDivElement;
  sx: number;
  sy: number;
  onScreen: boolean;
  labelVisible: boolean;
  w: number;
  h: number;
}

export interface SceneOptions {
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
  initialPos: [number, number, number];
  ringRadii: number[];
  ringLabel: (r: number) => string;
  clearColor?: number;
  /** Logarithmic depth buffer, for scenes spanning many orders of magnitude with lit meshes. */
  logDepth?: boolean;
}

export interface PointField {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  count: number;
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
    float depth = max(-mv.z, 1e-9);
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

export function makePointMaterial(
  minPx: number,
  maxPx: number,
  opacity: number,
  blending: THREE.Blending = THREE.AdditiveBlending,
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

export function makeRimMaterial(
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

export function fieldToPoints(field: PointField, material: THREE.ShaderMaterial): THREE.Points {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(field.positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(field.colors, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(field.sizes, 1));
  const pts = new THREE.Points(geo, material);
  pts.frustumCulled = false;
  return pts;
}

/** Deterministic PRNG so procedural content looks the same on every load. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. */
export function gauss(rand: () => number) {
  return Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
}

interface Ring {
  radius: number;
  line: THREE.LineLoop;
  el: HTMLDivElement;
}

interface Flight {
  t0: number;
  dur: number;
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  t0v: THREE.Vector3;
  t1v: THREE.Vector3;
}

export abstract class ExplorerScene {
  protected renderer: THREE.WebGLRenderer;
  protected scene = new THREE.Scene();
  protected camera: THREE.PerspectiveCamera;
  protected controls: OrbitControls;
  protected container: HTMLElement;
  protected labelLayer: HTMLDivElement;
  protected markers: Marker[] = [];
  protected byId = new Map<string, Marker>();
  protected layerGroups = new Map<string, THREE.Group>();
  protected layerVisible = new Map<string, boolean>();
  protected backgroundObjects: THREE.Object3D[] = [];
  protected pointMaterials: THREE.ShaderMaterial[] = [];
  protected cb: SceneCallbacks;
  protected opts: SceneOptions;
  private rings: Ring[] = [];
  private ringsGroup = new THREE.Group();
  private raf = 0;
  private disposed = false;
  private resizeObs: ResizeObserver;
  private selected: Marker | null = null;
  private hovered: Marker | null = null;
  private showLabels = true;
  private flight: Flight | null = null;
  private lastHud = 0;
  private lastNow = 0;
  private pointerDown: { x: number; y: number } | null = null;
  private dragging = false;
  private projected = new THREE.Vector3();
  private placed: { x: number; y: number; w: number; h: number }[] = [];
  private started = false;

  constructor(
    container: HTMLElement,
    labelLayer: HTMLDivElement,
    cb: SceneCallbacks,
    opts: SceneOptions,
  ) {
    this.container = container;
    this.labelLayer = labelLayer;
    this.cb = cb;
    this.opts = opts;

    const w = container.clientWidth || 800;
    const h = container.clientHeight || 600;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      logarithmicDepthBuffer: !!opts.logDepth,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(opts.clearColor ?? 0x02030a, 1);
    this.renderer.sortObjects = false;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(55, w / h, opts.near, opts.far);
    this.camera.position.set(...opts.initialPos);

    this.controls = new OrbitControls(this.camera, container);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.zoomToCursor = true;
    this.controls.zoomSpeed = 1.4;
    this.controls.rotateSpeed = 0.7;
    this.controls.panSpeed = 0.8;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = opts.minDistance;
    this.controls.maxDistance = opts.maxDistance;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.25;
    this.controls.addEventListener("start", () => {
      this.controls.autoRotate = false;
      this.flight = null;
      this.cb.onInteract();
    });

    this.buildRings();
    this.bindPointer();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
  }

  /** Subclasses call this at the end of their constructor, after building content. */
  protected start() {
    if (this.started) return;
    this.started = true;
    this.resize();
    this.loop(performance.now());
  }

  // ───────────────────────────── content helpers ─────────────────────────────

  protected layer(key: string): THREE.Group {
    let g = this.layerGroups.get(key);
    if (!g) {
      g = new THREE.Group();
      this.scene.add(g);
      this.layerGroups.set(key, g);
      this.layerVisible.set(key, true);
    }
    return g;
  }

  protected registerMaterial(m: THREE.ShaderMaterial) {
    this.pointMaterials.push(m);
    return m;
  }

  protected addMarker(def: MarkerDef): Marker {
    const el = document.createElement("div");
    el.className = `uv-label uv-${def.cls}`;
    el.dataset.id = def.id;
    const name = document.createElement("span");
    name.className = "uv-label-name";
    name.textContent = def.name;
    el.appendChild(name);
    if (def.approx) el.title = "Position or size is approximate";
    this.labelLayer.appendChild(el);
    const marker: Marker = {
      ...def,
      el,
      sx: 0,
      sy: 0,
      onScreen: false,
      labelVisible: false,
      w: 0,
      h: 0,
    };
    el.style.visibility = "hidden";
    el.style.display = "block";
    marker.w = name.offsetWidth + 8;
    marker.h = name.offsetHeight;
    el.style.display = "none";
    el.style.visibility = "";
    this.markers.push(marker);
    this.byId.set(def.id, marker);
    this.layer(def.layer);
    return marker;
  }

  setMarkerPos(id: string, pos: [number, number, number]) {
    const m = this.byId.get(id);
    if (m) m.pos = pos;
  }

  getMarkerPos(id: string): [number, number, number] | undefined {
    return this.byId.get(id)?.pos;
  }

  protected sprinkle(
    count: number,
    color: string,
    opacity: number,
    worldSize: number,
    fill: (p: THREE.Vector3, i: number) => void,
    rand: () => number = Math.random,
  ): THREE.Points {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const c = new THREE.Color(color);
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      fill(p, i);
      positions.set([p.x, p.y, p.z], i * 3);
      const f = 0.7 + 0.3 * rand();
      colors.set([c.r * f + 0.15, c.g * f + 0.15, c.b * f + 0.15], i * 3);
      sizes[i] = worldSize * (0.5 + rand());
    }
    const mat = this.registerMaterial(makePointMaterial(0.9, 2.6, opacity));
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
    for (const radius of this.opts.ringRadii) {
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
      el.textContent = this.opts.ringLabel(radius);
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
        this.cb.onHover(m?.id ?? null, e.clientX, e.clientY);
      } else if (m) {
        this.cb.onHover(m.id, e.clientX, e.clientY);
      }
    });
    el.addEventListener("pointerup", (e) => {
      const wasDrag = this.dragging;
      this.pointerDown = null;
      this.dragging = false;
      if (wasDrag || e.button !== 0) return;
      const m = this.pick(e.clientX, e.clientY, 18);
      this.select(m?.id ?? null);
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
      if (m) this.flyTo(m.id);
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
      if (m) this.cb.onSelect(m.id);
      return;
    }
    this.selected?.el.classList.remove("uv-selected");
    this.selected = m;
    m?.el.classList.add("uv-selected");
    this.cb.onSelect(m?.id ?? null);
  }

  flyTo(id: string) {
    const m = this.byId.get(id);
    if (!m) return;
    this.select(id);
    const target = m.horizon ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(...m.pos);
    this.startFlight(target, m.flyDist);
  }

  /** Look at the origin from `dist` world units away, keeping the current viewing direction. */
  flyToOrigin(dist: number) {
    this.startFlight(new THREE.Vector3(0, 0, 0), dist);
  }

  flyToPoint(pos: [number, number, number], dist: number) {
    this.startFlight(new THREE.Vector3(...pos), dist);
  }

  protected startFlight(target: THREE.Vector3, dist: number) {
    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-18) dir.set(0.6, 0.35, 0.72);
    dir.normalize();
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
    const s = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    const target = f.t0v.clone().lerp(f.t1v, s);
    const off0 = f.p0.clone().sub(f.t0v);
    const off1 = f.p1.clone().sub(f.t1v);
    const d0 = Math.max(off0.length(), 1e-9);
    const d1 = Math.max(off1.length(), 1e-9);
    const d = Math.exp(Math.log(d0) * (1 - s) + Math.log(d1) * s);
    const dir = off0.normalize().lerp(off1.normalize(), s).normalize();
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(dir.multiplyScalar(d));
    if (u >= 1) this.flight = null;
  }

  setLayer(key: string, visible: boolean) {
    this.layerVisible.set(key, visible);
    const g = this.layerGroups.get(key);
    if (g) g.visible = visible;
  }

  setBackground(on: boolean) {
    for (const o of this.backgroundObjects) o.visible = on;
  }

  setShowRings(v: boolean) {
    this.ringsGroup.visible = v;
    if (!v) for (const r of this.rings) r.el.style.display = "none";
  }

  setShowLabels(v: boolean) {
    this.showLabels = v;
    this.labelLayer.style.visibility = v ? "visible" : "hidden";
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

  /** Per-frame hook for subclasses (fades, animation). */
  protected tick(_now: number, _dt: number, _camDist: number, _targetDist: number): void {}

  /** Status text appended to the HUD (e.g. a simulated date). */
  protected hudExtra(): string | undefined {
    return undefined;
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    this.stepFlight(now);
    this.controls.update();
    const cam = this.camera;
    const camDist = cam.position.length();
    const targetDist = cam.position.distanceTo(this.controls.target);
    this.tick(now, dt, camDist, targetDist);
    this.updateLabels(camDist, targetDist);
    this.renderer.render(this.scene, cam);
    if (now - this.lastHud > 120) {
      this.lastHud = now;
      const viewWidth = 2 * targetDist * Math.tan((cam.fov * Math.PI) / 360) * cam.aspect;
      this.cb.onFrame({ camDist, viewWidth, targetDist, extra: this.hudExtra() });
    }
  };

  /** Default label gating; subclasses may refine. */
  protected labelOk(m: Marker, d: number, camDist: number, targetDist: number): boolean {
    if (m.horizon) return camDist > m.radius * 0.2;
    if (d > m.labelMax) return false;
    if (!m.ignoreScale && d > targetDist * 30) return false;
    if (m.hideInside && d < m.radius * 0.35) return false;
    return true;
  }

  private updateLabels(camDist: number, targetDist: number) {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const cam = this.camera;
    cam.updateMatrixWorld();
    const camPos = cam.position;

    // Horizon shells: float the label on the shell, above the view direction (inside)
    // or on the upper limb (outside).
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const lookUp = fwd
      .clone()
      .multiplyScalar(Math.cos(0.32))
      .add(camUp.clone().multiplyScalar(Math.sin(0.32)))
      .normalize();
    for (const m of this.markers) {
      if (!m.horizon) continue;
      const R = m.radius;
      if (camDist < R) {
        const b = camPos.dot(lookUp);
        const c = camPos.lengthSq() - R * R;
        const t = -b + Math.sqrt(Math.max(0, b * b - c));
        const p = camPos.clone().add(lookUp.clone().multiplyScalar(t));
        m.pos = [p.x, p.y, p.z];
      } else {
        const n = camPos.clone().normalize();
        const u = camUp.clone().sub(n.clone().multiplyScalar(camUp.dot(n)));
        if (u.lengthSq() < 1e-8) u.set(0, 1, 0);
        u.normalize();
        const a = Math.acos(Math.min(1, R / camDist));
        const p = n
          .multiplyScalar(Math.cos(a))
          .add(u.multiplyScalar(Math.sin(a)))
          .multiplyScalar(R);
        m.pos = [p.x, p.y, p.z];
      }
    }

    const candidates: Marker[] = [];
    for (const m of this.markers) {
      m.labelVisible = false;
      if (!this.layerVisible.get(m.layer)) {
        m.onScreen = false;
        m.el.style.display = "none";
        continue;
      }
      this.projected.set(m.pos[0], m.pos[1], m.pos[2]);
      const d = this.projected.distanceTo(camPos);
      this.projected.project(cam);
      const behind = this.projected.z > 1 || this.projected.z < -1;
      const sx = (this.projected.x * 0.5 + 0.5) * w;
      const sy = (-this.projected.y * 0.5 + 0.5) * h;
      m.sx = sx;
      m.sy = sy;
      m.onScreen = !behind && sx >= -40 && sx <= w + 40 && sy >= -20 && sy <= h + 20;
      if (!m.onScreen || !this.showLabels || !this.labelOk(m, d, camDist, targetDist)) {
        m.el.style.display = "none";
        continue;
      }
      candidates.push(m);
    }

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

    if (this.ringsGroup.visible) {
      for (const r of this.rings) {
        const show =
          camDist > r.radius / 60 && camDist < r.radius * 60 && r.radius > targetDist / 20;
        r.line.visible = show;
        if (!show) {
          r.el.style.display = "none";
          continue;
        }
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
    // Remove only our own labels: another scene may share the layer during a React remount.
    for (const m of this.markers) m.el.remove();
    for (const r of this.rings) r.el.remove();
  }
}
