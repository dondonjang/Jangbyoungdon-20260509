import { decodeHtml, stripHtml, toAbsoluteUrl } from "@/lib/common";

export const DANAWA_MARKET_NAME = "danawa";
export const DANAWA_SEARCH_PARSER_VERSION = "danawa-srp-import-v0.1";
export const DANAWA_DEFAULT_SORT_TYPE = "relevance";
export const DANAWA_DEFAULT_SORT_NAME = "관련도순";
export const DANAWA_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
export const DANAWA_LINK_TYPE = {
  CATALOG: "DANAWA_CATALOG",
  AD_CATALOG: "DANAWA_AD_CATALOG",
  AD_DIRECT: "DANAWA_AD_DIRECT",
} as const;

export type DanawaSrpRequest = {
  query: string;
  page?: number;
};

export type DanawaSearchProduct = {
  marketProductNo: string;
  marketItemNo: string | null;
  mallCode: string | null;
  mallName: string | null;
  linkType: (typeof DANAWA_LINK_TYPE)[keyof typeof DANAWA_LINK_TYPE];
  isCatalog: boolean;
  isAd: boolean;
  sourceUrl: string;
  name: string;
  imageUrl: string;
  price: number;
  listingPage: number;
  listingOrder: number;
  reviewCount: number;
  rating: number | null;
  summary: string | null;
  categoryName: string | null;
  mallCount: number | null;
};

export type DanawaSrpFetchResult = {
  sourceUrl: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  html: string;
  query: string;
  page: number;
  products: DanawaSearchProduct[];
};

export function buildDanawaSrpUrl(request: DanawaSrpRequest) {
  const query = request.query.trim();

  if (!query) {
    throw new Error("Danawa search query is required.");
  }

  const url = new URL("https://search.danawa.com/dsearch.php");
  url.searchParams.set("query", query);

  if (request.page && request.page > 1) {
    url.searchParams.set("page", String(request.page));
  }

  return url.toString();
}

export async function fetchDanawaSrp(request: DanawaSrpRequest): Promise<DanawaSrpFetchResult> {
  const sourceUrl = buildDanawaSrpUrl(request);
  const response = await fetch(sourceUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": DANAWA_USER_AGENT,
    },
  });
  const html = await response.text();

  if (!response.ok) {
    throw new Error(`Danawa SRP failed: HTTP ${response.status}`);
  }

  const page = request.page || 1;

  return {
    sourceUrl,
    finalUrl: response.url,
    status: response.status,
    contentType: response.headers.get("content-type"),
    html,
    query: request.query.trim(),
    page,
    products: parseDanawaSearchProducts(html, page),
  };
}

export function parseDanawaSearchProducts(html: string, page = 1): DanawaSearchProduct[] {
  const starts = [...html.matchAll(/<li\b(?=[^>]*\bid=["']productItem[^"']+["'])[^>]*>/g)];

  if (starts.length === 0) {
    return [];
  }

  const blocks = starts.map((match, index) => {
    const start = match.index || 0;
    const nextStart = starts[index + 1]?.index;
    return html.slice(start, nextStart || html.length);
  });

  return blocks
    .map((block) => parseDanawaSearchProduct(block, page))
    .filter((product): product is DanawaSearchProduct => Boolean(product))
    .map((product, index) => ({ ...product, listingOrder: index + 1 }));
}

