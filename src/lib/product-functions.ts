import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isSupportedProductDetailUrl } from "@/lib/product-types";

const analyzeProductInput = z.object({
  value: z.string().min(1),
});

const listSavedProductsInput = z.object({
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(50).optional(),
});

const savedProductActionInput = z.object({
  masterId: z.number().int().positive(),
});

export const listSavedProductViewsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { listSavedProductViews } = await import("@/server/services/product/saved-product-view");
  return listSavedProductViews();
});

export const listSavedProductViewPageFn = createServerFn({ method: "GET" })
  .inputValidator(listSavedProductsInput)
  .handler(async ({ data }) => {
    const { listSavedProductViewPage } =
      await import("@/server/services/product/saved-product-view");
    return listSavedProductViewPage(data);
  });

export const analyzeChatProductFn = createServerFn({ method: "POST" })
  .inputValidator(
    analyzeProductInput.refine((data) => isSupportedProductDetailUrl(data.value), {
      message: "현재는 마켓컬리 상품 상세 링크만 지원합니다.",
    }),
  )
  .handler(async ({ data }) => {
    const { analyzeProductFromChat } =
      await import("@/server/services/product/frontend-product-service");
    return analyzeProductFromChat(data.value);
  });

export const softDeleteSavedProductFn = createServerFn({ method: "POST" })
  .inputValidator(savedProductActionInput)
  .handler(async ({ data }) => {
    const { softDeleteSavedProduct } =
      await import("@/server/services/product/frontend-product-service");
    return softDeleteSavedProduct(data.masterId);
  });
