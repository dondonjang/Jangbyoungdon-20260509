export {
  buildProductIntel,
  estimateOpenAIModelCost,
  OPENAI_COST_ESTIMATE_META,
  OPENAI_MODEL_COSTS,
  recommendProductSearchKeywords,
} from "@/server/services/external/openai";
export type {
  ProductIntel,
  ProductSearchKeywordInput,
  ProductSearchKeywordRecommendation,
} from "@/server/services/external/openai";
