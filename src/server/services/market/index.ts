export { executeMarketRequest } from "@/server/services/market/client";
export { getMarketBySlug, getMarketForUrl, listMarkets } from "@/server/services/market/config";
export {
  resolveAndMaybeExecuteMarketRequest,
  resolveMarketRequest,
} from "@/server/services/market/resolver";
export type {
  BotDetectionLevel,
  MarketRenderingMode,
  ProxyStrategy,
} from "@/server/services/market/config";
export type { MarketRequestResolver, MarketResolverRegistry } from "@/server/services/market/types";
