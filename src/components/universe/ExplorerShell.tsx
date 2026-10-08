import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ExplorerScene, FrameInfo, SceneCallbacks } from "@/lib/explorer/engine";
import "./universe.css";

export interface GroupMeta {
  label: string;
  plural: string;
  color: string;
  order: number;
}

export interface ExplorerItem {
  id: string;
  name: string;
  alt?: string;
  group: string;
  /** Distance from the scale's reference point, world units (for sorting). */
  dist: number;
  distLabel: string;
  facts: [string, string][];
  desc: string;
  approx?: boolean;
  link?: { to: string; label: string };
}

export interface LevelDef {
  name: string;
  hint: string;
  dist: number;
  /** Centre on this object instead of the origin. */
  at?: string;
}

export interface TimeControls {
  setTimeRate(daysPerSecond: number): void;
  getTimeRate(): number;
  setDate(d: Date): void;
}

export interface ExplorerConfig {
  key: "solar" | "galaxy" | "universe";
  title: string;
  blurb: string;
  hudDistance: string;
  fmtA: (d: number) => string;
  fmtB: (d: number) => string;
  groups: Record<string, GroupMeta>;
  levels: LevelDef[];
  items: ExplorerItem[];
  backgroundLabel: string;
  time?: boolean;
  about: ReactNode;
  homeDist: number;
  createScene: (
    container: HTMLDivElement,
    labelLayer: HTMLDivElement,
    cb: SceneCallbacks,
  ) => Promise<ExplorerScene>;
}

const SCALES: { key: ExplorerConfig["key"]; to: string; label: string }[] = [
  { key: "solar", to: "/solar-system", label: "Solar System" },
  { key: "galaxy", to: "/galaxy", label: "Milky Way" },
  { key: "universe", to: "/universe", label: "Universe" },
];

const SPEEDS: { label: string; rate: number }[] = [
  { label: "1 day/s", rate: 1 },
  { label: "1 week/s", rate: 7 },
  { label: "1 month/s", rate: 30 },
  { label: "1 year/s", rate: 365.25 },
  { label: "10 years/s", rate: 3652.5 },
  { label: "100 years/s", rate: 36525 },
];

/** Lower-case and strip accents so "bootes" finds "Boötes". */
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
    .replace(/[̀-ͯ]/g, "")
    .replace(/[öóòôéèëáàäüúíïçñʻ’−–—]/g, (ch) => ACCENTS[ch] ?? ch)
    .trim();

