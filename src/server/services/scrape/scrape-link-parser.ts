import type {
  ParsedProductCandidate,
  ParsedProductPage,
  ScrapePageKind,
  ScrapeParseResult,
  ScrapedHtmlRecord,
} from "@/lib/scrape-types";
import type { MarketResolveResult, ResolvedMarketRequest } from "@/lib/market-types";
import {
  createId,
  decodeHtml,
  firstMatch,
  normalizeHttpUrl,
  nowIsoTimestamp,
  stripHtml,
  toAbsoluteUrl,
} from "@/lib/common";
import {
  executeMarketRequest,
  getMarketForUrl,
  resolveMarketRequest,
} from "@/server/services/market";
import { inMemoryScrapeRepository } from "@/server/repositories/scrape-repository";

const PARSER_VERSION = "scrape-parser-v0.1";

type JsonLdNode = Record<string, unknown>;
type ParsedProduct = NonNullable<ParsedProductPage["product"]>;

function normalizeUrl(value: string) {
  return normalizeHttpUrl(value, "Only http and https URLs can be scraped.");
}

function getMetaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return firstMatch(html, [
    new RegExp(`<meta\\s+property=["']${escaped}["']\\s+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta\\s+name=["']${escaped}["']\\s+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta\\s+content=["']([^"']+)["']\\s+name=["']${escaped}["'][^>]*>`, "i"),
  ]);
}

function getBasicMetadata(html: string, baseUrl: string) {
  const title =
    getMetaContent(html, "og:title") || firstMatch(html, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
  const description = getMetaContent(html, "og:description") || getMetaContent(html, "description");
  const image = toAbsoluteUrl(getMetaContent(html, "og:image"), baseUrl);
  const canonicalUrl = toAbsoluteUrl(
    firstMatch(html, [/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["'][^>]*>/i]),
    baseUrl,
  );

  return { title, description, image, canonicalUrl };
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function getNodeTypes(node: JsonLdNode) {
  return asArray(node["@type"] as string | string[] | undefined).map((type) => type.toLowerCase());
}

function collectJsonLdNodes(value: unknown, nodes: JsonLdNode[] = []) {
  if (!value || typeof value !== "object") return nodes;
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLdNodes(item, nodes));
    return nodes;
  }

  const node = value as JsonLdNode;
  nodes.push(node);
  collectJsonLdNodes(node["@graph"], nodes);
  collectJsonLdNodes(node.itemListElement, nodes);
  collectJsonLdNodes(node.item, nodes);
  collectJsonLdNodes(node.offers, nodes);
  return nodes;
}

function parseJsonLd(html: string) {
  const nodes: JsonLdNode[] = [];
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  for (const script of scripts) {
    const raw = script[1]?.trim();
    if (!raw) continue;
    try {
      collectJsonLdNodes(JSON.parse(decodeHtml(raw)), nodes);
    } catch {
      // Malformed JSON-LD is common on commerce pages. Ignore it and use other signals.
    }
  }

  return nodes;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? decodeHtml(value.trim()) : undefined;
}

function readNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readProductNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim()) return readNumber(value);
  return undefined;
}

function readReviewCount(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[^\d]/g, "");
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readRating(value: unknown) {
  const rating = readNumber(value);
  return rating !== undefined && rating >= 0 && rating <= 5 ? rating : undefined;
}

function readImage(value: unknown, baseUrl: string) {
  if (typeof value === "string") return toAbsoluteUrl(value, baseUrl);
  if (Array.isArray(value)) return readImage(value[0], baseUrl);
  if (value && typeof value === "object") {
    return toAbsoluteUrl(readString((value as JsonLdNode).url), baseUrl);
  }
  return undefined;
}

function readOffer(node: JsonLdNode | undefined) {
  if (!node) return {};
  const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
  if (!offer || typeof offer !== "object") return {};
  const fields = offer as JsonLdNode;
  return {
    price: readNumber(fields.price ?? fields.lowPrice),
    currency: readString(fields.priceCurrency),
    availability: readString(fields.availability),
  };
}

function productFromJsonLd(node: JsonLdNode, baseUrl: string): ParsedProduct {
  const offer = readOffer(node);
  const brand =
    node.brand && typeof node.brand === "object" ? (node.brand as JsonLdNode).name : node.brand;

  return {
    name: readString(node.name) || "이름 없는 상품",
    url: toAbsoluteUrl(readString(node.url), baseUrl),
    image: readImage(node.image, baseUrl),
    price: offer.price,
    currency: offer.currency,
    ...(readString(brand) ? { brand: readString(brand) } : {}),
    ...(readString(node.sku) ? { sku: readString(node.sku) } : {}),
    ...(offer.availability ? { availability: offer.availability } : {}),
  };
}

function collectProductCandidatesFromJsonLd(nodes: JsonLdNode[], baseUrl: string) {
  return nodes
    .filter((node) => getNodeTypes(node).includes("product"))
    .map((node) => productFromJsonLd(node, baseUrl));
}

function collectProductCandidatesFromLinks(html: string, baseUrl: string) {
  const candidates = new Map<string, ParsedProductCandidate>();
  const links = html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);

  for (const link of links) {
    const href = toAbsoluteUrl(link[1], baseUrl);
    const label = stripHtml(link[2] ?? "").slice(0, 120);
    if (!href || !label || label.length < 3) continue;
    if (!/(product|goods|item|prd|catalog|shop|deal|products|items)/i.test(href)) continue;
    if (!candidates.has(href)) {
      candidates.set(href, { name: label, url: href });
    }
    if (candidates.size >= 20) break;
  }

  return [...candidates.values()];
}

