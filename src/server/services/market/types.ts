import type { MarketConfig, ResolvedMarketRequest } from "@/lib/market-types";

export type MarketRequestResolver = (
  market: MarketConfig,
  url: URL,
) => ResolvedMarketRequest | undefined;

export type MarketResolverRegistry = Record<string, MarketRequestResolver>;
