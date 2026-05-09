import { createFileRoute } from "@tanstack/react-router";
import { listSavedProductViewPage } from "@/server/services/product/saved-product-view";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

export const Route = createFileRoute("/api/products/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const page = Number(url.searchParams.get("page") || DEFAULT_PAGE);
          const pageSize = Number(url.searchParams.get("pageSize") || DEFAULT_PAGE_SIZE);

          return Response.json(await listSavedProductViewPage({ page, pageSize }));
        } catch (error) {
          const message = error instanceof Error ? error.message : "상품 목록 조회에 실패했습니다.";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
