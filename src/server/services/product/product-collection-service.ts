import { Prisma } from "@/generated/prisma/client";
import {
  DEFAULT_PRODUCT_NEGATIVE_KEYWORDS,
  normalizeComparableText as normalizeText,
} from "@/lib/product-rules";
import { prisma } from "@/server/db/prisma";
import {
  filterProductRecommendationCandidates,
  filterSameProductCandidates,
} from "@/server/services/ai/openai-client";
import {
  DANAWA_LINK_TYPE,
  DANAWA_MARKET_NAME,
  DANAWA_SEARCH_PARSER_VERSION,
  type DanawaSearchProduct,
  fetchDanawaSrp,
} from "@/server/services/scrape/danawa-srp-collector";
import {
  DANAWA_CATALOG_PARSER_VERSION,
  type DanawaCatalogOffer,
  fetchDanawaCatalog,
} from "@/server/services/scrape/danawa-catalog-collector";

const SAME_PRODUCT_KIND = "SAME_PRODUCT";
const RECOMMENDED_PRODUCT_KIND = "RECOMMENDED_PRODUCT";
const DEFAULT_BATCH_LIMIT = 3;
const DEFAULT_TIME_BUDGET_MS = 4 * 60 * 1000;
const MAX_CATALOG_LINKS_PER_MASTER = 3;

type CollectionOptions = {
  limit?: number;
  timeBudgetMs?: number;
};

type CollectionResult = {
  ok: true;
  processedMasterIds: number[];
  skippedMasterIds: number[];
  createdOrUpdatedLinks: number;
  createdOrUpdatedOffers: number;
  startedAt: string;
  finishedAt: string;
};

type ProductMasterForCollection = {
  id: number;
  displayName: string;
  brand: string | null;
  sameKeywords: unknown;
  relatedKeywords: unknown;
  raw: unknown;
};

