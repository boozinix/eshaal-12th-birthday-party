import { useMemo } from "react";
import ExplorerShell, { type ExplorerConfig, type ExplorerItem } from "./ExplorerShell";
import { buildUniverse, TYPE_META } from "@/lib/universe/catalog";
import { formatLy, formatMpc } from "@/lib/universe/cosmology";

export default function UniverseExplorer({
  onNavigate,
}: { onNavigate?: (to: string) => void } = {}) {
  const config = useMemo<ExplorerConfig>(() => {
    const objects = buildUniverse();
    const items: ExplorerItem[] = objects.map((o) => {
      const facts: [string, string][] = [
        [
          "Distance",
          o.dist === 0 ? "0 (we are here)" : `${formatLy(o.dist)} · ${formatMpc(o.dist)}`,
        ],
      ];
      if (o.z !== undefined) facts.push(["Redshift", `z = ${o.z}`]);
      if (o.atOrigin) facts.push(["Radius", formatLy(o.radius)]);
      else if (o.size) facts.push(["Extent", o.size.map((s) => formatLy(2 * s)).join(" × ")]);
      else if ((o.shape && o.shape !== "point") || o.type === "galaxy")
        facts.push(["Diameter", formatLy(2 * o.radius)]);
      facts.push([
        "Direction",
        `RA ${o.ra.toFixed(1)}°, Dec ${o.dec >= 0 ? "+" : ""}${o.dec.toFixed(1)}°`,
      ]);
      return {
        id: o.id,
        name: o.name,
        alt: o.alt,
        group: o.type,
        dist: o.dist,
        distLabel: o.dist === 0 ? "here" : formatLy(o.dist),
        facts,
        desc: o.desc,
        approx: o.approx,
        link: o.id === "mw" ? { to: "/galaxy", label: "Enter the Milky Way" } : undefined,
      };
    });
    return {
      key: "universe",
      title: "Observable Universe",
      blurb: `A 3D map of ${objects.length} real galaxies, clusters, superclusters, voids and megastructures, from the Local Group to the cosmic microwave background.`,
      hudDistance: "Distance from Milky Way",
      fmtA: formatMpc,
      fmtB: formatLy,
      groups: TYPE_META,
      levels: [
        { name: "Local Group", dist: 2.6, hint: "Milky Way, Andromeda and the dwarfs" },
        { name: "Local Volume", dist: 14, hint: "Nearby groups within 20 Mly" },
        { name: "Virgo Supercluster", dist: 55, hint: "Our local supercluster" },
        { name: "Laniakea", dist: 320, hint: "Great Attractor, Perseus–Pisces, Local Void" },
        { name: "Nearby cosmos", dist: 1100, hint: "Great walls, superclusters and supervoids" },
        { name: "Deep universe", dist: 9000, hint: "Quasar groups and the largest structures" },
        { name: "Observable universe", dist: 34000, hint: "The whole sphere out to the CMB" },
      ],
      items,
      backgroundLabel: "Background stars",
      homeDist: 55,
      about: (
        <>
          <strong>About the data.</strong> Named objects sit at their published sky coordinates and
          distances (comoving, flat ΛCDM, H₀ = 70). Items marked{" "}
          <span className="uv-approx-tag">≈</span> have rough positions or sizes. The faint
          background galaxies are a statistical rendering of the cosmic web, not a survey catalogue.
        </>
      ),
      createScene: async (c, l, cb) => {
        const mod = await import("@/lib/universe/UniverseScene");
        return new mod.UniverseScene(c, l, cb);
      },
    };
  }, []);
  return <ExplorerShell config={config} onNavigate={onNavigate} />;
}
