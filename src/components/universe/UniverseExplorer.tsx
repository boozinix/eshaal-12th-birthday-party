import { useEffect, useMemo, useRef, useState } from "react";
import { TYPE_META, type ObjectType, type UniverseObject } from "@/lib/universe/catalog";
import { formatLy, formatMpc } from "@/lib/universe/cosmology";
import type { FrameInfo, UniverseScene } from "@/lib/universe/UniverseScene";
import "./universe.css";

/** Lower-case and strip accents so "bootes" finds "Boötes" (with a table fallback when NFD is unavailable). */
const ACCENTS: Record<string, string> = {
  ö: "o",
  ó: "o",
  ò: "o",
  ô: "o",
  é: "e",
  è: "e",
  ë: "e",
  á: "a",
  à: "a",
  ä: "a",
  ü: "u",
  ú: "u",
  í: "i",
  ï: "i",
  ç: "c",
  ñ: "n",
  ʻ: "",
  "’": "'",
  "−": "-",
  "–": "-",
  "—": "-",
};
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[öóòôéèëáàäüúíïçñʻ’−–—]/g, (ch) => ACCENTS[ch] ?? ch)
    .trim();

const TYPES = (Object.keys(TYPE_META) as ObjectType[]).sort(
  (a, b) => TYPE_META[a].order - TYPE_META[b].order,
);

const LEVELS: { name: string; dist: number; hint: string }[] = [
  { name: "Local Group", dist: 2.6, hint: "Milky Way, Andromeda and the dwarfs" },
  { name: "Local Volume", dist: 14, hint: "Nearby groups within 20 Mly" },
  { name: "Virgo Supercluster", dist: 55, hint: "Our local supercluster" },
  { name: "Laniakea", dist: 320, hint: "Great Attractor, Perseus–Pisces, Local Void" },
  { name: "Nearby cosmos", dist: 1100, hint: "Great walls, superclusters and supervoids" },
  { name: "Deep universe", dist: 9000, hint: "Quasar groups and the largest structures" },
  { name: "Observable universe", dist: 34000, hint: "The whole sphere out to the CMB" },
];

