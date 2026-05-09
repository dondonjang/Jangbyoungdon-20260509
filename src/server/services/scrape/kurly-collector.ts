import { decodeHtml } from "@/lib/common";

export const KURLY_MARKET_NAME = "kurly";
export const KURLY_DEFAULT_CATEGORY_NO = "918";
export const KURLY_DEFAULT_CATEGORY_NAME = "생활용품·리빙";
export const KURLY_DEFAULT_PER_PAGE = 96;
export const KURLY_DEFAULT_SORT_TYPE = "4";
export const KURLY_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

export const KURLY_SORT_OPTIONS: Record<string, string> = {
  "4": "추천순",
  "0": "신상품순",
  "1": "판매량순",
  "5": "혜택순",
  "3": "높은 가격순",
  "2": "낮은 가격순",
};

export const KURLY_PLP_PARSER_VERSION = "kurly-plp-import-v0.5";
export const KURLY_PDP_PARSER_VERSION = "kurly-pdp-import-v0.3";

export type KurlyPlpRequest = {
  categoryNo?: string;
  categoryName?: string;
  page: number;
  perPage?: number;
  sortType: string;
};

export type KurlyListProduct = {
  marketProductNo: string;
  marketItemNo: string | null;
  sourceUrl: string;
  name: string;
  imageUrl: string;
  price: number;
  listingPage: number;
  listingOrder: number;
  reviewCount: number;
  rating: number | null;
  summary: string | null;
};

export type KurlyDetailProduct = {
  marketProductNo: string;
  name: string;
  imageUrl: string;
  price: number;
  reviewCount: number;
  rating: number | null;
  summary: string | null;
  description: string | null;
  descriptionImages: string[];
  noticeItems: Array<{
    key: string | null;
    value: string | null;
    dealProductNo: string | number | null;
    dealProductName: string | null;
  }>;
};

export type KurlyPlpFetchResult = {
  sourceUrl: string;
  apiUrl: string;
  status: number;
  contentType: string | null;
  rawJson: unknown;
  products: KurlyListProduct[];
  sortName: string;
};

export type KurlyPdpFetchResult = {
  sourceUrl: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  html: string;
  rawProduct: unknown;
  product: KurlyDetailProduct;
};

export function getKurlySortName(sortType: string) {
  return KURLY_SORT_OPTIONS[sortType] || sortType;
}

export function readKurlySortTypes(value?: string) {
  const requestedTypes = value
    ? value.split(",").map((type) => type.trim())
    : Object.keys(KURLY_SORT_OPTIONS);
  const sortTypes = requestedTypes.filter((type) => Boolean(KURLY_SORT_OPTIONS[type]));

  if (sortTypes.length === 0) {
    throw new Error(`Supported sort types: ${Object.keys(KURLY_SORT_OPTIONS).join(", ")}`);
  }

  return sortTypes;
}

export function buildKurlyPlpUrls(request: KurlyPlpRequest) {
  const categoryNo = request.categoryNo || KURLY_DEFAULT_CATEGORY_NO;
  const perPage = request.perPage || KURLY_DEFAULT_PER_PAGE;
  const sourceUrl = `https://www.kurly.com/categories/${categoryNo}?page=${request.page}&per_page=${perPage}&sorted_type=${request.sortType}`;
  const apiUrl = `https://api.kurly.com/collection/v2/home/sites/market/product-categories/${categoryNo}/products?sort_type=${request.sortType}&page=${request.page}&per_page=${perPage}&filters=`;

  return { sourceUrl, apiUrl };
}

export function buildKurlyPdpUrl(productNo: string) {
  return `https://www.kurly.com/goods/${productNo}`;
}

export async function fetchKurlyPlp(request: KurlyPlpRequest): Promise<KurlyPlpFetchResult> {
  const { sourceUrl, apiUrl } = buildKurlyPlpUrls(request);
  const response = await fetch(apiUrl, {
    headers: {
      accept: "application/json",
      "user-agent": KURLY_USER_AGENT,
    },
  });
  const rawJson = await response.json();

  if (!response.ok) {
    throw new Error(`Kurly PLP API failed: HTTP ${response.status}`);
  }

  const rawProducts = isRecord(rawJson) && Array.isArray(rawJson.data) ? rawJson.data : [];
  const products = rawProducts.map((rawProduct, index) =>
    parseKurlyListProduct(rawProduct, request.page, index, request.perPage),
  );

  return {
    sourceUrl,
    apiUrl,
    status: response.status,
    contentType: response.headers.get("content-type"),
    rawJson,
    products,
    sortName: getKurlySortName(request.sortType),
  };
}

