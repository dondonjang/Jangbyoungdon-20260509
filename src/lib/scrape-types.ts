import type { ExecutedMarketRequest, ResolvedMarketRequest } from "@/lib/market-types";

export type ScrapePageKind = "plp" | "pdp" | "unknown";

export type ScrapedHtmlRecord = {
  id: string;
  url: string;
  finalUrl: string;
  marketId?: string;
  marketSlug?: string;
  pageKind: ScrapePageKind;
  html: string;
  contentType?: string;
  status: number;
  fetchedAt: string;
};

export type ParsedProductCandidate = {
  name: string;
  url?: string;
  image?: string;
  price?: number;
  currency?: string;
  summary?: string;
  reviewCount?: number;
  rating?: number;
};

export type ParsedProductPage = {
  id: string;
  scrapeId: string;
  url: string;
  marketId?: string;
  marketSlug?: string;
  pageKind: ScrapePageKind;
  title?: string;
  description?: string;
  image?: string;
  canonicalUrl?: string;
  product?: ParsedProductCandidate & {
    brand?: string;
    sku?: string;
    availability?: string;
  };
  productCandidates: ParsedProductCandidate[];
  parserVersion: string;
  parsedAt: string;
};

export type ScrapeParseResult = {
  source: "market-api" | "html";
  marketRequest?: ResolvedMarketRequest;
  marketResponse?: ExecutedMarketRequest;
  html?: Omit<ScrapedHtmlRecord, "html"> & {
    htmlLength: number;
  };
  parsed: ParsedProductPage;
};

export type DefaultScrapeTarget = {
  id: string;
  site: string;
  label: string;
  url: string;
  pageKind: ScrapePageKind;
  enabled: boolean;
  tags: string[];
  notes?: string;
};