export default function UniverseExplorer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<UniverseScene | null>(null);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<UniverseObject | null>(null);
  const [hover, setHover] = useState<{ obj: UniverseObject; x: number; y: number } | null>(null);
  const [frame, setFrame] = useState<FrameInfo>({ camDist: 50, viewWidth: 60, targetDist: 50 });
  const [layers, setLayers] = useState<Record<ObjectType, boolean>>(
    () => Object.fromEntries(TYPES.map((t) => [t, true])) as Record<ObjectType, boolean>,
  );
  const [showWeb, setShowWeb] = useState(true);
  const [showRings, setShowRings] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 760,
  );
  const [showIntro, setShowIntro] = useState(true);
  const [objects, setObjects] = useState<UniverseObject[]>([]);

  useEffect(() => {
    let scene: UniverseScene | null = null;
    let cancelled = false;
    (async () => {
      const mod = await import("@/lib/universe/UniverseScene");
      if (cancelled || !containerRef.current || !labelRef.current) return;
      scene = new mod.UniverseScene(containerRef.current, labelRef.current, {
        onSelect: (o) => setSelected(o),
        onHover: (o, x, y) => setHover(o ? { obj: o, x, y } : null),
        onFrame: (info) => setFrame(info),
        onInteract: () => setShowIntro(false),
      });
      sceneRef.current = scene;
      setObjects(scene.objects);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        sceneRef.current?.select(null);
        setShowIntro(false);
      }
      if (e.key.toLowerCase() === "h" && !(e.target as HTMLElement)?.closest("input"))
        sceneRef.current?.flyToOrigin(55);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleLayer = (t: ObjectType) => {
    const v = !layers[t];
    setLayers({ ...layers, [t]: v });
    sceneRef.current?.setLayer(t, v);
  };

  const results = useMemo(() => {
    const q = fold(query);
    const list = q
      ? objects.filter(
          (o) =>
            fold(o.name).includes(q) ||
            (o.alt !== undefined && fold(o.alt).includes(q)) ||
            fold(TYPE_META[o.type].label).includes(q),
        )
      : objects;
    return [...list].sort(
      (a, b) => TYPE_META[a.type].order - TYPE_META[b.type].order || a.dist - b.dist,
    );
  }, [objects, query]);

  const grouped = useMemo(() => {
    const m = new Map<ObjectType, UniverseObject[]>();
    for (const o of results) {
      if (!m.has(o.type)) m.set(o.type, []);
      m.get(o.type)!.push(o);
    }
    return m;
  }, [results]);

  const fly = (id: string) => {
    sceneRef.current?.flyTo(id);
    setShowIntro(false);
    if (typeof window !== "undefined" && window.innerWidth <= 760) setPanelOpen(false);
  };

  return (
    <div className="uv-root">
      <div ref={containerRef} className="uv-canvas">
        <div ref={labelRef} className="uv-labels" />
      </div>

      {!ready && (
        <div className="uv-loading">
          <div className="uv-spinner" />
          <div>Building the universe…</div>
        </div>
      )}

      {/* HUD */}
      <div className="uv-hud">
        <div className="uv-hud-row">
          <span className="uv-hud-k">Distance from Milky Way</span>
          <span className="uv-hud-v">
            {formatMpc(frame.camDist)} <em>{formatLy(frame.camDist)}</em>
          </span>
        </div>
        <div className="uv-hud-row">
          <span className="uv-hud-k">Width of view</span>
          <span className="uv-hud-v">
            {formatMpc(frame.viewWidth)} <em>{formatLy(frame.viewWidth)}</em>
          </span>
        </div>
      </div>

      {/* Zoom levels */}
      <div className="uv-levels">
        {LEVELS.map((l) => (
          <button
            key={l.name}
            className={`uv-level ${Math.abs(Math.log10(frame.camDist / l.dist)) < 0.3 ? "uv-level-active" : ""}`}
            title={l.hint}
            onClick={() => {
              sceneRef.current?.flyToOrigin(l.dist);
              setShowIntro(false);
            }}
          >
            {l.name}
          </button>
        ))}
      </div>

      {/* Side panel */}
      <button
        className={`uv-panel-toggle ${panelOpen ? "open" : ""}`}
        onClick={() => setPanelOpen(!panelOpen)}
        aria-label="Toggle panel"
      >
        {panelOpen ? "‹" : "›"}
      </button>
      <aside className={`uv-panel ${panelOpen ? "" : "uv-panel-closed"}`}>
        <header className="uv-panel-head">
          <h1>Observable Universe</h1>
          <p>
            A 3D map of {objects.length} real galaxies, clusters, superclusters, voids and
            megastructures, from the Local Group to the cosmic microwave background.
          </p>
        </header>

        <section className="uv-section">
          <h2>Layers</h2>
          <div className="uv-layers">
            {TYPES.map((t) => (
              <label key={t} className="uv-layer">
                <input type="checkbox" checked={layers[t]} onChange={() => toggleLayer(t)} />
                <span className="uv-dot" style={{ background: TYPE_META[t].color }} />
                <span>{TYPE_META[t].plural}</span>
                <span className="uv-count">{objects.filter((o) => o.type === t).length}</span>
              </label>
            ))}
            <label className="uv-layer">
              <input
                type="checkbox"
                checked={showWeb}
                onChange={() => {
                  setShowWeb(!showWeb);
                  sceneRef.current?.setShowWeb(!showWeb);
                }}
              />
              <span className="uv-dot" style={{ background: "#cfd8ff" }} />
              <span>Cosmic web (background galaxies)</span>
            </label>
            <label className="uv-layer">
              <input
                type="checkbox"
                checked={showRings}
                onChange={() => {
                  setShowRings(!showRings);
                  sceneRef.current?.setShowRings(!showRings);
                }}
              />
              <span className="uv-dot" style={{ background: "#6f8cff" }} />
              <span>Distance rings</span>
            </label>
            <label className="uv-layer">
              <input
                type="checkbox"
                checked={showLabels}
                onChange={() => {
                  setShowLabels(!showLabels);
                  sceneRef.current?.setShowLabels(!showLabels);
                }}
              />
              <span className="uv-dot" style={{ background: "#ffffff" }} />
              <span>Labels</span>
            </label>
          </div>
        </section>

        <section className="uv-section uv-section-grow">
          <h2>Find an object</h2>
          <input
            className="uv-search"
            placeholder="Search… e.g. Andromeda, Boötes Void, Laniakea"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="uv-list">
            {[...grouped.entries()].map(([type, list]) => (
              <div key={type} className="uv-list-group">
                <div className="uv-list-head" style={{ color: TYPE_META[type].color }}>
                  {TYPE_META[type].plural}
                </div>
                {list.map((o) => (
                  <button
                    key={o.id}
                    className={`uv-item ${selected?.id === o.id ? "uv-item-active" : ""}`}
                    onClick={() => fly(o.id)}
                    title={o.desc}
                  >
                    <span className="uv-item-name">{o.name}</span>
                    <span className="uv-item-dist">{o.dist === 0 ? "here" : formatLy(o.dist)}</span>
                  </button>
                ))}
              </div>
            ))}
            {results.length === 0 && <div className="uv-empty">Nothing matches “{query}”.</div>}
          </div>
        </section>

        <footer className="uv-about">
          <strong>About the data.</strong> Named objects sit at their published sky coordinates and
          distances (comoving, flat ΛCDM, H₀ = 70). Items marked{" "}
          <span className="uv-approx-tag">≈</span> have rough positions or sizes. The faint
          background galaxies are a statistical rendering of the cosmic web, not a survey catalogue.
        </footer>
      </aside>

      {/* Info card */}
      {selected && (
        <div className="uv-card">
          <button
            className="uv-card-close"
            onClick={() => sceneRef.current?.select(null)}
            aria-label="Close"
          >
            ×
          </button>
          <div className="uv-card-type" style={{ color: TYPE_META[selected.type].color }}>
            {TYPE_META[selected.type].label}
            {selected.approx && (
              <span className="uv-approx-tag" title="Position or size is approximate">
                ≈ approx.
              </span>
            )}
          </div>
          <h3>{selected.name}</h3>
          {selected.alt && <div className="uv-card-alt">{selected.alt}</div>}
          <dl className="uv-card-facts">
            <dt>Distance</dt>
            <dd>
              {selected.dist === 0
                ? "0 (we are here)"
                : `${formatLy(selected.dist)} · ${formatMpc(selected.dist)}`}
            </dd>
            {selected.z !== undefined && (
              <>
                <dt>Redshift</dt>
                <dd>z = {selected.z}</dd>
              </>
            )}
            {selected.atOrigin ? (
              <>
                <dt>Radius</dt>
                <dd>{formatLy(selected.radius)}</dd>
              </>
            ) : selected.size ? (
              <>
                <dt>Extent</dt>
                <dd>{selected.size.map((s) => formatLy(2 * s)).join(" × ")}</dd>
              </>
            ) : selected.shape && selected.shape !== "point" ? (
              <>
                <dt>Diameter</dt>
                <dd>{formatLy(2 * selected.radius)}</dd>
              </>
            ) : selected.type === "galaxy" ? (
              <>
                <dt>Diameter</dt>
                <dd>{formatLy(2 * selected.radius)}</dd>
              </>
            ) : null}
            <dt>Direction</dt>
            <dd>
              RA {selected.ra.toFixed(1)}°, Dec {selected.dec >= 0 ? "+" : ""}
              {selected.dec.toFixed(1)}°
            </dd>
          </dl>
          <p className="uv-card-desc">{selected.desc}</p>
          <button className="uv-btn" onClick={() => fly(selected.id)}>
            Fly there
          </button>
        </div>
      )}

      {/* Hover tooltip */}
      {hover && hover.obj.id !== selected?.id && (
        <div className="uv-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <span style={{ color: TYPE_META[hover.obj.type].color }}>
            {TYPE_META[hover.obj.type].label}
          </span>
          <strong>{hover.obj.name}</strong>
          <span>{hover.obj.dist === 0 ? "here" : formatLy(hover.obj.dist)}</span>
        </div>
      )}

      {/* Controls help */}
      <div className="uv-help">
        <span>
          <kbd>drag</kbd> rotate
        </span>
        <span>
          <kbd>scroll</kbd> zoom toward cursor
        </span>
        <span>
          <kbd>right-drag</kbd> pan
        </span>
        <span>
          <kbd>click</kbd> info
        </span>
        <span>
          <kbd>double-click</kbd> fly there
        </span>
        <span>
          <kbd>H</kbd> home
        </span>
      </div>

      {showIntro && ready && (
        <div className="uv-intro" onClick={() => setShowIntro(false)}>
          <div>
            <strong>You are at the centre.</strong> Scroll to dive in or out, drag to rotate,
            double-click anything to fly to it.
          </div>
        </div>
      )}
    </div>
  );
}