// 가격비교용 동일 상품 링크가 아직 없는 마스터를 짧은 배치로 수집한다.
export async function collectMissingPriceComparisons(
  options: CollectionOptions = {},
): Promise<CollectionResult> {
  const startedAt = new Date();
  const limit = normalizeLimit(options.limit);
  const deadline = startedAt.getTime() + normalizeTimeBudgetMs(options.timeBudgetMs);
  const candidates = await listActiveMastersForCollection(limit * 4);
  const processedMasterIds: number[] = [];
  const skippedMasterIds: number[] = [];
  let createdOrUpdatedLinks = 0;
  let createdOrUpdatedOffers = 0;

  for (const master of candidates) {
    if (processedMasterIds.length >= limit || Date.now() >= deadline) break;

    const needsCollection = await needsPriceComparisonCollection(master.id);
    if (!needsCollection) {
      skippedMasterIds.push(master.id);
      continue;
    }

    const keyword = readStringArray(master.sameKeywords)[0] || master.displayName;
    const links = await collectDanawaSrpLinks({
      master,
      query: keyword,
      relationKind: SAME_PRODUCT_KIND,
    });
    createdOrUpdatedLinks += links.length;

    const catalogLinks = links
      .filter((link) => link.isCatalog || link.linkType === DANAWA_LINK_TYPE.AD_CATALOG)
      .slice(0, MAX_CATALOG_LINKS_PER_MASTER);

    for (const link of catalogLinks) {
      const offers = await collectDanawaCatalogOffers(link.id, link.sourceUrl);
      createdOrUpdatedOffers += offers.length;
    }

    processedMasterIds.push(master.id);
  }

  return {
    ok: true,
    processedMasterIds,
    skippedMasterIds,
    createdOrUpdatedLinks,
    createdOrUpdatedOffers,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

// 유사 상품 후보 수집은 가격비교와 분리해서 별도 크론에서 짧은 배치로 실행한다.
export async function collectMissingRelatedProducts(
  options: CollectionOptions = {},
): Promise<CollectionResult> {
  const startedAt = new Date();
  const limit = normalizeLimit(options.limit);
  const deadline = startedAt.getTime() + normalizeTimeBudgetMs(options.timeBudgetMs);
  const candidates = await listActiveMastersForCollection(limit * 4);
  const processedMasterIds: number[] = [];
  const skippedMasterIds: number[] = [];
  let createdOrUpdatedLinks = 0;

  for (const master of candidates) {
    if (processedMasterIds.length >= limit || Date.now() >= deadline) break;

    const needsCollection = await needsRelatedProductCollection(master.id);
    if (!needsCollection) {
      skippedMasterIds.push(master.id);
      continue;
    }

    const keyword = readStringArray(master.relatedKeywords)[0];
    if (!keyword) {
      skippedMasterIds.push(master.id);
      continue;
    }

    const links = await collectDanawaSrpLinks({
      master,
      query: keyword,
      relationKind: RECOMMENDED_PRODUCT_KIND,
    });
    createdOrUpdatedLinks += links.length;
    processedMasterIds.push(master.id);
  }

  return {
    ok: true,
    processedMasterIds,
    skippedMasterIds,
    createdOrUpdatedLinks,
    createdOrUpdatedOffers: 0,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

async function collectDanawaSrpLinks({
  master,
  query,
  relationKind,
}: {
  master: ProductMasterForCollection;
  query: string;
  relationKind: string;
}) {
  const target = await buildRecommendationTarget(master);
  const result = await fetchDanawaSrp({ query });
  const uniqueProducts = uniqueByLinkIdentity(result.products);
  const { products: filteredProducts, filterMeta } = await filterProductsForRelation(
    uniqueProducts,
    relationKind,
    master,
    target,
    query,
  );
  const products = sortProductsForRelation(filteredProducts, relationKind, target);
  const startedAt = new Date();

  if (relationKind === SAME_PRODUCT_KIND || relationKind === RECOMMENDED_PRODUCT_KIND) {
    await prisma.productLink.deleteMany({
      where: {
        masterId: master.id,
        relationKind,
        searchKeyword: query,
      },
    });
  }

  await prisma.scrapeLog.create({
    data: {
      marketName: DANAWA_MARKET_NAME,
      inputUrl: result.sourceUrl,
      finalUrl: result.finalUrl,
      pageKind: "SRP",
      source: "HTML",
      status: "SUCCESS",
      statusCode: result.status,
      contentType: result.contentType,
      request: { masterId: master.id, query, relationKind },
      responseMeta: {
        productCount: result.products.length,
        preFilterUniqueLinkCount: uniqueProducts.length,
        uniqueLinkCount: products.length,
        adProductCount: result.products.filter((product) => product.isAd).length,
        candidateTarget: target,
        candidateFilter: filterMeta,
      },
      html: result.html,
      parserVersion: DANAWA_SEARCH_PARSER_VERSION,
      startedAt,
      finishedAt: new Date(),
    },
  });

  const links = [];
  for (const product of products) {
    links.push(await upsertProductLink(master.id, query, relationKind, product));
  }

  return links;
}

// 다나와 카탈로그 링크가 있을 때 하위 판매처 가격을 가져와 가격표 후보로 저장한다.
async function collectDanawaCatalogOffers(parentLinkId: number, catalogUrl: string) {
  const result = await fetchDanawaCatalog({ catalogUrl });
  const startedAt = new Date();

  await prisma.scrapeLog.create({
    data: {
      marketName: DANAWA_MARKET_NAME,
      inputUrl: result.sourceUrl,
      finalUrl: result.finalUrl,
      pageKind: "PDP",
      source: "HTML",
      status: "SUCCESS",
      statusCode: result.status,
      contentType: result.contentType,
      request: { parentLinkId, catalogUrl },
      responseMeta: {
        catalogProductNo: result.catalogProductNo,
        catalogName: result.catalogName,
        offerCount: result.offers.length,
      },
      html: result.html,
      parserVersion: DANAWA_CATALOG_PARSER_VERSION,
      startedAt,
      finishedAt: new Date(),
    },
  });

  const parentLink = await prisma.productLink.findUnique({ where: { id: parentLinkId } });
  if (!parentLink) {
    throw new Error(`ProductLink not found: ${parentLinkId}`);
  }

  const offers = [];
  for (const offer of result.offers) {
    offers.push(await upsertProductLinkOffer(parentLink, offer));
  }

  return offers;
}

// 다나와 SRP에서 얻은 동일/추천 후보를 마스터 기준 링크로 저장하거나 갱신한다.
async function upsertProductLink(
  masterId: number,
  searchKeyword: string,
  relationKind: string,
  product: DanawaSearchProduct & {
    recommendationScore?: number;
    recommendationTier?: string;
    recommendationReasons?: string[];
    recommendationFilterConfidence?: number;
  },
) {
  const data = {
    masterId,
    productId: null,
    marketName: DANAWA_MARKET_NAME,
    marketProductNo: product.marketProductNo,
    marketItemNo: product.marketItemNo,
    mallCode: product.mallCode,
    mallName: product.mallName,
    linkType: product.linkType,
    relationKind,
    searchKeyword,
    sourceUrl: product.sourceUrl,
    name: product.name,
    imageUrl: product.imageUrl || null,
    price: product.price || null,
    isCatalog: product.isCatalog,
    categoryName: product.categoryName,
    mallCount: product.mallCount || null,
    reviewCount: product.reviewCount || null,
    rating: product.rating,
    summary: product.summary,
    listingOrder: product.listingOrder,
    isAd: product.isAd,
    raw: {
      categoryName: product.categoryName,
      mallCode: product.mallCode,
      mallName: product.mallName,
      mallCount: product.mallCount,
      reviewCount: product.reviewCount,
      rating: product.rating,
      summary: product.summary,
      isCatalog: product.isCatalog,
      recommendationScore: product.recommendationScore,
      recommendationTier: product.recommendationTier,
      recommendationReasons: product.recommendationReasons,
      recommendationFilterConfidence: product.recommendationFilterConfidence,
    } as Prisma.InputJsonValue,
  };
  const existing = await prisma.productLink.findFirst({
    where: {
      masterId,
      marketName: DANAWA_MARKET_NAME,
      marketProductNo: product.marketProductNo,
      marketItemNo: product.marketItemNo,
    },
  });

  if (existing) {
    return prisma.productLink.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.productLink.create({ data });
}

// 카탈로그 하위 판매처는 상위 ProductLink에 매달린 offer로 저장한다.
async function upsertProductLinkOffer(
  parentLink: { id: number; masterId: number },
  offer: DanawaCatalogOffer,
) {
  const data = {
    masterId: parentLink.masterId,
    parentLinkId: parentLink.id,
    productId: null,
    marketName: offer.marketName,
    marketProductNo: offer.marketProductNo,
    marketItemNo: offer.marketItemNo,
    mallName: offer.mallName,
    sellerName: offer.sellerName,
    sourceUrl: offer.sourceUrl,
    name: offer.name,
    imageUrl: offer.imageUrl,
    price: offer.price,
    shippingFee: offer.shippingFee,
    finalPrice: offer.finalPrice,
    deliveryText: offer.deliveryText,
    availability: offer.availability,
    listingOrder: offer.listingOrder,
    isAd: offer.isAd,
    raw: offer.raw as Prisma.InputJsonValue,
  };
  const existing = await prisma.productLinkOffer.findFirst({
    where: {
      parentLinkId: parentLink.id,
      marketName: offer.marketName,
      marketProductNo: offer.marketProductNo,
      marketItemNo: offer.marketItemNo,
    },
  });

  if (existing) {
    return prisma.productLinkOffer.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.productLinkOffer.create({ data });
}

// 사용자가 실제로 저장한 상품만 크론 수집 대상으로 삼아 불필요한 외부 호출을 줄인다.
async function listActiveMastersForCollection(take: number): Promise<ProductMasterForCollection[]> {
  return prisma.productMaster.findMany({
    where: {
      userProducts: {
        some: { status: "ACTIVE" },
      },
    },
    select: {
      id: true,
      displayName: true,
      brand: true,
      sameKeywords: true,
      relatedKeywords: true,
      raw: true,
    },
    orderBy: { updatedAt: "desc" },
    take,
  });
}

// 가격비교 표는 direct link도 표시하므로 동일 상품 링크가 하나라도 있으면 수집 완료로 본다.
async function needsPriceComparisonCollection(masterId: number) {
  const sameLink = await prisma.productLink.findFirst({
    where: { masterId, relationKind: SAME_PRODUCT_KIND },
    select: { id: true },
  });

  return !sameLink;
}

// 인기/추천 상품 후보는 아직 추천 링크가 없을 때만 한 번 수집한다.
async function needsRelatedProductCollection(masterId: number) {
  const link = await prisma.productLink.findFirst({
    where: { masterId, relationKind: RECOMMENDED_PRODUCT_KIND },
    select: { id: true },
  });

  return !link;
}

// 추천 점수화에 필요한 브랜드, 대표 카테고리, 입수 정보를 마스터와 기존 동일 상품에서 추론한다.
async function buildRecommendationTarget(master: ProductMasterForCollection) {
  const rows = await prisma.productLink.groupBy({
    by: ["categoryName"],
    where: {
      masterId: master.id,
      relationKind: SAME_PRODUCT_KIND,
      categoryName: { notIn: ["_", ""] },
    },
    _count: { categoryName: true },
    orderBy: { _count: { categoryName: "desc" } },
    take: 1,
  });

  return {
    brand: master.brand || inferBrand(master.displayName),
    categoryName: rows[0]?.categoryName || null,
    unitCount: readUnitCount(master.displayName),
  };
}

// 동일 상품과 추천 상품의 목적에 맞게 다나와 후보를 OpenAI와 제외 키워드로 걸러낸다.
async function filterProductsForRelation(
  products: DanawaSearchProduct[],
  relationKind: string,
  master: ProductMasterForCollection,
  target: Awaited<ReturnType<typeof buildRecommendationTarget>>,
  searchKeyword: string,
) {
  const shouldFilter =
    relationKind === SAME_PRODUCT_KIND || relationKind === RECOMMENDED_PRODUCT_KIND;

  if (!shouldFilter || products.length === 0) {
    return { products, filterMeta: undefined };
  }

  const negativeKeywords = readNegativeKeywords(master.raw);
  const keywordFilteredProducts = products.filter(
    (product) => !hasNegativeKeyword(product.name, negativeKeywords),
  );
  const filterInput = {
    sourceProductName: master.displayName,
    sourceBrand: target.brand,
    targetCategoryName: target.categoryName,
    targetUnitCount: target.unitCount,
    searchKeyword,
    candidates: keywordFilteredProducts.map((product) => ({
      candidateKey: readProductCandidateKey(product),
      name: product.name,
      categoryName: product.categoryName,
      summary: product.summary,
      price: product.price,
      reviewCount: product.reviewCount,
      rating: product.rating,
    })),
  };
  const filter =
    relationKind === SAME_PRODUCT_KIND
      ? await filterSameProductCandidates(filterInput)
      : await filterProductRecommendationCandidates(filterInput);
  const rejectedKeys = new Set(
    filter.rejectedCandidates.map((candidate) => candidate.candidateKey),
  );
  const acceptedKeys = new Set(
    filter.acceptedCandidateKeys.filter((key) => !rejectedKeys.has(key)),
  );

  return {
    products: keywordFilteredProducts
      .filter((product) => acceptedKeys.has(readProductCandidateKey(product)))
      .map((product) => ({
        ...product,
        recommendationFilterConfidence: filter.confidence,
      })),
    filterMeta: {
      confidence: filter.confidence,
      acceptedCount: filter.acceptedCandidateKeys.length,
      rejectedCount:
        filter.rejectedCandidates.length + products.length - keywordFilteredProducts.length,
      keywordRejectedCount: products.length - keywordFilteredProducts.length,
      rejectedCandidates: filter.rejectedCandidates.slice(0, 20),
    },
  };
}

// 추천 상품은 카테고리/입수/브랜드/리뷰/가격 기준으로 화면에 좋은 순서가 되게 정렬한다.
function sortProductsForRelation(
  products: Array<DanawaSearchProduct & { recommendationFilterConfidence?: number }>,
  relationKind: string,
  target: Awaited<ReturnType<typeof buildRecommendationTarget>>,
) {
  if (relationKind !== RECOMMENDED_PRODUCT_KIND) {
    return products;
  }

  return products
    .map((product) => ({ ...product, ...scoreRecommendedProduct(product, target) }))
    .sort((a, b) => {
      return (
        readTierRank(b.recommendationTier) - readTierRank(a.recommendationTier) ||
        b.recommendationScore - a.recommendationScore ||
        (b.reviewCount || 0) - (a.reviewCount || 0) ||
        (a.price || Number.MAX_SAFE_INTEGER) - (b.price || Number.MAX_SAFE_INTEGER)
      );
    })
    .map((product, index) => ({ ...product, listingOrder: index + 1 }));
}

// 추천 후보 하나를 동일 카테고리, 동일 입수, 다른 브랜드 여부 중심으로 점수화한다.
function scoreRecommendedProduct(
  product: DanawaSearchProduct,
  target: { brand: string | null; categoryName: string | null; unitCount: number | null },
) {
  const sameCategory = Boolean(
    target.categoryName &&
    product.categoryName &&
    product.categoryName !== "_" &&
    product.categoryName === target.categoryName,
  );
  const sameUnit = Boolean(target.unitCount && readUnitCount(product.name) === target.unitCount);
  const sameBrand = hasSameBrand(product.name, target.brand);
  const reasons = [];
  let score = 0;

  if (sameCategory) {
    score += 35;
    reasons.push("동일 카테고리");
  }

  if (sameUnit) {
    score += 25;
    reasons.push(`동일 입수 ${target.unitCount}개`);
  }

  if (!sameBrand) {
    score += 20;
    reasons.push("다른 브랜드");
  } else {
    score -= 25;
  }

  if (product.rating) {
    score += Math.min(10, product.rating * 2);
    reasons.push(`평점 ${product.rating.toFixed(1)}`);
  }

  if (product.reviewCount) {
    score += Math.min(10, Math.log10(product.reviewCount + 1) * 4);
    reasons.push(`리뷰 ${product.reviewCount.toLocaleString("ko-KR")}개`);
  }

  if (product.mallCount) {
    score += Math.min(5, Math.log10(product.mallCount + 1) * 3);
  }

  if (product.price > 0) {
    score += Math.max(0, 5 - Math.min(5, product.price / 30000));
  }

  return {
    recommendationScore: Math.max(0, Math.round(score)),
    recommendationTier: readRecommendationTier({ sameCategory, sameUnit, sameBrand }),
    recommendationReasons: reasons,
  };
}

// 다나와 검색 결과에서 같은 상품/판매처 조합이 중복으로 들어오는 것을 방지한다.
function uniqueByLinkIdentity(products: DanawaSearchProduct[]) {
  const seen = new Set<string>();
  return products.filter((product) => {
    const key = readProductCandidateKey(product);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 상품 번호와 판매처/아이템 번호 조합을 후보 고유 키로 사용한다.
function readProductCandidateKey(product: DanawaSearchProduct) {
  return `${product.marketProductNo}:${product.marketItemNo || ""}`;
}

// 우선 추천/보충 추천/낮은 신뢰도를 정렬 가능한 단계값으로 나눈다.
function readRecommendationTier({
  sameCategory,
  sameUnit,
  sameBrand,
}: {
  sameCategory: boolean;
  sameUnit: boolean;
  sameBrand: boolean;
}) {
  if (sameCategory && sameUnit && !sameBrand) return "PRIMARY";
  if (sameCategory && sameUnit) return "FALLBACK";
  return "LOW_CONFIDENCE";
}

// 추천 tier를 정렬 점수로 변환한다.
function readTierRank(tier: string) {
  if (tier === "PRIMARY") return 3;
  if (tier === "FALLBACK") return 2;
  return 1;
}

// 브랜드 한글명과 일부 영문 alias를 함께 비교해 동일 브랜드 여부를 판단한다.
function hasSameBrand(value: string, brand: string | null) {
  if (!brand) return false;
  const normalized = normalizeText(value);
  const brandWords = [brand, ...readBrandAliases(brand)].map(normalizeText);
  return brandWords.some((word) => word && normalized.includes(word));
}

// 국내/해외 표기가 섞이는 브랜드만 최소 alias를 관리한다.
function readBrandAliases(brand: string) {
  if (brand === "프로쉬") return ["frosch", "werner", "werner&mertz", "erdal"];
  return [];
}

// 대괄호 브랜드 표기가 없으면 상품명의 첫 단어를 보수적으로 브랜드 후보로 본다.
function inferBrand(value: string) {
  return value.match(/^\[([^\]]+)\]/)?.[1]?.trim() || value?.trim().split(/\s+/)[0] || null;
}

// 상품명에서 50개입, 100매, 30롤 같은 수량 단서를 추출한다.
function readUnitCount(value: string) {
  const match = value?.match(/(\d+)\s*(?:개입|개|입|매|팩|롤)/);
  return match?.[1] ? Number(match[1]) : null;
}

// Prisma Json, Postgres raw JSON, 문자열 JSON을 모두 string 배열로 흡수한다.
function readStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return readStringArray(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

// OpenAI가 준 제외어와 서비스 기본 제외어를 합쳐 검색 후보 제거 기준을 만든다.
function readNegativeKeywords(raw: unknown) {
  const rawObject = parseJsonObject(raw);
  return Array.from(
    new Set([...DEFAULT_PRODUCT_NEGATIVE_KEYWORDS, ...readStringArray(rawObject.negativeKeywords)]),
  );
}

// Json 컬럼이 문자열로 들어오는 경우까지 흡수해 객체로 안전하게 변환한다.
function parseJsonObject(value: unknown) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parseJsonObject(parsed);
    } catch {
      return {};
    }
  }

  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// 공백/대소문자를 무시한 부분 포함 기준으로 제외 키워드를 판정한다.
function hasNegativeKeyword(value: string, negativeKeywords: string[]) {
  const normalized = normalizeText(value);
  return negativeKeywords.some((keyword) => {
    const normalizedKeyword = normalizeText(keyword);
    return Boolean(normalizedKeyword && normalized.includes(normalizedKeyword));
  });
}

// 크론 한 번에 처리할 마스터 수를 과도하지 않게 제한한다.
function normalizeLimit(value: number | undefined) {
  if (!Number.isFinite(value) || !value) return DEFAULT_BATCH_LIMIT;
  return Math.min(10, Math.max(1, Math.floor(value)));
}

// Vercel 함수 시간 안에서 끝나도록 크론 실행 예산을 제한한다.
function normalizeTimeBudgetMs(value: number | undefined) {
  if (!Number.isFinite(value) || !value) return DEFAULT_TIME_BUDGET_MS;
  return Math.min(5 * 60 * 1000, Math.max(30_000, Math.floor(value)));
}
