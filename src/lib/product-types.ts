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
