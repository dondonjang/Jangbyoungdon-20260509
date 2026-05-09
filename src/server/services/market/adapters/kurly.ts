import type { MarketConfig, ResolvedMarketRequest } from "@/lib/market-types";
import {
  KURLY_DEFAULT_PER_PAGE,
  KURLY_DEFAULT_SORT_TYPE,
} from "@/server/services/scrape/kurly-collector";
import type { MarketRequestResolver } from "@/server/services/market/types";

function getRequiredHeaders(market: MarketConfig) {
  return {
    ...market.requestPolicy.requiredHeaders,
    ...(market.requestPolicy.userAgent ? { "user-agent": market.requestPolicy.userAgent } : {}),
  };
}

function fillTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, encodeURIComponent(String(value))),
    template,
  );
}

function readPositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const resolveKurlyRequest: MarketRequestResolver = (market, url) => {
  const categoryMatch = url.pathname.match(/^\/categories\/([^/?#]+)/);
  if (categoryMatch) {
    const categoryNo = categoryMatch[1];
    const page = readPositiveInt(url.searchParams.get("page"), 1);
    const perPage = Math.min(
      readPositiveInt(url.searchParams.get("per_page"), KURLY_DEFAULT_PER_PAGE),
      100,
    );
    const sortType =
      url.searchParams.get("sorted_type") ||
      url.searchParams.get("sort_type") ||
      KURLY_DEFAULT_SORT_TYPE;
    const filters = url.searchParams.get("filters") || "";
    const endpointTemplate = market.scrapeStrategy.plp.endpointTemplate;

    if (!endpointTemplate) return undefined;

    const params = {
      categoryNo,
      page,
      perPage,
      sortType,
      filters,
    };

    return {
      sourceUrl: url.toString(),
      marketId: market.id,
      marketSlug: market.slug,
      pageKind: "plp",
      mode: market.scrapeStrategy.plp.mode,
      method: "GET",
      url: fillTemplate(endpointTemplate, params),
      headers: getRequiredHeaders(market),
      params,
      notes: [
        "Converted Kurly category URL to the product-categories API.",
        "per_page is capped at 100 because larger values returned a validation error during verification.",
      ],
    } satisfies ResolvedMarketRequest;
  }

  const productMatch = url.pathname.match(/^\/goods\/([^/?#]+)/);
  if (productMatch) {
    const productNo = productMatch[1];
    const endpointTemplate = market.scrapeStrategy.pdp.endpointTemplate;

    if (!endpointTemplate) return undefined;

    const params = { productNo };

    return {
      sourceUrl: url.toString(),
      marketId: market.id,
      marketSlug: market.slug,
      pageKind: "pdp",
      mode: market.scrapeStrategy.pdp.mode,
      method: "GET",
      url: fillTemplate(endpointTemplate, params),
      headers: {
        accept: "text/html,application/xhtml+xml",
        ...(market.requestPolicy.userAgent ? { "user-agent": market.requestPolicy.userAgent } : {}),
      },
      params,
      notes: [
        "Kurly PDP direct JSON API is not confirmed yet.",
        "Fetch the product page HTML and parse __NEXT_DATA__ for detailed product data.",
      ],
    } satisfies ResolvedMarketRequest;
  }

  return undefined;
};
