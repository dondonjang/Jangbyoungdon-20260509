import {
  detectProductInputKind,
  type FrequentProduct,
  type ProductListing,
} from "@/lib/product-types";
import { nowIsoTimestamp } from "@/lib/common";
import { generateMockProduct } from "@/lib/mock-products";
import { inMemoryFrequentProductsRepository } from "@/server/repositories/frequent-products-repository";
import { buildProductIntel } from "@/server/services/external";
import { scrapeProductPage } from "./scrape-page";

export async function listFrequentProducts() {
  return inMemoryFrequentProductsRepository.list();
}

export async function analyzeAndSaveFrequentProduct(value: string): Promise<FrequentProduct> {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("상품명 또는 상품 링크를 입력해주세요.");
  }

  const inputKind = detectProductInputKind(trimmed);
  const scraped = inputKind === "url" ? await scrapeProductPage(trimmed) : undefined;
  const intel = await buildProductIntel({
    sourceValue: trimmed,
    scrapedTitle: scraped?.title,
    scrapedDescription: scraped?.description,
    textSample: scraped?.textSample,
  });
  const fallback = generateMockProduct(intel.name);
  const now = nowIsoTimestamp();
  const listings: ProductListing[] = fallback.listings.map((listing) => ({
    ...listing,
    title: intel.name,
    url: inputKind === "url" ? trimmed : listing.url,
  }));

  return inMemoryFrequentProductsRepository.save({
    id: fallback.id,
    inputKind,
    sourceValue: trimmed,
    name: intel.name,
    normalizedName: intel.normalizedName,
    summary: intel.summary,
    listings,
    sameProducts: intel.sameProducts.length > 0 ? intel.sameProducts : fallback.sameProducts,
    similarProducts:
      intel.similarProducts.length > 0 ? intel.similarProducts : fallback.similarProducts,
    createdAt: now,
    updatedAt: now,
  });
}

export async function removeFrequentProduct(id: string) {
  await inMemoryFrequentProductsRepository.remove(id);
}
