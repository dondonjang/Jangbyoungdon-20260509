import { createFileRoute } from "@tanstack/react-router";
import {
  assertCronRequestAuthorized,
  CronUnauthorizedError,
  readCronNumberParam,
} from "@/server/services/cron-auth";
import { collectMissingPriceComparisons } from "@/server/services/product/product-collection-service";

export const Route = createFileRoute("/api/cron/collect-price-comparisons")({
  server: {
    handlers: {
      GET: async ({ request }) => runPriceComparisonCron(request),
      POST: async ({ request }) => runPriceComparisonCron(request),
    },
  },
});

async function runPriceComparisonCron(request: Request) {
  try {
    assertCronRequestAuthorized(request);
    return Response.json(
      await collectMissingPriceComparisons({
        limit: readCronNumberParam(request, "limit"),
        timeBudgetMs: readCronNumberParam(request, "timeBudgetMs"),
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "가격비교 수집에 실패했습니다.";
    const status = error instanceof CronUnauthorizedError ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