export async function fetchKurlyPdp(
  sourceUrl: string,
  fallback: { marketProductNo: string; name: string },
): Promise<KurlyPdpFetchResult> {
  const response = await fetch(sourceUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": KURLY_USER_AGENT,
    },
  });
  const html = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const rawProduct = extractKurlyProductFromHtml(html);

  return {
    sourceUrl,
    finalUrl: response.url,
    status: response.status,
    contentType: response.headers.get("content-type"),
    html,
    rawProduct,
    product: parseKurlyProductDetail(rawProduct, fallback),
  };
}

export function getKurlyListingOrder(
  page: number,
  index: number,
  perPage = KURLY_DEFAULT_PER_PAGE,
) {
  return (page - 1) * perPage + index + 1;
}

export function parseKurlyListProduct(
  value: unknown,
  page: number,
  index: number,
  perPage = KURLY_DEFAULT_PER_PAGE,
): KurlyListProduct {
  const product = isRecord(value) ? value : {};
  const marketProductNo = String(product.no || "");

  return {
    marketProductNo,
    marketItemNo: product.item_no ? String(product.item_no) : null,
    sourceUrl: buildKurlyPdpUrl(marketProductNo),
    name: typeof product.name === "string" && product.name ? product.name : "이름 없는 상품",
    imageUrl: readString(product.list_image_url) || readString(product.original_image_url) || "",
    price: readNumber(product.discounted_price ?? product.sales_price, 0),
    listingPage: page,
    listingOrder: getKurlyListingOrder(page, index, perPage),
    reviewCount: readNumber(product.review_count, 0),
    rating: readNullableNumber(product.rating ?? product.review_score ?? product.score),
    summary: cleanNullableText(product.short_description),
  };
}

export function extractKurlyProductFromHtml(html: string) {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>(?<json>[\s\S]*?)<\/script>/);

  if (!match?.groups?.json) {
    throw new Error("__NEXT_DATA__ not found.");
  }

  const nextData = JSON.parse(decodeHtml(match.groups.json));
  const product = nextData?.props?.pageProps?.product;

  if (!product?.no) {
    throw new Error("Kurly product data not found.");
  }

  return product;
}

export function parseKurlyProductDetail(
  value: unknown,
  fallback: { marketProductNo: string; name: string },
): KurlyDetailProduct {
  const product = isRecord(value) ? value : {};
  const descriptionImages = readDescriptionImages(product);
  const noticeItems = readNoticeItems(product);
  const marketProductNo = String(product.no || fallback.marketProductNo);
  const price = readNumber(product.discountedPrice ?? product.retailPrice ?? product.basePrice, 0);

  return {
    marketProductNo,
    name: readString(product.name) || fallback.name,
    imageUrl:
      readString(product.mainImageUrl) ||
      readString(product.originalImageUrl) ||
      readString(product.shareImageUrl) ||
      readString(product.productVerticalLargeUrl) ||
      "",
    price,
    reviewCount: readNumber(product.reviewCount, 0),
    rating: readNullableNumber(product.rating ?? product.reviewScore ?? product.score),
    summary: cleanNullableText(product.shortDescription),
    description: cleanNullableText(
      readNestedString(product, [
        "productDetail",
        "contentDescription",
        "description",
        "description",
      ]),
    ),
    descriptionImages,
    noticeItems,
  };
}

function readDescriptionImages(product: Record<string, unknown>) {
  const body = readNestedValue(product, ["productDetail", "partnersContent", "BODY"]);

  if (!Array.isArray(body)) {
    return [];
  }

  return body
    .map((item) => {
      if (!isRecord(item)) return undefined;
      const image = item.IMAGE;
      if (!isRecord(image)) return undefined;
      return readString(image.pcImage) || readString(image.mobileImage);
    })
    .filter((imageUrl): imageUrl is string => Boolean(imageUrl));
}

function readNoticeItems(product: Record<string, unknown>) {
  const notices = product.productNotice;

  if (!Array.isArray(notices)) {
    return [];
  }

  return notices.flatMap((noticeGroup) => {
    if (!isRecord(noticeGroup)) return [];
    const items = Array.isArray(noticeGroup.notices) ? noticeGroup.notices : [];

    return items
      .map((notice) => {
        if (!isRecord(notice)) return undefined;

        return {
          key: cleanNullableText(notice.title),
          value: cleanNullableText(notice.description),
          dealProductNo:
            typeof noticeGroup.dealProductNo === "string" ||
            typeof noticeGroup.dealProductNo === "number"
              ? noticeGroup.dealProductNo
              : null,
          dealProductName: cleanNullableText(noticeGroup.dealProductName),
        };
      })
      .filter((notice): notice is KurlyDetailProduct["noticeItems"][number] =>
        Boolean(notice?.key || notice?.value),
      );
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNestedValue(value: Record<string, unknown>, path: string[]) {
  return path.reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, value);
}

function readNestedString(value: Record<string, unknown>, path: string[]) {
  return readString(readNestedValue(value, path));
}

function cleanNullableText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function readNullableNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}
