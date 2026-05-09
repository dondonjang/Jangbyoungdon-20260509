import { prisma } from "../src/server/db/prisma.ts";
import { recommendProductSearchKeywords } from "../src/server/services/ai/openai-client.ts";
import { getDefaultUser } from "../src/server/services/product/product-user.ts";

const DEFAULT_PRODUCT_NOS = ["1001533332", "5132839"];

const productNos = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_PRODUCT_NOS;

try {
  const user = await getDefaultUser();
  const products = await prisma.product.findMany({
    where: {
      marketName: "kurly",
      marketProductNo: { in: productNos },
    },
    orderBy: [{ listingOrder: "asc" }, { id: "asc" }],
  });

  if (products.length === 0) {
    throw new Error("Seed 할 마켓컬리 PLP 상품을 찾지 못했습니다.");
  }

  const seeded = [];

  for (const product of products) {
    const brand = inferBracketBrand(product.name);
    const recommendation = await recommendProductSearchKeywords({
      productName: product.name,
      summary: product.summary || undefined,
      brand: brand || undefined,
      marketName: product.marketName,
    });
    const normalizedName = normalizeName(recommendation.refinedProductName);
    const master = await prisma.productMaster.upsert({
      where: { matchKey: `kurly:${product.marketProductNo}` },
      create: {
        normalizedName,
        displayName: product.name,
        refinedName: recommendation.refinedProductName,
        brand,
        summary: product.summary,
        matchKey: `kurly:${product.marketProductNo}`,
        analysisStatus: "ANALYZED",
        sameKeywords: recommendation.sameProductKeywords,
        relatedKeywords: recommendation.relatedProductKeywords,
        raw: {
          source: "kurly_plp_answer_seed",
          productId: product.id,
          marketName: product.marketName,
          marketProductNo: product.marketProductNo,
          relatedCoreAttributes: recommendation.relatedCoreAttributes,
          negativeKeywords: recommendation.negativeKeywords,
          keywordConfidence: recommendation.confidence,
        },
      },
      update: {
        normalizedName,
        displayName: product.name,
        refinedName: recommendation.refinedProductName,
        brand,
        summary: product.summary,
        analysisStatus: "ANALYZED",
        sameKeywords: recommendation.sameProductKeywords,
        relatedKeywords: recommendation.relatedProductKeywords,
        raw: {
          source: "kurly_plp_answer_seed",
          productId: product.id,
          marketName: product.marketName,
          marketProductNo: product.marketProductNo,
          relatedCoreAttributes: recommendation.relatedCoreAttributes,
          negativeKeywords: recommendation.negativeKeywords,
          keywordConfidence: recommendation.confidence,
        },
      },
    });

    await prisma.product.update({
      where: { id: product.id },
      data: { masterId: master.id },
    });

    await prisma.productInputLink.upsert({
      where: { inputUrlKey: product.sourceUrl },
      create: {
        masterId: master.id,
        productId: product.id,
        inputUrl: product.sourceUrl,
        inputUrlKey: product.sourceUrl,
        status: "ANALYZED",
        raw: { source: "kurly_plp_answer_seed" },
      },
      update: {
        masterId: master.id,
        productId: product.id,
        status: "ANALYZED",
        errorMessage: null,
        raw: { source: "kurly_plp_answer_seed" },
      },
    });

    await prisma.productAnalysis.create({
      data: {
        masterId: master.id,
        sourceValue: product.sourceUrl,
        inputKind: "URL",
        summary: product.summary || `${product.name} 상품을 분석했습니다.`,
        rawInput: {
          source: "kurly_plp_answer_seed",
          productName: product.name,
          summary: product.summary,
        },
        rawOutput: recommendation,
      },
    });

    await upsertActiveUserProduct({
      userId: user.id,
      masterId: master.id,
      sourceValue: product.sourceUrl,
      displayName: product.name,
    });

    seeded.push({
      masterId: master.id,
      productId: product.id,
      marketProductNo: product.marketProductNo,
      displayName: product.name,
      brand,
      sameKeyword: recommendation.sameProductKeywords[0],
      relatedKeyword: recommendation.relatedProductKeywords[0],
      confidence: recommendation.confidence,
    });
  }

  console.log(JSON.stringify({ seeded }, null, 2));
} finally {
  await prisma.$disconnect();
}

async function upsertActiveUserProduct({ userId, masterId, sourceValue, displayName }) {
  const active = await prisma.userProduct.findFirst({
    where: { userId, masterId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
  });

  if (active) {
    await prisma.userProduct.update({
      where: { id: active.id },
      data: {
        inputKind: "URL",
        sourceValue,
        displayName,
        updatedAt: new Date(),
      },
    });
    return;
  }

  await prisma.userProduct.create({
    data: {
      userId,
      masterId,
      inputKind: "URL",
      sourceValue,
      displayName,
      status: "ACTIVE",
    },
  });
}

function inferBracketBrand(value) {
  const match = value.match(/^\[([^\]]+)\]/);
  return match?.[1]?.trim() || null;
}

function normalizeName(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}
