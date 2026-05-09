import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { analyzeProductFromChat } from "@/server/services/product/frontend-product-service";

const analyzeProductRequest = z.object({
  value: z.string().min(1),
});

export const Route = createFileRoute("/api/products/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = analyzeProductRequest.parse(await request.json());
          return Response.json(await analyzeProductFromChat(body.value));
        } catch (error) {
          const message = error instanceof Error ? error.message : "상품 분석에 실패했습니다.";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
