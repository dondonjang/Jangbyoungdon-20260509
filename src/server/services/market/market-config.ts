import { z } from "zod";
import type {
  BotDetectionLevel,
  MarketConfig,
  MarketRenderingMode,
  ProxyStrategy,
} from "@/lib/market-types";
import marketsData from "@/server/data/markets.json";

const renderingModes = ["static", "ssr", "csr", "hybrid", "unknown"] as const;
const botDetectionLevels = ["none", "low", "medium", "high", "unknown"] as const;
const proxyStrategies = [
  "none",
  "direct-api",
  "datacenter-proxy",
  "residential-proxy",
  "browser-rendering",
] as const;

const marketSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  companyName: z.string().min(1),
  displayName: z.string().min(1),
  baseUrl: z.string().url(),
  apiBaseUrl: z.string().url().optional(),
  renderingMode: z.enum(renderingModes),
  botDetectionLevel: z.enum(botDetectionLevels),
  botDetectionLogic: z.object({
    level: z.enum(botDetectionLevels),
    signals: z.array(z.string()),
    knownRequirements: z.array(z.string()),
    mitigationNotes: z.array(z.string()),
  }),
  recommendedProxyStrategy: z.enum(proxyStrategies),
  recommendedProxy: z.object({
    strategy: z.enum(proxyStrategies),
    providerHint: z.string().optional(),
    reason: z.string().min(1),
  }),
  requestPolicy: z.object({
    userAgent: z.string().optional(),
    requiredHeaders: z.record(z.string()),
    maxRequestsPerMinute: z.number().int().positive(),
    timeoutMs: z.number().int().positive(),
    retryCount: z.number().int().min(0),
  }),
  scrapeStrategy: z.object({
    plp: z.object({
      mode: z.enum(["html", "api", "browser"]),
      notes: z.string().min(1),
      endpointTemplate: z.string().optional(),
    }),
    pdp: z.object({
      mode: z.enum(["html", "api", "browser"]),
      notes: z.string().min(1),
      endpointTemplate: z.string().optional(),
    }),
  }),
  enabled: z.boolean(),
  notes: z.string().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}) satisfies z.ZodType<MarketConfig>;

const marketsFileSchema = z.object({
  version: z.number().int().positive(),
  markets: z.array(marketSchema),
});

const parsedMarkets = marketsFileSchema.parse(marketsData).markets;

export function listMarkets(options?: { includeDisabled?: boolean }): MarketConfig[] {
  const includeDisabled = options?.includeDisabled ?? false;
  return includeDisabled ? parsedMarkets : parsedMarkets.filter((market) => market.enabled);
}

export function getMarketBySlug(slug: string): MarketConfig | undefined {
  return parsedMarkets.find((market) => market.slug === slug);
}

export function getMarketForUrl(url: string): MarketConfig | undefined {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return undefined;
  }

  return parsedMarkets.find((market) => {
    const marketUrl = new URL(market.baseUrl);
    return (
      parsedUrl.hostname === marketUrl.hostname ||
      parsedUrl.hostname.endsWith(`.${marketUrl.hostname}`)
    );
  });
}

export type { BotDetectionLevel, MarketRenderingMode, ProxyStrategy };
