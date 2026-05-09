export type ProductInputKind = "name" | "url";

export type ProductListing = {
  shop: string;
  title: string;
  price: number;
  shipping: number;
  url: string;
};

export type ProductRecommendation = {
  name: string;
  price: number;
  rating: number;
  review: string;
  reason: string;
};

export type FrequentProduct = {
  id: string;
  inputKind: ProductInputKind;
  sourceValue: string;
  name: string;
  normalizedName: string;
  summary: string;
  listings: ProductListing[];
  sameProducts: ProductRecommendation[];
  similarProducts: ProductRecommendation[];
  createdAt: string;
  updatedAt: string;
};

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
  linkType: string;
  relationKind: "SAME_PRODUCT" | "RECOMMENDED_PRODUCT" | string;
  searchKeyword: string | null;
  sourceUrl: string;
  name: string;
  imageUrl: string | null;
  price: number | null;
  listingOrder: number | null;
  isAd: boolean;
  offers: ProductLinkOfferView[];
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
  createdAt: string;
  updatedAt: string;
};

export type AnalyzeProductInput = {
  value: string;
};

export function detectProductInputKind(value: string): ProductInputKind {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? "url" : "name";
  } catch {
    return "name";
  }
}

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

export function formatKRW(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}
