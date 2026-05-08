import type { MarketResolveResult } from "@/lib/market-types";
import { executeMarketRequest } from "@/server/services/market/client";
import { getMarketForUrl } from "@/server/services/market/config";
import { resolveKurlyRequest } from "@/server/services/market/adapters/kurly";
import type { MarketResolverRegistry } from "@/server/services/market/types";

const resolvers: MarketResolverRegistry = {
  kurly: resolveKurlyRequest,
};

function normalizeMarketUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https URLs can be resolved.");
  }
  return url;
}

export function resolveMarketRequest(value: string) {
  const url = normalizeMarketUrl(value.trim());
  const market = getMarketForUrl(url.toString());

  if (!market) {
    throw new Error("지원하지 않는 마켓입니다.");
  }

  const resolver = resolvers[market.slug];
  if (!resolver) {
    throw new Error(`지원 마켓 설정은 있지만 수집 어댑터가 없습니다: ${market.slug}`);
  }

  const request = resolver(market, url);
  if (!request) {
    throw new Error(`${market.displayName}에서 아직 지원하지 않는 URL 형식입니다.`);
  }

  return { market, request };
}

export async function resolveAndMaybeExecuteMarketRequest(
  value: string,
  options?: { execute?: boolean },
): Promise<MarketResolveResult> {
  const resolved = resolveMarketRequest(value);

  if (!options?.execute) {
    return resolved;
  }

  return {
    ...resolved,
    response: await executeMarketRequest(resolved.request),
  };
}
