import type { FrequentProduct, ProductListing, ProductRecommendation } from "./product-types";
import { nowIsoTimestamp } from "./common";
import { detectProductInputKind, formatKRW } from "./product-types";

const SHOPS = ["쿠팡", "네이버쇼핑", "11번가", "G마켓", "옥션"];

function rand(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function generateMockProduct(value: string): FrequentProduct {
  const inputKind = detectProductInputKind(value);
  const displayName = inputKind === "url" ? "링크로 추가한 상품" : value;
  const seed = hashStr(value);
  const base = 8000 + Math.floor(rand(seed) * 30000);
  const listings: ProductListing[] = SHOPS.map((shop, i) => {
    const variance = Math.floor((rand(seed + i + 1) - 0.5) * 6000);
    const price = Math.max(3000, base + variance);
    const shipping = rand(seed + i + 100) > 0.5 ? 0 : 2500 + Math.floor(rand(seed + i) * 1000);
    return { shop, title: displayName, price, shipping, url: inputKind === "url" ? value : "#" };
  });

  const sameNames = [`${displayName} 동일 구성`, `${displayName} 정품`, `${displayName} 리필/번들`];
  const similarNames = [
    `${displayName} 프리미엄`,
    `${displayName} 오리지널`,
    `${displayName} 라이트`,
  ];
  const reviews = [
    "구매자들이 가성비가 정말 좋다고 입을 모아요. 재구매 의사가 높은 인기 상품이에요.",
    "품질이 우수하고 포장도 깔끔하다는 후기가 많아요. 선물용으로도 추천돼요.",
    "배송이 빠르고 사용감이 부드럽다는 평이 많아요. 처음 사용하는 분께 추천해요.",
  ];
  const makeRecommendation = (n: string, i: number, reason: string): ProductRecommendation => ({
    name: n,
    price: Math.max(3000, base + Math.floor((rand(seed + i + 50) - 0.3) * 8000)),
    rating: Math.round((4.2 + rand(seed + i + 77) * 0.7) * 10) / 10,
    review: reviews[i % reviews.length],
    reason,
  });
  const sameProducts = sameNames.map((n, i) =>
    makeRecommendation(n, i, "상품명과 구성 키워드가 가장 가까운 동일 상품 후보예요."),
  );
  const similarProducts = similarNames.map((n, i) =>
    makeRecommendation(n, i + 10, "가격대와 사용 목적이 비슷한 대체 상품이에요."),
  );
  const now = nowIsoTimestamp();

  return {
    id: `${seed}-${Date.now()}`,
    inputKind,
    sourceValue: value,
    name: displayName,
    normalizedName: displayName.trim().toLowerCase(),
    summary: "현재는 백엔드 파이프라인 뼈대에서 생성한 임시 분석 결과입니다.",
    listings,
    sameProducts,
    similarProducts,
    createdAt: now,
    updatedAt: now,
  };
}

export { formatKRW };
