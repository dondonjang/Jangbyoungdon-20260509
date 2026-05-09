import { createFileRoute } from "@tanstack/react-router";
import { listSavedProductViews } from "@/server/services/product/saved-product-view";

export const Route = createFileRoute("/api/internal/products")({
  server: {
    handlers: {
      GET: async () => {
        try {
          return Response.json({ products: await listSavedProductViews() });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to list products.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
