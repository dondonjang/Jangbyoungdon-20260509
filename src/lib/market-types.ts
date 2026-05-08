export type MarketRenderingMode = "static" | "ssr" | "csr" | "hybrid" | "unknown";

export type BotDetectionLevel = "none" | "low" | "medium" | "high" | "unknown";

export type ProxyStrategy =
  | "none"
  | "direct-api"
  | "datacenter-proxy"
  | "residential-proxy"
  | "browser-rendering";

export type MarketRequestPolicy = {
  userAgent?: string;
  requiredHeaders: Record<string, string>;
  maxRequestsPerMinute: number;
  timeoutMs: number;
  retryCount: number;
};

export type MarketBotDetectionLogic = {
  level: BotDetectionLevel;
  signals: string[];
  knownRequirements: string[];
  mitigationNotes: string[];
};

export type MarketRecommendedProxy = {
  strategy: ProxyStrategy;
  providerHint?: string;
  reason: string;
};

export type MarketScrapeStrategy = {
  plp: {
    mode: "html" | "api" | "browser";
    notes: string;
    endpointTemplate?: string;
  };
  pdp: {
    mode: "html" | "api" | "browser";
    notes: string;
    endpointTemplate?: string;
  };
};

export type ResolvedMarketRequest = {
  sourceUrl: string;
  marketId: string;
  marketSlug: string;
  pageKind: "plp" | "pdp" | "unknown";
  mode: "html" | "api" | "browser";
  method: "GET";
  url: string;
  headers: Record<string, string>;
  params: Record<string, string | number | boolean>;
  notes: string[];
};

export type ExecutedMarketRequest = {
  status: number;
  contentType?: string;
  fetchedAt: string;
  data?: unknown;
  text?: string;
};

export type MarketResolveResult = {
  market: MarketConfig;
  request: ResolvedMarketRequest;
  response?: ExecutedMarketRequest;
};

export type MarketConfig = {
  id: string;
  slug: string;
  companyName: string;
  displayName: string;
  baseUrl: string;
  apiBaseUrl?: string;
  renderingMode: MarketRenderingMode;
  botDetectionLevel: BotDetectionLevel;
  botDetectionLogic: MarketBotDetectionLogic;
  recommendedProxyStrategy: ProxyStrategy;
  recommendedProxy: MarketRecommendedProxy;
  requestPolicy: MarketRequestPolicy;
  scrapeStrategy: MarketScrapeStrategy;
  enabled: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};