function classifyPage(
  html: string,
  nodes: JsonLdNode[],
  productCandidates: ParsedProductCandidate[],
) {
  const text = stripHtml(html).toLowerCase();
  const productNodeCount = productCandidates.length;
  const hasItemList = nodes.some((node) => getNodeTypes(node).includes("itemlist"));
  const hasProductMeta =
    /property=["']og:type["']\s+content=["']product/i.test(html) ||
    /property=["']product:price/i.test(html);
  const cartSignals = ["add to cart", "장바구니", "구매하기", "바로구매"].filter((signal) =>
    text.includes(signal.toLowerCase()),
  ).length;
  const listSignals = ["검색결과", "상품 목록", "category", "pagination", "load more"].filter(
    (signal) => text.includes(signal.toLowerCase()),
  ).length;

  if (hasItemList || productNodeCount >= 4 || listSignals >= 2) return "plp";
  if (hasProductMeta || productNodeCount === 1 || cartSignals > 0) return "pdp";
  return "unknown";
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; MSAProductAnalyzer/0.1)",
      accept: "text/html,application/xhtml+xml",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to scrape page: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? undefined;
  const html = await response.text();

  return {
    finalUrl: response.url || url,
    status: response.status,
    contentType,
    html,
  };
}

function resolveKnownMarketRequest(url: string): MarketResolveResult | undefined {
  try {
    return resolveMarketRequest(url);
  } catch {
    return undefined;
  }
}

function extractMarketApiProducts(data: unknown, sourceUrl: string) {
  if (!data || typeof data !== "object") return [];

  const payload = data as Record<string, unknown>;
  const products = Array.isArray(payload.data) ? payload.data : [];

  return products
    .filter((product): product is Record<string, unknown> => {
      return Boolean(product && typeof product === "object" && readString(product.name));
    })
    .map((product) => {
      const productNo = readProductNumber(product.no);
      const price = readProductNumber(product.discounted_price ?? product.sales_price);
      const image =
        readString(product.product_vertical_medium_url) || readString(product.list_image_url);
      const reviewCount = readReviewCount(product.review_count);
      const rating = readRating(product.rating ?? product.review_score ?? product.score);
      return {
        name: readString(product.name) || "이름 없는 상품",
        url: productNo ? toAbsoluteUrl(`/goods/${productNo}`, sourceUrl) : undefined,
        image,
        price,
        currency: price ? "KRW" : undefined,
        ...(readString(product.short_description)
          ? { summary: readString(product.short_description) }
          : {}),
        ...(reviewCount !== undefined ? { reviewCount } : {}),
        ...(rating !== undefined ? { rating } : {}),
      } satisfies ParsedProductCandidate;
    });
}