function parseDanawaSearchProduct(block: string, page: number): DanawaSearchProduct | undefined {
  const itemCode = readFirst(block, [/<li\b[^>]*\bid=["']productItem(?<value>[^"']+)["']/]);
  const catalogProductNo = readFirst(block, [/pcode=(?<value>\d+)/, /prod_id=(?<value>\d+)/]);
  const marketProductNo = catalogProductNo || itemCode;

  if (!marketProductNo) {
    return undefined;
  }

  const titleAnchor = readAnchorInContainer(block, "prod_name");
  const sourceUrl = toAbsoluteUrl(
    readFirst(titleAnchor || block, [/href=["'](?<value>[^"']+)["']/]),
    "https://search.danawa.com",
  );
  const marketItemNo = readDanawaMarketItemNo(sourceUrl) || itemCode || null;
  const mallCode = readDanawaMallCode(sourceUrl);
  const mallName = readDanawaMallName(block);
  const isCatalog = Boolean(catalogProductNo);
  const isAd = !catalogProductNo || isDanawaAdBlock(block);
  const imageTag = block.match(/<img\b[^>]*>/)?.[0] || "";
  const imageUrl = toAbsoluteUrl(
    readFirst(imageTag, [/\ssrc=["'](?<value>[^"']+)["']/]),
    "https://search.danawa.com",
  );
  const price = readNumber(
    readFirst(block, [
      new RegExp(`id=["']min_price_${marketProductNo}["'][^>]+value=["'](?<value>\\d+)["']`),
      /<p[^>]+class=["']price_sect["'][\s\S]*?<strong>(?<value>[\d,]+)<\/strong>/,
    ]),
  );

  return {
    marketProductNo,
    marketItemNo,
    mallCode,
    mallName,
    linkType: readDanawaLinkType({ isAd, isCatalog }),
    isCatalog,
    isAd,
    sourceUrl: catalogProductNo ? buildDanawaPdpUrl(marketProductNo) : sourceUrl || "",
    name: stripHtml(titleAnchor || "") || "이름 없는 상품",
    imageUrl: imageUrl || "",
    price,
    listingPage: page,
    listingOrder: 0,
    reviewCount: readNumber(
      readFirst(block, [/class=["']text__number["']>(?<value>[\d,]+)<\/span>/]),
    ),
    rating: readNullableNumber(
      readFirst(block, [/class=["']text__score["']>(?<value>[\d.]+)<\/span>/]),
    ),
    summary: cleanNullableText(stripHtml(readTagByClass(block, "spec_list", "div") || "")),
    categoryName: cleanNullableText(
      readFirst(block, [
        new RegExp(
          `id=["']productItem_categoryInfo_${marketProductNo}["'][^>]+value=["'](?<value>[^"']+)["']`,
        ),
      ]),
    ),
    mallCount: readNumber(
      readFirst(block, [/<p[^>]+class=["']chk_sect["'][^>]*>(?<value>[\s\S]*?)<\/p>/]),
    ),
  };
}

function readDanawaLinkType({ isAd, isCatalog }: { isAd: boolean; isCatalog: boolean }) {
  if (isAd && isCatalog) {
    return DANAWA_LINK_TYPE.AD_CATALOG;
  }

  if (isAd) {
    return DANAWA_LINK_TYPE.AD_DIRECT;
  }

  return DANAWA_LINK_TYPE.CATALOG;
}

function isDanawaAdBlock(block: string) {
  return /prod_ad|ad_goods|power|spon|광고|class=["'][^"']*searched/.test(block);
}

function buildDanawaPdpUrl(marketProductNo: string) {
  return `https://prod.danawa.com/info/?pcode=${marketProductNo}`;
}

function readDanawaMarketItemNo(sourceUrl: string | undefined) {
  if (!sourceUrl) {
    return null;
  }

  try {
    const url = new URL(sourceUrl);
    return url.searchParams.get("link_prod_c");
  } catch {
    return null;
  }
}

function readDanawaMallCode(sourceUrl: string | undefined) {
  if (!sourceUrl) {
    return null;
  }

  try {
    const url = new URL(sourceUrl);
    return url.searchParams.get("cmpny_c");
  } catch {
    return null;
  }
}

function readDanawaMallName(block: string) {
  const mallIcon = readTagByClass(block, "mall_icon", "p");
  return (
    cleanNullableText(readFirst(mallIcon || "", [/alt=["'](?<value>[^"']+)["']/])) ||
    cleanNullableText(stripHtml(mallIcon || ""))
  );
}

function readTagByClass(html: string, className: string, tagName: string) {
  const pattern = new RegExp(
    `<${tagName}[^>]*class=["'][^"']*${className}[^"']*["'][^>]*>[\\s\\S]*?<\\/${tagName}>`,
  );
  return html.match(pattern)?.[0];
}

function readAnchorInContainer(html: string, className: string) {
  const container = readTagByClass(html, className, "p") || readTagByClass(html, className, "div");
  return container?.match(/<a\b[\s\S]*?<\/a>/)?.[0];
}

function readFirst(html: string, patterns: RegExp[]) {
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

function readNullableNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const numberValue = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(numberValue) ? numberValue : null;
}

function cleanNullableText(value: string | undefined) {
  const text = value?.replace(/\s+/g, " ").trim();
  return text || null;
}
