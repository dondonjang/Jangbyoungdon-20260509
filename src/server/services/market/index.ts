export { executeMarketRequest } from "@/server/services/market/market-client";
export {
  getMarketBySlug,
  getMarketForUrl,
  listMarkets,
} from "@/server/services/market/market-config";
export {
  resolveAndMaybeExecuteMarketRequest,
  resolveMarketRequest,
} from "@/server/services/market/market-resolver";
export type {
  BotDetectionLevel,
  MarketRenderingMode,
  ProxyStrategy,
} from "@/server/services/market/market-config";
export type {
  MarketRequestResolver,
  MarketResolverRegistry,
} from "@/server/services/market/market-types";
