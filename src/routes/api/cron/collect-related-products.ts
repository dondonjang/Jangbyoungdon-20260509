import { createFileRoute } from "@tanstack/react-router";
import {
  assertCronRequestAuthorized,
  CronUnauthorizedError,
  readCronNumberParam,
} from "@/server/services/cron-auth";
import { collectMissingRelatedProducts } from "@/server/services/product/product-collection-service";

export const Route = createFileRoute("/api/cron/collect-related-products")({
  server: {
    handlers: {
      GET: async ({ request }) => runRelatedProductCron(request),
      POST: async ({ request }) => runRelatedProductCron(request),
    },
  },
});

async function runRelatedProductCron(request: Request) {
  try {
    assertCronRequestAuthorized(request);
    return Response.json(
      await collectMissingRelatedProducts({
        limit: readCronNumberParam(request, "limit"),
        timeBudgetMs: readCronNumberParam(request, "timeBudgetMs"),
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "유사 상품 수집에 실패했습니다.";
    const status = error instanceof CronUnauthorizedError ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
