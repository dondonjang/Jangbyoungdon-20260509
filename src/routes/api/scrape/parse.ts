import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { scrapeParseAndSaveLink } from "@/server/services/scrape-and-parse-link";

const scrapeParseRequest = z
  .object({
    url: z.string().optional(),
    link: z.string().optional(),
  })
  .refine((data) => data.url || data.link, {
    message: "url or link is required.",
  });

export const Route = createFileRoute("/api/scrape/parse")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = scrapeParseRequest.parse(await request.json());
          const result = await scrapeParseAndSaveLink(body.url || body.link || "");
          return Response.json(result);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Failed to scrape and parse link.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