async function scrapeKnownMarketApi(
  url: string,
  resolved: MarketResolveResult,
): Promise<ScrapeParseResult> {
  const response = await executeMarketRequest(resolved.request);
  const now = nowIsoTimestamp();
  const productCandidates = extractMarketApiProducts(response.data, resolved.market.baseUrl);
  const parsedRecord: ParsedProductPage = {
    id: createId("parsed"),
    scrapeId: createId("api"),
    url,
    marketId: resolved.market.id,
    marketSlug: resolved.market.slug,
    pageKind: resolved.request.pageKind,
    productCandidates,
    parserVersion: PARSER_VERSION,
    parsedAt: now,
  };

  await inMemoryScrapeRepository.saveParsed(parsedRecord);

  return {
    source: "market-api",
    marketRequest: resolved.request,
    marketResponse: response,
    parsed: parsedRecord,
  };
}

function getHtmlUrl(url: string, marketRequest?: ResolvedMarketRequest) {
  if (!marketRequest || marketRequest.mode === "api") return url;
  return marketRequest.url;
}

export async function scrapeParseAndSaveLink(value: string): Promise<ScrapeParseResult> {
  const url = normalizeUrl(value.trim());
  const resolved = resolveKnownMarketRequest(url);

  if (resolved?.request.mode === "api") {
    return scrapeKnownMarketApi(url, resolved);
  }

  const market = resolved?.market ?? getMarketForUrl(url);
  const marketRequest = resolved?.request;
  const fetched = await fetchHtml(getHtmlUrl(url, marketRequest));
  const metadata = getBasicMetadata(fetched.html, fetched.finalUrl);
  const jsonLdNodes = parseJsonLd(fetched.html);
  const jsonLdProducts = collectProductCandidatesFromJsonLd(jsonLdNodes, fetched.finalUrl);
  const linkProducts = collectProductCandidatesFromLinks(fetched.html, fetched.finalUrl);
  const productCandidates = [...jsonLdProducts, ...linkProducts].slice(0, 30);
  const pageKind = classifyPage(fetched.html, jsonLdNodes, productCandidates);
  const now = nowIsoTimestamp();

  const htmlRecord: ScrapedHtmlRecord = {
    id: createId("html"),
    url,
    finalUrl: fetched.finalUrl,
    marketId: market?.id,
    marketSlug: market?.slug,
    pageKind,
    html: fetched.html,
    contentType: fetched.contentType,
    status: fetched.status,
    fetchedAt: now,
  };
  await inMemoryScrapeRepository.saveHtml(htmlRecord);

  const primaryProduct = pageKind === "pdp" ? jsonLdProducts[0] || linkProducts[0] : undefined;
  const parsedRecord: ParsedProductPage = {
    id: createId("parsed"),
    scrapeId: htmlRecord.id,
    url: fetched.finalUrl,
    marketId: market?.id,
    marketSlug: market?.slug,
    pageKind,
    title: metadata.title,
    description: metadata.description,
    image: metadata.image,
    canonicalUrl: metadata.canonicalUrl,
    product: primaryProduct,
    productCandidates,
    parserVersion: PARSER_VERSION,
    parsedAt: now,
  };
  await inMemoryScrapeRepository.saveParsed(parsedRecord);

  return {
    source: "html",
    marketRequest,
    html: {
      id: htmlRecord.id,
      url: htmlRecord.url,
      finalUrl: htmlRecord.finalUrl,
      marketId: htmlRecord.marketId,
      marketSlug: htmlRecord.marketSlug,
      pageKind: htmlRecord.pageKind,
      contentType: htmlRecord.contentType,
      status: htmlRecord.status,
      fetchedAt: htmlRecord.fetchedAt,
      htmlLength: htmlRecord.html.length,
    },
    parsed: parsedRecord,
  };
}
