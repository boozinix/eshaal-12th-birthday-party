import { useMemo } from "react";
import ExplorerShell, { type ExplorerConfig, type ExplorerItem } from "./ExplorerShell";
import {
  AU_KM,
  formatAU,
  formatAUAlt,
  SOLAR_CATALOG,
  SOLAR_TYPE_META,
} from "@/lib/solar/solarCatalog";

export default function SolarExplorer({ onNavigate }: { onNavigate?: (to: string) => void } = {}) {
  const config = useMemo<ExplorerConfig>(() => {
    const items: ExplorerItem[] = SOLAR_CATALOG.map((o) => {
      let dist: number;
      let distLabel: string;
      if (o.parent) {
        const parent = SOLAR_CATALOG.find((p) => p.id === o.parent)!;
        dist = parent.el?.a ?? 0;
        distLabel = `${(o.el!.a / 1000).toLocaleString("en-US")} thousand km from ${parent.name}`;
      } else if (o.el) {
        dist = o.el.a;
        distLabel = `${formatAU(o.el.a)} (mean)`;
      } else if (o.pos) {
        dist = Math.hypot(...o.pos);
        distLabel = o.id === "sun" ? "centre" : formatAU(dist);
      } else {
        dist = o.r ?? 0;
        distLabel = formatAU(dist);
      }
      const facts: [string, string][] = [...(o.facts ?? [])];
      if (o.el && !o.parent) {
        facts.push(["Semi-major axis", `${formatAU(o.el.a)} · ${formatAUAlt(o.el.a)}`]);
        facts.push(["Eccentricity", o.el.e.toFixed(3)]);
        facts.push(["Inclination", `${o.el.i.toFixed(1)}°`]);
      }
      if (o.parent) {
        facts.push(["Orbit period", `${(360 / o.el!.n).toFixed(2)} days`]);
        if (o.radiusKm) facts.push(["Diameter", `${(2 * o.radiusKm).toLocaleString("en-US")} km`]);
      }
      return {
        id: o.id,
        name: o.name,
        alt: o.alt,
        group: o.type,
        dist,
        distLabel,
        facts,
        desc: o.desc,
        approx: o.approx,
      };
    });
    return {
      key: "solar",
      title: "Solar System",
      blurb: `The Sun, planets, dwarf planets, ${SOLAR_CATALOG.filter((o) => o.type === "moon").length} moons, belts and spacecraft at their real positions today, out to the Oort cloud and the nearest star.`,
      hudDistance: "Distance from the Sun",
      fmtA: formatAU,
      fmtB: formatAUAlt,
      groups: SOLAR_TYPE_META,
      levels: [
        { name: "Earth & Moon", dist: 0.012, at: "earth", hint: "Our planet and its moon" },
        { name: "Inner planets", dist: 4, hint: "Mercury to Mars and the asteroid belt" },
        { name: "Giant planets", dist: 45, hint: "Jupiter to Neptune" },
        { name: "Kuiper belt", dist: 130, hint: "Pluto, Eris and the icy belt" },
        { name: "Heliosphere", dist: 420, hint: "The Voyagers and the edge of the solar wind" },
        { name: "Oort cloud", dist: 260000, hint: "The comet cloud out to 100,000 AU" },
        { name: "Nearest star", dist: 650000, hint: "Alpha Centauri, 4.4 light-years away" },
      ],
      items,
      backgroundLabel: "Background stars",
      homeDist: 45,
      time: true,
      about: (
        <>
          <strong>About the data.</strong> Planets follow JPL's approximate orbital elements and are
          shown where they really are on the displayed date; press Play to run the clock. Dwarf
          planets, comets and spacecraft (marked <span className="uv-approx-tag">≈</span>) use
          approximate elements, and moon positions along their orbits are illustrative. 1 AU is the
          Earth–Sun distance, {(AU_KM / 1e6).toFixed(1)} million km.
        </>
      ),
      createScene: async (c, l, cb) => {
        const mod = await import("@/lib/solar/SolarScene");
        return new mod.SolarScene(c, l, cb);
      },
    };
  }, []);
  return <ExplorerShell config={config} onNavigate={onNavigate} />;
}
