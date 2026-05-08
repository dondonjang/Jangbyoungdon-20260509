import type { ProductRecommendation } from "@/lib/product-types";

type ProductIntelInput = {
  sourceValue: string;
  scrapedTitle?: string;
  scrapedDescription?: string;
  textSample?: string;
};

export type ProductIntel = {
  name: string;
  normalizedName: string;
  summary: string;
  sameProducts: ProductRecommendation[];
  similarProducts: ProductRecommendation[];
};

function fallbackIntel(input: ProductIntelInput): ProductIntel {
  const name = input.scrapedTitle || input.sourceValue;
  const base = Math.max(5000, name.length * 1200);

  return {
    name,
    normalizedName: name.trim().toLowerCase(),
    summary: input.scrapedDescription || "상품명/링크를 기반으로 자주 사는 상품 후보를 분석했어요.",
    sameProducts: [
      {
        name: `${name} 동일 상품`,
        price: base,
        rating: 4.7,
        review: "상품명과 핵심 구성이 가까운 후보예요.",
        reason: "동일 상품 비교를 위한 기본 후보입니다.",
      },
    ],
    similarProducts: [
      {
        name: `${name} 대체 추천`,
        price: Math.round(base * 0.9),
        rating: 4.5,
        review: "용도와 가격대가 비슷한 대체 상품 후보예요.",
        reason: "같은 구매 목적을 만족할 수 있는 유사 상품입니다.",
      },
    ],
  };
}

export async function buildProductIntel(input: ProductIntelInput): Promise<ProductIntel> {
  // Temporary mock provider until the OpenAI structured output schema is implemented.
  // Keep this server-only; this module is imported dynamically from createServerFn handlers.
  return fallbackIntel(input);
}
