import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isSupportedProductDetailUrl } from "@/lib/product-types";

const analyzeProductInput = z.object({
  value: z.string().min(1).refine(isSupportedProductDetailUrl, {
    message: "지원하는 상품 상세 링크를 입력해주세요.",
  }),
});

const removeProductInput = z.object({
  id: z.string().min(1),
});

export const listFrequentProductsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listFrequentProducts } = await import("@/server/services/product-analysis");
  return listFrequentProducts();
});

export const analyzeFrequentProductFn = createServerFn({ method: "POST" })
  .inputValidator(analyzeProductInput)
  .handler(async ({ data }) => {
    const { analyzeAndSaveFrequentProduct } = await import("@/server/services/product-analysis");
    return analyzeAndSaveFrequentProduct(data.value);
  });

export const removeFrequentProductFn = createServerFn({ method: "POST" })
  .inputValidator(removeProductInput)
  .handler(async ({ data }) => {
    const { removeFrequentProduct } = await import("@/server/services/product-analysis");
    await removeFrequentProduct(data.id);
    return { ok: true };
  });
