import { Prisma } from "@/generated/prisma/client";
import type { ChatProductAnalyzeResult } from "@/lib/product-types";
import { isSupportedProductDetailUrl } from "@/lib/product-types";
import { prisma } from "@/server/db/prisma";
import { recommendProductSearchKeywords } from "@/server/services/ai/openai-client";
import { fetchKurlyPdp } from "@/server/services/scrape/kurly-collector";
import { getDefaultUser } from "@/server/services/product/product-user";
import { getSavedProductView } from "@/server/services/product/saved-product-view";

type SavedProductIds = {
  masterId: number;
};

// 채팅 입력값을 저장 가능한 마스터 상품으로 만들고, 프론트가 바로 보여줄 뷰 모델을 반환한다.
export async function analyzeProductFromChat(value: string): Promise<ChatProductAnalyzeResult> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("상품 상세 페이지 링크를 입력해주세요.");
  }
  if (!isSupportedProductDetailUrl(trimmed)) {
    throw new Error("현재는 마켓컬리 상품 상세 링크만 지원합니다.");
  }

  const ids = await analyzeProductUrl(trimmed);
  const product = await getSavedProductView(ids.masterId);

  if (!product) {
    throw new Error("저장한 상품을 다시 조회하지 못했습니다.");
  }

  return {
    product,
    message: `${product.displayName} 상품을 자주 사는 상품에 저장했어요.`,
  };
}

// 사용자 저장 목록에서만 DELETED 상태로 내리고, 수집/분석 원본 데이터는 보존한다.
export async function softDeleteSavedProduct(masterId: number) {
  const user = await getDefaultUser();
  const result = await prisma.userProduct.updateMany({
    where: {
      userId: user.id,
      masterId,
      status: "ACTIVE",
    },
    data: {
      status: "DELETED",
      updatedAt: new Date(),
    },
  });

  return {
    ok: true,
    deletedCount: result.count,
  };
}

async function analyzeProductUrl(value: string): Promise<SavedProductIds> {
  if (!isSupportedProductDetailUrl(value)) {
    throw new Error("현재는 마켓컬리 상품 상세 링크만 지원합니다.");
  }

  const sourceUrl = normalizeUrlKey(value);
  const marketProductNo = readKurlyProductNo(sourceUrl);
  const detail = await fetchKurlyPdp(sourceUrl, {
    marketProductNo,
    name: "마켓컬리 상품",
  });
  const keywordRecommendation = await recommendProductSearchKeywords({
    productName: detail.product.name,
    summary: detail.product.summary || undefined,
    marketName: "kurly",
  });
  const normalizedName = normalizeName(keywordRecommendation.refinedProductName);
  const master = await prisma.productMaster.upsert({
    where: { matchKey: `kurly:${marketProductNo}` },
    create: {
      normalizedName,
      displayName: detail.product.name,
      refinedName: keywordRecommendation.refinedProductName,
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

function readKurlyProductNo(value: string) {
  const url = new URL(value);
  const match = url.pathname.match(/^\/goods\/([^/?#]+)\/?$/);

  if (!match?.[1]) {
    throw new Error("마켓컬리 상품 번호를 찾지 못했습니다.");
  }

  return match[1];
}
