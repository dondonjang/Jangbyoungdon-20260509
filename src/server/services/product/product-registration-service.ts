import { Prisma } from "@/generated/prisma/client";
import type { ChatProductAnalyzeResult } from "@/lib/product-types";
import { isSupportedProductDetailUrl } from "@/lib/product-types";
import { prisma } from "@/server/db/prisma";
import { recommendProductSearchKeywords } from "@/server/services/ai/openai-client";
import { getDefaultUser } from "@/server/services/product/product-user";
import { getSavedProductView } from "@/server/services/product/saved-product-view";
import { fetchKurlyPdp } from "@/server/services/scrape/kurly-collector";

type RegisteredProductIds = {
  masterId: number;
};

// 사용자 입력 링크를 기준 상품으로 등록하고, 이후 크론 수집이 이어갈 수 있는 마스터 데이터를 만든다.
export async function registerProductFromUserInput(
  value: string,
): Promise<ChatProductAnalyzeResult> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("상품 상세 페이지 링크를 입력해주세요.");
  }
  if (!isSupportedProductDetailUrl(trimmed)) {
    throw new Error("현재는 마켓컬리 상품 상세 링크만 지원합니다.");
  }

  const ids = await registerKurlyProductUrl(trimmed);
  const product = await getSavedProductView(ids.masterId);

  if (!product) {
    throw new Error("저장한 상품을 다시 조회하지 못했습니다.");
  }

  return {
    product,
    message: `${product.displayName} 상품을 자주 사는 상품에 저장했어요.`,
  };
}

async function registerKurlyProductUrl(value: string): Promise<RegisteredProductIds> {
  const sourceUrl = normalizeUrlKey(value);
  const marketProductNo = readKurlyProductNo(sourceUrl);
  const existing = await attachExistingAnalyzedKurlyProduct({
    inputUrl: value,
    sourceUrl,
    marketProductNo,
  });

  if (existing) {
    return existing;
  }

  const detail = await fetchKurlyPdp(sourceUrl, {
    marketProductNo,
    name: "마켓컬리 상품",
  });
  const brand = inferBracketBrand(detail.product.name);
  const keywordRecommendation = await recommendProductSearchKeywords({
    productName: detail.product.name,
    summary: detail.product.summary || undefined,
    brand: brand || undefined,
    marketName: "kurly",
  });
  const normalizedName = normalizeName(keywordRecommendation.refinedProductName);
  const master = await prisma.productMaster.upsert({
    where: { matchKey: `kurly:${marketProductNo}` },
    create: {
      normalizedName,
      displayName: detail.product.name,
      refinedName: keywordRecommendation.refinedProductName,
      brand,
      summary: detail.product.summary,
      matchKey: `kurly:${marketProductNo}`,
      analysisStatus: "ANALYZED",
      sameKeywords: keywordRecommendation.sameProductKeywords as Prisma.InputJsonValue,
      relatedKeywords: keywordRecommendation.relatedProductKeywords as Prisma.InputJsonValue,
      raw: {
        relatedCoreAttributes: keywordRecommendation.relatedCoreAttributes,
        negativeKeywords: keywordRecommendation.negativeKeywords,
        keywordConfidence: keywordRecommendation.confidence,
      } as Prisma.InputJsonValue,
    },
    update: {
      normalizedName,
      displayName: detail.product.name,
      refinedName: keywordRecommendation.refinedProductName,
      brand,
      summary: detail.product.summary,
      analysisStatus: "ANALYZED",
      sameKeywords: keywordRecommendation.sameProductKeywords as Prisma.InputJsonValue,
      relatedKeywords: keywordRecommendation.relatedProductKeywords as Prisma.InputJsonValue,
      raw: {
        relatedCoreAttributes: keywordRecommendation.relatedCoreAttributes,
        negativeKeywords: keywordRecommendation.negativeKeywords,
        keywordConfidence: keywordRecommendation.confidence,
      } as Prisma.InputJsonValue,
    },
  });
  const product = await prisma.product.upsert({
    where: {
      marketName_marketProductNo: {
        marketName: "kurly",
        marketProductNo,
      },
    },
    create: {
      masterId: master.id,
      marketName: "kurly",
      marketProductNo,
      marketItemNo: null,
      sourceUrl,
      name: detail.product.name,
      imageUrl: detail.product.imageUrl,
      price: detail.product.price,
      reviewCount: detail.product.reviewCount,
      rating: detail.product.rating,
      summary: detail.product.summary,
      description: detail.product.description,
      descriptionImages: detail.product.descriptionImages as Prisma.InputJsonValue,
      noticeItems: detail.product.noticeItems as Prisma.InputJsonValue,
      scrapeStatus: "DETAIL_COLLECTED",
    },
    update: {
      masterId: master.id,
      sourceUrl,
      name: detail.product.name,
      imageUrl: detail.product.imageUrl,
      price: detail.product.price,
      reviewCount: detail.product.reviewCount,
      rating: detail.product.rating,
      summary: detail.product.summary,
      description: detail.product.description,
      descriptionImages: detail.product.descriptionImages as Prisma.InputJsonValue,
      noticeItems: detail.product.noticeItems as Prisma.InputJsonValue,
      scrapeStatus: "DETAIL_COLLECTED",
    },
  });

  await prisma.productInputLink.upsert({
    where: { inputUrlKey: sourceUrl },
    create: {
      masterId: master.id,
      productId: product.id,
      inputUrl: value,
      inputUrlKey: sourceUrl,
      status: "ANALYZED",
      raw: { source: "chat" },
    },
    update: {
      masterId: master.id,
      productId: product.id,
      status: "ANALYZED",
      errorMessage: null,
    },
  });
  await prisma.productAnalysis.create({
    data: {
      masterId: master.id,
      sourceValue: value,
      inputKind: "URL",
      summary: detail.product.summary || `${detail.product.name} 상품을 분석했습니다.`,
      rawInput: {
        sourceUrl,
        productName: detail.product.name,
        summary: detail.product.summary,
      },
      rawOutput: keywordRecommendation as unknown as Prisma.InputJsonValue,
    },
  });
  await saveDefaultUserProduct({
    masterId: master.id,
    inputKind: "URL",
    sourceValue: value,
    displayName: detail.product.name,
  });

  return { masterId: master.id };
}

