import { decodeHtml, stripHtml, toAbsoluteUrl } from "@/lib/common";
import {
  DANAWA_MARKET_NAME,
  DANAWA_USER_AGENT,
} from "@/server/services/scrape/danawa-srp-collector";

export const DANAWA_CATALOG_PARSER_VERSION = "danawa-catalog-import-v0.1";
export { DANAWA_MARKET_NAME };

export type DanawaCatalogRequest = {
  catalogUrl: string;
};

export type DanawaCatalogOffer = {
  marketName: string;
  marketProductNo: string;
  marketItemNo: string | null;
  mallName: string;
  sellerName: string | null;
  sourceUrl: string;
  name: string;
  imageUrl: string | null;
  price: number;
  shippingFee: number | null;
  finalPrice: number | null;
  deliveryText: string | null;
  availability: string | null;
  listingOrder: number;
  isAd: boolean;
  raw: Record<string, unknown>;
};

export type DanawaCatalogFetchResult = {
  sourceUrl: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  html: string;
  catalogProductNo: string | null;
  catalogName: string;
  imageUrl: string | null;
  offers: DanawaCatalogOffer[];
};

export async function fetchDanawaCatalog(
  request: DanawaCatalogRequest,
): Promise<DanawaCatalogFetchResult> {
  const sourceUrl = normalizeDanawaCatalogUrl(request.catalogUrl);
  const response = await fetch(sourceUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": DANAWA_USER_AGENT,
    },
  });
  const html = await response.text();

  if (!response.ok) {
    throw new Error(`Danawa catalog failed: HTTP ${response.status}`);
  }

  const parsed = parseDanawaCatalogPage(html, response.url);

  return {
    sourceUrl,
    finalUrl: response.url,
    status: response.status,
    contentType: response.headers.get("content-type"),
    html,
    ...parsed,
  };
}

