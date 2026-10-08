import { createFileRoute } from "@tanstack/react-router";
import SolarExplorer from "@/components/universe/SolarExplorer";

export const Route = createFileRoute("/solar-system")({
  ssr: false,
  component: SolarExplorer,
  head: () => ({
    meta: [
      { title: "Solar System 3D Explorer" },
      {
        name: "description",
        content:
          "Fly through the Solar System in 3D: planets, moons, dwarf planets, belts and spacecraft at their real positions, out to the Oort cloud.",
      },
    ],
  }),
});