// 이미 분석이 끝난 상품은 외부 수집과 OpenAI 호출을 건너뛰고 사용자 상품만 빠르게 연결한다.
async function attachExistingAnalyzedKurlyProduct(input: {
  inputUrl: string;
  sourceUrl: string;
  marketProductNo: string;
}): Promise<RegisteredProductIds | null> {
  const master = await prisma.productMaster.findUnique({
    where: { matchKey: `kurly:${input.marketProductNo}` },
    select: {
      id: true,
      displayName: true,
      analysisStatus: true,
    },
  });

  if (!master || master.analysisStatus !== "ANALYZED") {
    return null;
  }

  const product = await prisma.product.findUnique({
    where: {
      marketName_marketProductNo: {
        marketName: "kurly",
        marketProductNo: input.marketProductNo,
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!product) {
    return null;
  }

  await prisma.productInputLink.upsert({
    where: { inputUrlKey: input.sourceUrl },
    create: {
      masterId: master.id,
      productId: product.id,
      inputUrl: input.inputUrl,
      inputUrlKey: input.sourceUrl,
      status: "ANALYZED",
      raw: { source: "chat_fast_attach" },
    },
    update: {
      masterId: master.id,
      productId: product.id,
      status: "ANALYZED",
      errorMessage: null,
      raw: { source: "chat_fast_attach" },
    },
  });
  await saveDefaultUserProduct({
    masterId: master.id,
    inputKind: "URL",
    sourceValue: input.inputUrl,
    displayName: product.name || master.displayName,
  });

  return { masterId: master.id };
}

// 삭제 후 재등록은 새 user_products row를 만들고, 이미 활성 상태면 최신 관심 상품으로 올린다.
async function saveDefaultUserProduct(input: {
  masterId: number;
  inputKind: "NAME" | "URL";
  sourceValue: string;
  displayName: string;
}) {
  const user = await getDefaultUser();
  const activeUserProduct = await prisma.userProduct.findFirst({
    where: {
      userId: user.id,
      masterId: input.masterId,
      status: "ACTIVE",
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!activeUserProduct) {
    await prisma.userProduct.create({
      data: {
        userId: user.id,
        masterId: input.masterId,
        inputKind: input.inputKind,
        sourceValue: input.sourceValue,
        displayName: input.displayName,
        status: "ACTIVE",
      },
    });
    return;
  }

  await prisma.userProduct.update({
    where: { id: activeUserProduct.id },
    data: {
      userId: user.id,
      masterId: input.masterId,
      inputKind: input.inputKind,
      sourceValue: input.sourceValue,
      displayName: input.displayName,
      status: "ACTIVE",
      updatedAt: new Date(),
    },
  });
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeUrlKey(value: string) {
  const url = new URL(value);
  url.hash = "";
  return url.toString();
}

function inferBracketBrand(value: string) {
  return value.match(/^\[([^\]]+)\]/)?.[1]?.trim() || null;
}

function readKurlyProductNo(value: string) {
  const url = new URL(value);
  const match = url.pathname.match(/^\/goods\/([^/?#]+)\/?$/);

  if (!match?.[1]) {
    throw new Error("마켓컬리 상품 번호를 찾지 못했습니다.");
  }

  return match[1];
}