export function parseDanawaCatalogPage(html: string, baseUrl: string) {
  const catalogName = readMetaContent(html, "og:title") || readTitle(html) || "이름 없는 카탈로그";
  const imageUrl = toAbsoluteUrl(readMetaContent(html, "og:image"), baseUrl) || null;
  const catalogProductNo = readCatalogProductNo(baseUrl) || readCatalogProductNoFromHtml(html);
  const priceArea = readCatalogPriceArea(html);
  const offerBlocks = [
    ...priceArea.matchAll(/<li\b[^>]*class=["'][^"']*list-item[^"']*["'][^>]*>[\s\S]*?<\/li>/g),
  ];
  const offers = offerBlocks
    .map((match, index) =>
      parseDanawaCatalogOffer(match[0], {
        catalogName,
        imageUrl,
        listingOrder: index + 1,
      }),
    )
    .filter((offer): offer is DanawaCatalogOffer => Boolean(offer));

  return {
    catalogProductNo: catalogProductNo || null,
    catalogName: cleanCatalogName(catalogName),
    imageUrl,
    offers,
  };
}

function parseDanawaCatalogOffer(
  block: string,
  context: { catalogName: string; imageUrl: string | null; listingOrder: number },
): DanawaCatalogOffer | undefined {
  const sourceUrl = toAbsoluteUrl(
    readFirst(block, [/href=["'](?<value>[^"']+)["'][^>]*class=["'][^"']*link__full-cover/]),
    "https://prod.danawa.com",
  );

  if (!sourceUrl) {
    return undefined;
  }

  const url = new URL(sourceUrl);
  const mallName =
    readFirst(block, [/alt=["'](?<value>[^"']+)["']/]) ||
    url.searchParams.get("cmpnyc") ||
    "알 수 없는 판매처";
  const marketProductNo = url.searchParams.get("link_pcode") || url.searchParams.get("pcode");

  if (!marketProductNo) {
    return undefined;
  }

  const deliveryBlock = readDeliveryBlock(block);
  const price = readNumber(readTagByClass(block, "sell-price", "div"));
  const shippingFee = readShippingFee(deliveryBlock);

  const marketName = normalizeMallName(mallName);
  const marketItemNo = url.searchParams.get("cmpnyc");

  return {
    marketName,
    marketProductNo,
    marketItemNo,
    mallName,
    sellerName: null,
    sourceUrl,
    name: cleanCatalogName(context.catalogName),
    imageUrl: context.imageUrl,
    price,
    shippingFee,
    finalPrice: shippingFee === null ? null : price + shippingFee,
    deliveryText: cleanNullableText(stripHtml(deliveryBlock || "")),
    availability: null,
    listingOrder: context.listingOrder,
    isAd: false,
    raw: {
      cmpnyc: url.searchParams.get("cmpnyc"),
      pcode: url.searchParams.get("pcode"),
      isLowest: block.includes("badge__lowest"),
      logoUrl:
        toAbsoluteUrl(readFirst(block, [/<img\b[^>]*src=["'](?<value>[^"']+)["']/]), sourceUrl) ||
        null,
    },
  };
}

function normalizeDanawaCatalogUrl(value: string) {
  const url = new URL(value);

  if (!url.hostname.endsWith("danawa.com")) {
    throw new Error("Danawa catalog URL is required.");
  }

  return url.toString();
}

function readCatalogPriceArea(html: string) {
  const start = html.indexOf('id="lowPriceCompanyArea"');
  const end = html.indexOf('id="bookmark_product_information"', start);

  if (start < 0) {
    return html;
  }

  return html.slice(start, end > start ? end : undefined);
}

function readMetaContent(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return readFirst(html, [
    new RegExp(
      `<meta\\s+property=["']${escaped}["']\\s+content=["'](?<value>[^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta\\s+content=["'](?<value>[^"']+)["']\\s+property=["']${escaped}["'][^>]*>`,
      "i",
    ),
    new RegExp(`<meta\\s+name=["']${escaped}["']\\s+content=["'](?<value>[^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta\\s+content=["'](?<value>[^"']+)["']\\s+name=["']${escaped}["'][^>]*>`, "i"),
  ]);
}

function readTitle(html: string) {
  return stripHtml(readFirst(html, [/<title[^>]*>(?<value>[\s\S]*?)<\/title>/i]) || "");
}

function readCatalogProductNo(value: string) {
  try {
    return new URL(value).searchParams.get("pcode");
  } catch {
    return null;
  }
}

function readCatalogProductNoFromHtml(html: string) {
  return readFirst(html, [/pcode=(?<value>\d+)/, /prodCode["']?\s*[:=]\s*["']?(?<value>\d+)/]);
}

function readTagByClass(html: string, className: string, tagName: string) {
  const pattern = new RegExp(
    `<${tagName}[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>[\\s\\S]*?<\\/${tagName}>`,
  );
  return html.match(pattern)?.[0];
}

function readDeliveryBlock(html: string) {
  const start = html.search(/<div\b[^>]*class=["'][^"']*box__delivery[^"']*["'][^>]*>/);

  if (start < 0) {
    return undefined;
  }

  const end = html.indexOf('<div class="box__installment"', start);
  return html.slice(start, end > start ? end : undefined);
}

function readFirst(html: string | undefined, patterns: RegExp[]) {
  if (!html) {
    return undefined;
  }

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const value = match?.groups?.value || match?.[1];

    if (value) {
      return decodeHtml(value.trim());
    }
  }

  return undefined;
}

function readNumber(value: string | undefined, fallback = 0) {
  if (!value) {
    return fallback;
  }

  const numberValue = Number(stripHtml(value).replace(/[^\d]/g, ""));
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function readShippingFee(value: string | undefined) {
  if (!value) {
    return null;
  }

  if (stripHtml(value).includes("무료배송")) {
    return 0;
  }

  const text = stripHtml(
    value.replace(/<div\b[^>]*class=["'][^"']*layer-prod-pdb1[^"']*["'][\s\S]*/i, ""),
  )
    .replace(/\s+/g, " ")
    .trim();

  if (text.includes("무료배송")) {
    return 0;
  }

  const numberValue = Number(text.replace(/[^\d]/g, ""));
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function cleanNullableText(value: string | undefined) {
  const text = value?.replace(/\s+/g, " ").trim();
  return text || null;
}

function cleanCatalogName(value: string) {
  return value
    .replace(/^\[다나와\]\s*/, "")
    .replace(/\s*:\s*다나와 가격비교\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMallName(value: string) {
  const normalized = value.trim().toLowerCase();
  const knownNames: Record<string, string> = {
    "11번가": "11st",
    g마켓: "gmarket",
    "ssg.com": "ssg",
    쿠팡: "coupang",
    옥션: "auction",
  };

  return knownNames[normalized] || normalized;
}
