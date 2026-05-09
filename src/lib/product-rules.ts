const ACCESSORY_PRODUCT_PATTERN =
  /보관함|보관통|보관\s*통|케이스|거치대|홀더|디스펜서|리필용기|공병|정리함|수납함|파우치/;

export const DEFAULT_PRODUCT_NEGATIVE_KEYWORDS = ["중고", "리퍼", "해외직구"] as const;

// 추천/동일 상품 후보에서 본품이 아닌 보관 용품류를 제외하기 위한 공통 판별 규칙이다.
export function isAccessoryProductName(value: string) {
  return ACCESSORY_PRODUCT_PATTERN.test(value);
}

// 브랜드/상품명 비교처럼 공백과 대소문자 차이가 의미 없는 문자열 비교에 사용한다.
export function normalizeComparableText(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "");
}
