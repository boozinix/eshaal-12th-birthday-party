import { createFileRoute } from "@tanstack/react-router";
import GalaxyExplorer from "@/components/universe/GalaxyExplorer";

export const Route = createFileRoute("/galaxy")({
  ssr: false,
  component: GalaxyExplorer,
  head: () => ({
    meta: [
      { title: "Milky Way 3D Explorer" },
      {
        name: "description",
        content:
          "Fly through a 3D model of the Milky Way: spiral arms, the central bar, nebulae, star clusters and satellite galaxies at their real positions.",
      },
    ],
  }),
});
