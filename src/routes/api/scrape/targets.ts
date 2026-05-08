import { createFileRoute } from "@tanstack/react-router";
import { listDefaultScrapeTargets } from "@/server/services/default-scrape-targets";

export const Route = createFileRoute("/api/scrape/targets")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        const includeDisabled = url.searchParams.get("includeDisabled") === "true";
        return Response.json({
          targets: listDefaultScrapeTargets({ includeDisabled }),
        });
      },
    },
  },
});
