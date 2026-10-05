import { createFileRoute } from "@tanstack/react-router";
import UniverseExplorer from "@/components/universe/UniverseExplorer";

export const Route = createFileRoute("/universe")({
  // WebGL only: skip server rendering for this page.
  ssr: false,
  component: UniverseExplorer,
  head: () => ({
    meta: [
      { title: "Observable Universe 3D Explorer" },
      {
        name: "description",
        content:
          "Fly through a 3D map of the known universe: the Local Group, Laniakea, great walls, supervoids and quasar groups out to the cosmic microwave background.",
      },
    ],
  }),
});
