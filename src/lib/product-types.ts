export type ProductLinkOfferView = {
  id: number;
  marketName: string;
  marketProductNo: string;
  marketItemNo: string | null;
  mallName: string;
  sellerName: string | null;
  sourceUrl: string;
  name: string;
  imageUrl: string | null;
  price: number | null;
  shippingFee: number | null;
  finalPrice: number | null;
  deliveryText: string | null;
  availability: string | null;
  listingOrder: number | null;
  isAd: boolean;
};

export type ProductLinkView = {
  id: number;
  marketName: string;
  marketProductNo: string;
  marketItemNo: string | null;
  mallCode: string | null;
  mallName: string | null;
  linkType: string;
  relationKind: "SAME_PRODUCT" | "RECOMMENDED_PRODUCT" | string;
  searchKeyword: string | null;
  sourceUrl: string;
  name: string;
  imageUrl: string | null;
  price: number | null;
  isCatalog: boolean;
  categoryName: string | null;
  mallCount: number | null;
  reviewCount: number | null;
  rating: number | null;
  summary: string | null;
  recommendationScore: number | null;
  recommendationTier: string | null;
  recommendationReasons: string[];
  listingOrder: number | null;
  isAd: boolean;
  offers: ProductLinkOfferView[];
};

export type OtherUserInterestProductView = {
  id: number;
  displayName: string;
  brand: string | null;
  summary: string | null;
  interestCount: number;
  sourceProduct: {
    id: number;
    marketName: string;
    marketProductNo: string;
    sourceUrl: string;
    name: string;
    imageUrl: string;
    price: number;
  } | null;
  updatedAt: string;
};

export type SavedProductView = {
  id: number;
  displayName: string;
  refinedName: string | null;
  brand: string | null;
  summary: string | null;
  analysisStatus: string;
  sameKeywords: string[];
  relatedKeywords: string[];
  relatedCoreAttributes: string[];
  sourceProduct: {
    id: number;
    marketName: string;
    marketProductNo: string;
    sourceUrl: string;
    name: string;
    imageUrl: string;
    price: number;
  } | null;
  sameProductLinks: ProductLinkView[];
  recommendedProductLinks: ProductLinkView[];
  otherUserInterestProducts: OtherUserInterestProductView[];
  createdAt: string;
  updatedAt: string;
};

export type SavedProductListPage = {
  products: SavedProductView[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type ChatProductAnalyzeResult = {
  product: SavedProductView;
  message: string;
};

export type AnalyzeProductInput = {
  value: string;
};

export function isSupportedProductDetailUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    const isKurlyHost = url.hostname === "www.kurly.com" || url.hostname.endsWith(".kurly.com");
    return isKurlyHost && /^\/goods\/[^/?#]+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isSupportedProductInput(value: string) {
  return isSupportedProductDetailUrl(value);
}

export function formatKRW(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}
