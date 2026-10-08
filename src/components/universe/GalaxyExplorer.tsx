import { useMemo } from "react";
import ExplorerShell, { type ExplorerConfig, type ExplorerItem } from "./ExplorerShell";
import { buildGalaxy, formatKpc, formatPc, GALAXY_TYPE_META } from "@/lib/galaxy/galaxyCatalog";

export default function GalaxyExplorer({ onNavigate }: { onNavigate?: (to: string) => void } = {}) {
  const config = useMemo<ExplorerConfig>(() => {
    const objects = buildGalaxy();
    const items: ExplorerItem[] = objects.map((o) => {
      const dGC = Math.hypot(...o.pos);
      const facts: [string, string][] = [
        [
          "From the Sun",
          o.id === "sun" ? "0 (we are here)" : `${formatKpc(o.dSun)} · ${formatPc(o.dSun)}`,
        ],
        ["From the centre", `${formatKpc(dGC)} · ${formatPc(dGC)}`],
      ];
      if (o.size) facts.push(["Extent", o.size.map((s) => formatKpc(2 * s)).join(" × ")]);
      else if (o.shape === "sphere" || o.shape === "shell")
        facts.push(["Diameter", formatKpc(2 * o.radius)]);
      if (o.l !== undefined && o.b !== undefined)
        facts.push([
          "Galactic coords",
          `l ${o.l.toFixed(1)}°, b ${o.b >= 0 ? "+" : ""}${o.b.toFixed(1)}°`,
        ]);
      return {
        id: o.id,
        name: o.name,
        alt: o.alt,
        group: o.type,
        dist: o.dSun,
        distLabel: o.id === "sun" ? "here" : formatKpc(o.dSun),
        facts,
        desc: o.desc,
        approx: o.approx,
        link: o.id === "sun" ? { to: "/solar-system", label: "Enter the Solar System" } : undefined,
      };
    });
    return {
      key: "galaxy",
      title: "Milky Way",
      blurb: `Our home galaxy in 3D: the spiral arms, bar and bulge, with ${objects.length} named stars, clusters, nebulae and satellite galaxies at their real positions.`,
      hudDistance: "Distance from Galactic Centre",
      fmtA: formatKpc,
      fmtB: formatPc,
      groups: GALAXY_TYPE_META,
      levels: [
        {
          name: "Solar neighbourhood",
          dist: 0.35,
          at: "sun",
          hint: "The nearest stars within 1,000 light-years",
        },
        { name: "Orion Spur", dist: 3, at: "sun", hint: "Our local arm and its nebulae" },
        { name: "Our side of the disc", dist: 13, at: "sun", hint: "Sagittarius to Perseus arms" },
        { name: "Whole galaxy", dist: 40, hint: "The disc, bar and bulge from above" },
        { name: "Halo & satellites", dist: 230, hint: "The Magellanic Clouds and dwarf galaxies" },
      ],
      items,
      backgroundLabel: "Simulated star field",
      homeDist: 40,
      about: (
        <>
          <strong>About the data.</strong> Named objects use published galactic coordinates and
          distances. The spiral arms, bar, bulge and halo are a model star field matching the
          Galaxy's measured shape (pitch angle 12.5°, bar tilted 27°), not individual real stars.
          Items marked <span className="uv-approx-tag">≈</span> are approximate.
        </>
      ),
      createScene: async (c, l, cb) => {
        const mod = await import("@/lib/galaxy/GalaxyScene");
        return new mod.GalaxyScene(c, l, cb);
      },
    };
  }, []);
  return <ExplorerShell config={config} onNavigate={onNavigate} />;
}
