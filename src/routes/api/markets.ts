import { createFileRoute } from "@tanstack/react-router";
import { getMarketBySlug, getMarketForUrl, listMarkets } from "@/server/services/market";

export const Route = createFileRoute("/api/markets")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        const includeDisabled = url.searchParams.get("includeDisabled") === "true";
        const slug = url.searchParams.get("slug");
        const marketUrl = url.searchParams.get("url");

        if (slug) {
          const market = getMarketBySlug(slug);
          return market
            ? Response.json({ market })
            : Response.json({ error: "Market not found." }, { status: 404 });
        }

        if (marketUrl) {
          const market = getMarketForUrl(marketUrl);
          return market
            ? Response.json({ market })
            : Response.json({ error: "Market not found for URL." }, { status: 404 });
        }

        return Response.json({
          markets: listMarkets({ includeDisabled }),
        });
      },
    },
  },
});