export default function ExplorerShell({
  config,
  onNavigate,
}: {
  config: ExplorerConfig;
  /** When set, scale links call this instead of using the app router (standalone builds). */
  onNavigate?: (to: string) => void;
}) {
  const NavLink = ({
    to,
    className,
    children,
  }: {
    to: string;
    className: string;
    children: ReactNode;
  }) =>
    onNavigate ? (
      <button type="button" className={className} onClick={() => onNavigate(to)}>
        {children}
      </button>
    ) : (
      <Link to={to} className={className}>
        {children}
      </Link>
    );
  const containerRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ExplorerScene | null>(null);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [frame, setFrame] = useState<FrameInfo>({ camDist: 1, viewWidth: 1, targetDist: 1 });
  const groupKeys = useMemo(
    () =>
      Object.keys(config.groups).sort((a, b) => config.groups[a].order - config.groups[b].order),
    [config.groups],
  );
  const [layers, setLayers] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groupKeys.map((k) => [k, true])),
  );
  const storageKey = `uv.${config.key}.background`;
  const [showBg, setShowBgState] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) !== "off";
    } catch {
      return true;
    }
  });
  const showBgRef = useRef(showBg);
  showBgRef.current = showBg;
  const [showRings, setShowRings] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 760,
  );
  const [showIntro, setShowIntro] = useState(true);
  const [rate, setRate] = useState(0);
  const [rateIdx, setRateIdx] = useState(3);

  const byId = useMemo(() => new Map(config.items.map((i) => [i.id, i])), [config.items]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const hovered = hover ? (byId.get(hover.id) ?? null) : null;

  useEffect(() => {
    let scene: ExplorerScene | null = null;
    let cancelled = false;
    (async () => {
      if (!containerRef.current || !labelRef.current) return;
      const s = await config.createScene(containerRef.current, labelRef.current, {
        onSelect: (id) => setSelectedId(id),
        onHover: (id, x, y) => setHover(id ? { id, x, y } : null),
        onFrame: (info) => setFrame(info),
        onInteract: () => setShowIntro(false),
      });
      if (cancelled) {
        s.dispose();
        return;
      }
      scene = s;
      s.setBackground(showBgRef.current);
      sceneRef.current = s;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      scene?.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.key]);

  const setBackground = (on: boolean) => {
    setShowBgState(on);
    sceneRef.current?.setBackground(on);
    try {
      window.localStorage.setItem(storageKey, on ? "on" : "off");
    } catch {
      /* storage unavailable: the choice just doesn't persist */
    }
  };
  const setBackgroundRef = useRef(setBackground);
  setBackgroundRef.current = setBackground;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = !!(e.target as HTMLElement)?.closest("input");
      if (e.key === "Escape") {
        sceneRef.current?.select(null);
        setShowIntro(false);
      }
      if (typing) return;
      if (e.key.toLowerCase() === "h") sceneRef.current?.flyToOrigin(config.homeDist);
      if (e.key.toLowerCase() === "b") setBackgroundRef.current(!showBgRef.current);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [config.homeDist]);

  const toggleLayer = (k: string) => {
    const v = !layers[k];
    setLayers({ ...layers, [k]: v });
    sceneRef.current?.setLayer(k, v);
  };

  const results = useMemo(() => {
    const q = fold(query);
    const list = q
      ? config.items.filter(
          (o) =>
            fold(o.name).includes(q) ||
            (o.alt !== undefined && fold(o.alt).includes(q)) ||
            fold(config.groups[o.group].label).includes(q),
        )
      : config.items;
    return [...list].sort(
      (a, b) => config.groups[a.group].order - config.groups[b.group].order || a.dist - b.dist,
    );
  }, [config, query]);

  const grouped = useMemo(() => {
    const m = new Map<string, ExplorerItem[]>();
    for (const o of results) {
      if (!m.has(o.group)) m.set(o.group, []);
      m.get(o.group)!.push(o);
    }
    return m;
  }, [results]);

  const fly = (id: string) => {
    sceneRef.current?.flyTo(id);
    setShowIntro(false);
    if (typeof window !== "undefined" && window.innerWidth <= 760) setPanelOpen(false);
  };

  const goLevel = (l: LevelDef) => {
    const s = sceneRef.current;
    if (!s) return;
    const at = l.at ? s.getMarkerPos(l.at) : undefined;
    if (at) s.flyToPoint(at, l.dist);
    else s.flyToOrigin(l.dist);
    setShowIntro(false);
  };

  const timeScene = sceneRef.current as unknown as TimeControls | null;
  const applyRate = (r: number) => {
    setRate(r);
    timeScene?.setTimeRate(r);
  };

  return (
    <div className="uv-root">
      <div ref={containerRef} className="uv-canvas">
        <div ref={labelRef} className="uv-labels" />
      </div>

      {!ready && (
        <div className="uv-loading">
          <div className="uv-spinner" />
          <div>Building the {config.title.toLowerCase()}…</div>
        </div>
      )}

      {/* HUD */}
      <div className="uv-hud">
        <div className="uv-hud-row">
          <span className="uv-hud-k">{config.hudDistance}</span>
          <span className="uv-hud-v">
            {config.fmtA(frame.camDist)} <em>{config.fmtB(frame.camDist)}</em>
          </span>
        </div>
        <div className="uv-hud-row">
          <span className="uv-hud-k">Width of view</span>
          <span className="uv-hud-v">
            {config.fmtA(frame.viewWidth)} <em>{config.fmtB(frame.viewWidth)}</em>
          </span>
        </div>
        {frame.extra && (
          <div className="uv-hud-row">
            <span className="uv-hud-k">Date</span>
            <span className="uv-hud-v">{frame.extra}</span>
          </div>
        )}
      </div>

      {/* Background toggle */}
      <button
        className={`uv-bg-toggle ${showBg ? "" : "uv-bg-off"} ${frame.extra ? "uv-bg-lower" : ""}`}
        onClick={() => setBackground(!showBg)}
        title={`Show or hide the ${config.backgroundLabel.toLowerCase()} (B)`}
        aria-pressed={showBg}
      >
        <span className="uv-bg-icon" aria-hidden="true">
          ✦
        </span>
        {config.backgroundLabel} {showBg ? "on" : "off"}
      </button>

      {/* Time controls */}
      {config.time && ready && (
        <div className="uv-time">
          <button
            className="uv-time-btn"
            onClick={() => timeScene?.setDate(new Date())}
            title="Jump to today"
          >
            Today
          </button>
          <button
            className={`uv-time-btn ${rate ? "uv-time-on" : ""}`}
            onClick={() => applyRate(rate ? 0 : SPEEDS[rateIdx].rate)}
            title="Play or pause the orbits"
          >
            {rate ? "❚❚ Pause" : "▶ Play"}
          </button>
          <select
            className="uv-time-sel"
            value={rateIdx}
            onChange={(e) => {
              const i = Number(e.target.value);
              setRateIdx(i);
              if (rate) applyRate(SPEEDS[i].rate);
            }}
            aria-label="Simulation speed"
          >
            {SPEEDS.map((s, i) => (
              <option key={s.label} value={i}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Zoom levels */}
      <div className="uv-levels">
        {config.levels.map((l) => (
          <button
            key={l.name}
            className={`uv-level ${Math.abs(Math.log10(frame.camDist / l.dist)) < 0.3 && !l.at ? "uv-level-active" : ""}`}
            title={l.hint}
            onClick={() => goLevel(l)}
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
        <nav className="uv-scales" aria-label="Scale">
          {SCALES.map((s) => (
            <NavLink
              key={s.key}
              to={s.to}
              className={`uv-scale ${s.key === config.key ? "uv-scale-active" : ""}`}
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
        <header className="uv-panel-head">
          <h1>{config.title}</h1>
          <p>{config.blurb}</p>
        </header>

        <section className="uv-section">
          <h2>Layers</h2>
          <div className="uv-layers">
            {groupKeys.map((k) => (
              <label key={k} className="uv-layer">
                <input type="checkbox" checked={layers[k]} onChange={() => toggleLayer(k)} />
                <span className="uv-dot" style={{ background: config.groups[k].color }} />
                <span>{config.groups[k].plural}</span>
                <span className="uv-count">{config.items.filter((o) => o.group === k).length}</span>
              </label>
            ))}
            <label className="uv-layer">
              <input type="checkbox" checked={showBg} onChange={() => setBackground(!showBg)} />
              <span className="uv-dot" style={{ background: "#cfd8ff" }} />
              <span>{config.backgroundLabel}</span>
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
            id={`uv-search-${config.key}`}
            className="uv-search"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="uv-list">
            {[...grouped.entries()].map(([g, list]) => (
              <div key={g} className="uv-list-group">
                <div className="uv-list-head" style={{ color: config.groups[g].color }}>
                  {config.groups[g].plural}
                </div>
                {list.map((o) => (
                  <button
                    key={o.id}
                    className={`uv-item ${selectedId === o.id ? "uv-item-active" : ""}`}
                    onClick={() => fly(o.id)}
                    title={o.desc}
                  >
                    <span className="uv-item-name">{o.name}</span>
                    <span className="uv-item-dist">{o.distLabel}</span>
                  </button>
                ))}
              </div>
            ))}
            {results.length === 0 && <div className="uv-empty">Nothing matches “{query}”.</div>}
          </div>
        </section>

        <footer className="uv-about">{config.about}</footer>
      </aside>

      {/* Info card */}
      {selected && (
        <div className={`uv-card ${frame.extra ? "uv-card-lower" : ""}`}>
          <button
            className="uv-card-close"
            onClick={() => sceneRef.current?.select(null)}
            aria-label="Close"
          >
            ×
          </button>
          <div className="uv-card-type" style={{ color: config.groups[selected.group].color }}>
            {config.groups[selected.group].label}
            {selected.approx && (
              <span className="uv-approx-tag" title="Position or size is approximate">
                ≈ approx.
              </span>
            )}
          </div>
          <h3>{selected.name}</h3>
          {selected.alt && <div className="uv-card-alt">{selected.alt}</div>}
          <dl className="uv-card-facts">
            {selected.facts.map(([k, v]) => (
              <div key={k} className="uv-fact">
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="uv-card-desc">{selected.desc}</p>
          <div className="uv-card-actions">
            <button className="uv-btn" onClick={() => fly(selected.id)}>
              Fly there
            </button>
            {selected.link && (
              <NavLink to={selected.link.to} className="uv-btn uv-btn-link">
                {selected.link.label} →
              </NavLink>
            )}
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      {hovered && hover && hovered.id !== selectedId && (
        <div className="uv-tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <span style={{ color: config.groups[hovered.group].color }}>
            {config.groups[hovered.group].label}
          </span>
          <strong>{hovered.name}</strong>
          <span>{hovered.distLabel}</span>
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
        <span>
          <kbd>B</kbd> {config.backgroundLabel.toLowerCase()}
        </span>
      </div>

      {showIntro && ready && (
        <div className="uv-intro" onClick={() => setShowIntro(false)}>
          <div>
            <strong>Scroll to dive in or out, drag to rotate,</strong> double-click anything to fly
            to it.
          </div>
        </div>
      )}
    </div>
  );
}
