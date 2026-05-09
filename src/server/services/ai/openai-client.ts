import { createPromptHash, saveAiRequestLog } from "@/server/services/ai/ai-request-log";
import {
  DEFAULT_PRODUCT_NEGATIVE_KEYWORDS,
  isAccessoryProductName,
  normalizeComparableText as normalizeText,
} from "@/lib/product-rules";

const KRW_PER_USD = 1500;
const ESTIMATED_INPUT_TOKENS_PER_CALL = 2000;
const ESTIMATED_OUTPUT_TOKENS_PER_CALL = 1000;

export const OPENAI_MODEL_COSTS = [
  {
    model: "gpt-5.4-nano",
    inputUsdPerMillionTokens: 0.2,
    outputUsdPerMillionTokens: 1.25,
    useCase: "Default for product attributes, keyword extraction, and first-pass OCR.",
  },
  {
    model: "gpt-5.4-mini",
    inputUsdPerMillionTokens: 0.75,
    outputUsdPerMillionTokens: 4.5,
    useCase: "Upgrade path for OCR or ambiguous product matching when nano quality is low.",
  },
  {
    model: "gpt-5.4",
    inputUsdPerMillionTokens: 2.5,
    outputUsdPerMillionTokens: 15,
    useCase: "Use only for difficult product normalization or recommendation decisions.",
  },
  {
    model: "gpt-5.5",
    inputUsdPerMillionTokens: 5,
    outputUsdPerMillionTokens: 30,
    useCase: "Highest-cost comparison target; reserve for hard cases that need stronger judgment.",
  },
] as const;

export const OPENAI_COST_ESTIMATE_META = {
  checkedAt: "2026-05-09",
  krwPerUsd: KRW_PER_USD,
  inputTokensPerCall: ESTIMATED_INPUT_TOKENS_PER_CALL,
  outputTokensPerCall: ESTIMATED_OUTPUT_TOKENS_PER_CALL,
  note: "Image input is billed as input tokens and varies by image size/detail.",
} as const;

// 모델별 토큰 단가를 현재 상품 분석 기준의 콜당 예상 비용으로 환산한다.
export function estimateOpenAIModelCost(cost: (typeof OPENAI_MODEL_COSTS)[number]) {
  const inputUsd = (cost.inputUsdPerMillionTokens * ESTIMATED_INPUT_TOKENS_PER_CALL) / 1_000_000;
  const outputUsd = (cost.outputUsdPerMillionTokens * ESTIMATED_OUTPUT_TOKENS_PER_CALL) / 1_000_000;
  const usdPerCall = inputUsd + outputUsd;

  return {
    ...cost,
    usdPerCall,
    krwPerCall: usdPerCall * KRW_PER_USD,
    krwPerThousandCalls: usdPerCall * KRW_PER_USD * 1000,
  };
}

type JsonSchema = {
  type: "object";
  additionalProperties: false;
  required: string[];
  properties: Record<string, unknown>;
};

type OpenAIResponseOutput = {
  output_text?: string;
  usage?: unknown;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

export type ProductSearchKeywordInput = {
  productName: string;
  summary?: string;
  brand?: string;
  maker?: string;
  marketName?: string;
};

export type ProductSearchKeywordRecommendation = {
  refinedProductName: string;
  sameProductKeywords: string[];
  relatedCoreAttributes: string[];
  relatedProductKeywords: string[];
  negativeKeywords: string[];
  confidence: number;
};

export type ProductRecommendationCandidateInput = {
  candidateKey: string;
  name: string;
  categoryName?: string | null;
  summary?: string | null;
  price?: number | null;
  reviewCount?: number | null;
  rating?: number | null;
};

export type ProductRecommendationCandidateFilterInput = {
  sourceProductName: string;
  sourceBrand?: string | null;
  targetCategoryName?: string | null;
  targetUnitCount?: number | null;
  searchKeyword: string;
  candidates: ProductRecommendationCandidateInput[];
};

export type ProductRecommendationCandidateFilter = {
  acceptedCandidateKeys: string[];
  rejectedCandidates: Array<{
    candidateKey: string;
    reason: string;
  }>;
  confidence: number;
};

const PRODUCT_SEARCH_KEYWORD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "refinedProductName",
    "sameProductKeywords",
    "relatedCoreAttributes",
    "relatedProductKeywords",
    "negativeKeywords",
    "confidence",
  ],
  properties: {
    refinedProductName: {
      type: "string",
      description: "검색과 가격 비교에 쓰기 좋은 정제 상품명입니다.",
    },
    sameProductKeywords: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: { type: "string" },
      description: "동일 상품을 찾기 위한 완성된 검색 질의입니다. 단일 단어가 아니어야 합니다.",
    },
    relatedProductKeywords: {
      type: "array",
      minItems: 1,
      maxItems: 4,
      items: { type: "string" },
      description:
        "대체/유사 추천 상품을 찾기 위한 완성된 검색 질의입니다. 브랜드를 제외하고 상품군의 핵심 속성만 사용합니다.",
    },
    relatedCoreAttributes: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: { type: "string" },
      description:
        "유사 상품 검색에 사용할 핵심 속성입니다. 예: 식기세척기 세제, 미니, 캡슐/태블릿, 50개입.",
    },
    negativeKeywords: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
      description: "검색 결과에서 제외하면 좋은 키워드입니다.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
      description: "추천 키워드 품질에 대한 모델의 신뢰도입니다.",
    },
  },
} satisfies JsonSchema;

const PRODUCT_RECOMMENDATION_CANDIDATE_FILTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["acceptedCandidateKeys", "rejectedCandidates", "confidence"],
  properties: {
    acceptedCandidateKeys: {
      type: "array",
      items: { type: "string" },
      description: "추천 상품으로 사용할 수 있는 후보의 candidateKey 목록입니다.",
    },
    rejectedCandidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidateKey", "reason"],
        properties: {
          candidateKey: { type: "string" },
          reason: { type: "string" },
        },
      },
      description: "추천에서 제외한 후보와 제외 사유입니다.",
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
  },
} satisfies JsonSchema;

// OpenAI provider 설정을 한 곳에서 읽어 모델/타임아웃/키 이름이 흩어지지 않게 한다.
function readOpenAIConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY || process.env.OPENAPI_KEY,
    textModel: process.env.OPENAI_TEXT_MODEL || "gpt-5.4-nano",
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 30_000),
  };
}

// Responses API 응답 형식 차이를 흡수해서 structured output JSON 문자열만 꺼낸다.
function extractOutputText(response: OpenAIResponseOutput) {
  if (response.output_text) {
    return response.output_text;
  }

  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        return content.text;
      }
    }
  }

  return undefined;
}

// Responses API에 JSON schema를 전달하고, 스키마에 맞는 객체로 파싱한다.
async function callOpenAIStructuredJson<T>({
  model,
  task,
  schemaName,
  schema,
  systemPrompt,
  userPrompt,
}: {
  model: string;
  task: string;
  schemaName: string;
  schema: JsonSchema;
  systemPrompt: string;
  userPrompt: string;
}): Promise<T> {
  const { apiKey, timeoutMs } = readOpenAIConfig();

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되어 있지 않습니다.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = new Date();
  const promptHash = createPromptHash(`${schemaName}:${systemPrompt}:${JSON.stringify(schema)}`);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: systemPrompt }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema,
          },
        },
      }),
    });

    const json = (await response.json()) as OpenAIResponseOutput;

    if (!response.ok) {
      throw new Error(json.error?.message || `OpenAI API 요청 실패: ${response.status}`);
    }

    const outputText = extractOutputText(json);
    if (!outputText) {
      throw new Error("OpenAI API 응답에서 JSON 텍스트를 찾지 못했습니다.");
    }

    const parsed = JSON.parse(outputText) as T;
    await saveOpenAIRequestLog({
      task,
      model,
      status: "SUCCESS",
      input: { schemaName, systemPrompt, userPrompt },
      output: parsed,
      promptHash,
      startedAt,
      responseMeta: { usage: json.usage },
    });

    return parsed;
  } catch (error) {
    await saveOpenAIRequestLog({
      task,
      model,
      status: "FAILED",
      input: { schemaName, systemPrompt, userPrompt },
      errorMessage: error instanceof Error ? error.message : String(error),
      promptHash,
      startedAt,
    });

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function saveOpenAIRequestLog(input: {
  task: string;
  model: string;
  status: "SUCCESS" | "FAILED";
  input: unknown;
  output?: unknown;
  errorMessage?: string;
  promptHash: string;
  startedAt: Date;
  responseMeta?: unknown;
}) {
  const finishedAt = new Date();

  try {
    await saveAiRequestLog({
      provider: "openai",
      task: input.task,
      model: input.model,
      status: input.status,
      input: input.input,
      output: input.output,
      errorMessage: input.errorMessage,
      promptHash: input.promptHash,
      latencyMs: finishedAt.getTime() - input.startedAt.getTime(),
      responseMeta: input.responseMeta,
      startedAt: input.startedAt,
      finishedAt,
    });
  } catch {
    // AI 로그 저장 실패가 실제 상품 분석 흐름을 막으면 안 된다.
  }
}

// 개발 환경에서 OpenAI 호출 실패 시 화면 흐름을 막지 않기 위한 최소 키워드 후보를 만든다.
function fallbackProductSearchKeywords(
  input: ProductSearchKeywordInput,
): ProductSearchKeywordRecommendation {
  const refinedProductName = input.productName.trim();
  const baseKeyword = [input.brand, refinedProductName].filter(Boolean).join(" ");
  const relatedKeyword = removeKnownBrand(refinedProductName, input.brand);

  return {
    refinedProductName,
    sameProductKeywords: [baseKeyword || refinedProductName],
    relatedCoreAttributes: [relatedKeyword],
    relatedProductKeywords: [relatedKeyword],
    negativeKeywords: [...DEFAULT_PRODUCT_NEGATIVE_KEYWORDS],
    confidence: 0.3,
  };
}

function fallbackRecommendationCandidateFilter(
  input: ProductRecommendationCandidateFilterInput,
): ProductRecommendationCandidateFilter {
  const rejectedCandidates = input.candidates
    .filter((candidate) => isAccessoryCandidate(candidate.name))
    .map((candidate) => ({
      candidateKey: candidate.candidateKey,
      reason: "보관함/용기/케이스 등 소모품 본품이 아닌 액세서리 후보",
    }));
  const rejectedKeys = new Set(rejectedCandidates.map((candidate) => candidate.candidateKey));

  return {
    acceptedCandidateKeys: input.candidates
      .filter((candidate) => !rejectedKeys.has(candidate.candidateKey))
      .map((candidate) => candidate.candidateKey),
    rejectedCandidates,
    confidence: 0.4,
  };
}

function fallbackSameProductCandidateFilter(
  input: ProductRecommendationCandidateFilterInput,
): ProductRecommendationCandidateFilter {
  const rejectedCandidates = input.candidates
    .filter((candidate) => {
      if (isAccessoryCandidate(candidate.name)) return true;
      if (!input.sourceBrand) return false;
      return !normalizeText(candidate.name).includes(normalizeText(input.sourceBrand));
    })
    .map((candidate) => ({
      candidateKey: candidate.candidateKey,
      reason: "동일 상품 판단에 필요한 브랜드/상품군 조건이 부족한 후보",
    }));
  const rejectedKeys = new Set(rejectedCandidates.map((candidate) => candidate.candidateKey));

  return {
    acceptedCandidateKeys: input.candidates
      .filter((candidate) => !rejectedKeys.has(candidate.candidateKey))
      .map((candidate) => candidate.candidateKey),
    rejectedCandidates,
    confidence: 0.35,
  };
}

function isAccessoryCandidate(value: string) {
  return isAccessoryProductName(value);
}

// 모델이 만든 검색어를 길이/중복/불필요한 영문 추측 기준으로 정리한다.
function normalizeKeywordList(
  keywords: string[],
  {
    allowAlphabet,
    maxItems,
    maxLength,
    minLength,
    fallback,
  }: {
    allowAlphabet: boolean;
    maxItems: number;
    maxLength: number;
    minLength: number;
    fallback: string;
  },
) {
  const normalized = keywords
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .filter((keyword) => keyword.length >= minLength)
    .filter((keyword) => keyword.length <= maxLength)
    .filter((keyword) => !/[이가은는을를의] 아닌$/.test(keyword))
    .filter((keyword) => allowAlphabet || !/[A-Za-z]/.test(keyword));

  return Array.from(new Set(normalized))
    .slice(0, maxItems)
    .concat(normalized.length ? [] : [fallback]);
}

// 동일 상품 키워드와 유사 상품 키워드의 목적 차이를 후처리 단계에서도 보존한다.
function normalizeProductSearchKeywordRecommendation(
  input: ProductSearchKeywordInput,
  recommendation: ProductSearchKeywordRecommendation,
): ProductSearchKeywordRecommendation {
  const productName = input.productName.trim();
  const refinedProductName = recommendation.refinedProductName.trim() || productName;
  const allowAlphabet = /[A-Za-z]/.test(productName);
  const brandlessRelatedKeywords = recommendation.relatedProductKeywords.map((keyword) =>
    removeKnownBrand(keyword, input.brand),
  );

  return {
    refinedProductName,
    sameProductKeywords: normalizeKeywordList(recommendation.sameProductKeywords, {
      allowAlphabet,
      maxItems: 5,
      minLength: 8,
      maxLength: 40,
      fallback: refinedProductName,
    }),
    relatedCoreAttributes: normalizeKeywordList(recommendation.relatedCoreAttributes || [], {
      allowAlphabet,
      maxItems: 8,
      minLength: 2,
      maxLength: 20,
      fallback: removeKnownBrand(refinedProductName, input.brand),
    }),
    relatedProductKeywords: normalizeKeywordList(brandlessRelatedKeywords, {
      allowAlphabet,
      maxItems: 4,
      minLength: 8,
      maxLength: 32,
      fallback: removeKnownBrand(refinedProductName, input.brand),
    }),
    negativeKeywords: normalizeKeywordList(recommendation.negativeKeywords, {
      allowAlphabet,
      maxItems: 8,
      minLength: 2,
      maxLength: 8,
      fallback: "중고",
    }),
    confidence: Math.min(1, Math.max(0, recommendation.confidence)),
  };
}

// 유사 상품 검색어에서는 입력 상품의 브랜드를 제거해 다른 브랜드 후보까지 열어둔다.
function removeKnownBrand(value: string, brand?: string) {
  if (!brand) {
    return value.trim();
  }

  return value.replaceAll(brand, "").replace(/\s+/g, " ").trim();
}

// 상품명/요약을 기반으로 동일 상품 검색어와 브랜드 제외 유사 상품 검색어를 구조화해 추천한다.
export async function recommendProductSearchKeywords(
  input: ProductSearchKeywordInput,
): Promise<ProductSearchKeywordRecommendation> {
  const { textModel } = readOpenAIConfig();
  const productName = input.productName.trim();

  if (!productName) {
    throw new Error("추천 검색 키워드를 만들 상품명이 필요합니다.");
  }

  try {
    const recommendation = await callOpenAIStructuredJson<ProductSearchKeywordRecommendation>({
      model: textModel,
      task: "PRODUCT_SEARCH_KEYWORDS",
      schemaName: "product_search_keywords",
      schema: PRODUCT_SEARCH_KEYWORD_SCHEMA,
      systemPrompt:
        "너는 한국 이커머스 상품 검색 키워드 전문가다. 동일 상품 검색어와 유사 추천 상품 검색어를 분리하고, JSON schema에 맞는 한국어 결과만 반환한다. sameProductKeywords는 동일 상품 검색용이라 브랜드/향/수량을 보존한다. relatedProductKeywords는 유사 상품 검색용이라 브랜드를 제외하고 상품군의 핵심 속성만 사용한다. 검색어는 실제 검색창에 그대로 넣을 수 있는 완성된 질의여야 하며, 단일 단어 목록을 만들지 않는다. 원본 상품명에 없는 영문 브랜드명이나 모델명을 추측해서 만들지 않는다.",
      userPrompt: JSON.stringify({
        productName,
        summary: input.summary || "",
        brand: input.brand || "",
        maker: input.maker || "",
        marketName: input.marketName || "",
        guidance: [
          "sameProductKeywords는 다나와/쇼핑 검색에서 동일 상품이나 카탈로그 페이지를 찾기 위한 키워드로 만든다.",
          "relatedCoreAttributes에는 유사 상품 판단에 필요한 기본 속성만 넣는다. 브랜드, 제조사, 판매처명은 제외한다.",
          "relatedProductKeywords는 relatedCoreAttributes를 조합해서 만든다. 브랜드를 제외하고 상품군/용도/제형/용량대 중심으로 만든다.",
          "예: 프로쉬 식기세척기 주방세제 그린레몬 미니 50개입의 relatedProductKeywords 최선 후보는 '식기세척기 주방세제 미니 캡슐 50개입'처럼 브랜드를 뺀 검색어다.",
          "sameProductKeywords와 relatedProductKeywords의 각 항목은 단어가 아니라 2개 이상의 의미 단위를 가진 검색 질의여야 한다.",
          "negativeKeywords는 추천 품질을 낮추는 조건만 넣는다.",
          "불필요한 조사, 마케팅 문구, 판매처명은 제거한다.",
          "negativeKeywords는 단어 또는 8자 이내의 짧은 명사구만 사용하고 설명 문장을 넣지 않는다.",
          "원본 상품명에 영문 표기가 없으면 영문 키워드를 만들지 않는다.",
        ],
      }),
    });

    return normalizeProductSearchKeywordRecommendation({ ...input, productName }, recommendation);
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }

    return fallbackProductSearchKeywords({ ...input, productName });
  }
}

// 다나와 검색 후보 중 실제 대체 구매 상품이 아닌 액세서리/보관함/부품류를 OpenAI로 걸러낸다.
export async function filterProductRecommendationCandidates(
  input: ProductRecommendationCandidateFilterInput,
): Promise<ProductRecommendationCandidateFilter> {
  const { textModel } = readOpenAIConfig();
  const candidates = input.candidates.slice(0, 60);

  if (candidates.length === 0) {
    return { acceptedCandidateKeys: [], rejectedCandidates: [], confidence: 1 };
  }

  try {
    const result = await callOpenAIStructuredJson<ProductRecommendationCandidateFilter>({
      model: textModel,
      task: "PRODUCT_RECOMMENDATION_CANDIDATE_FILTER",
      schemaName: "product_recommendation_candidate_filter",
      schema: PRODUCT_RECOMMENDATION_CANDIDATE_FILTER_SCHEMA,
      systemPrompt:
        "너는 한국 이커머스 추천 상품 검수자다. 검색 후보가 원 상품을 대체 구매할 수 있는 같은 상품군의 본품인지 판정한다. 보관함, 보관통, 케이스, 거치대, 디스펜서, 공병, 부품, 액세서리, 사은품, 관련 용품은 추천에서 제외한다. 브랜드가 달라도 상품군/용도/입수가 맞으면 허용한다. JSON schema에 맞는 결과만 반환한다.",
      userPrompt: JSON.stringify({
        sourceProductName: input.sourceProductName,
        sourceBrand: input.sourceBrand || "",
        targetCategoryName: input.targetCategoryName || "",
        targetUnitCount: input.targetUnitCount || null,
        searchKeyword: input.searchKeyword,
        candidates: candidates.map((candidate) => ({
          candidateKey: candidate.candidateKey,
          name: candidate.name,
          categoryName: candidate.categoryName || "",
          summary: candidate.summary || "",
          price: candidate.price || null,
          reviewCount: candidate.reviewCount || 0,
          rating: candidate.rating || null,
        })),
        guidance: [
          "예: 세제 추천에서 '세제 보관함', '세제 통', '타블렛 보관통'은 제외한다.",
          "예: 화장지 추천에서 휴지걸이, 케이스, 보관함은 제외한다.",
          "예: 물티슈 추천에서 물티슈 캡, 케이스, 디스펜서는 제외한다.",
          "동일 브랜드 제외 조건은 별도 점수화에서 처리하므로, 여기서는 본품 여부와 상품군 적합성을 우선 판단한다.",
        ],
      }),
    });
    const allowedKeys = new Set(candidates.map((candidate) => candidate.candidateKey));
    const rejectedCandidates = result.rejectedCandidates.filter((candidate) =>
      allowedKeys.has(candidate.candidateKey),
    );
    const rejectedKeys = new Set(rejectedCandidates.map((candidate) => candidate.candidateKey));
    const acceptedCandidateKeys = result.acceptedCandidateKeys.filter(
      (key) => allowedKeys.has(key) && !rejectedKeys.has(key),
    );

    return {
      acceptedCandidateKeys,
      rejectedCandidates,
      confidence: Math.min(1, Math.max(0, result.confidence)),
    };
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }

    return fallbackRecommendationCandidateFilter({ ...input, candidates });
  }
}

// 카탈로그가 없을 때 가격표에 직접 넣을 수 있는 동일 상품 후보만 OpenAI로 선별한다.
export async function filterSameProductCandidates(
  input: ProductRecommendationCandidateFilterInput,
): Promise<ProductRecommendationCandidateFilter> {
  const { textModel } = readOpenAIConfig();
  const candidates = input.candidates.slice(0, 60);

  if (candidates.length === 0) {
    return { acceptedCandidateKeys: [], rejectedCandidates: [], confidence: 1 };
  }

  try {
    const result = await callOpenAIStructuredJson<ProductRecommendationCandidateFilter>({
      model: textModel,
      task: "SAME_PRODUCT_CANDIDATE_FILTER",
      schemaName: "same_product_candidate_filter",
      schema: PRODUCT_RECOMMENDATION_CANDIDATE_FILTER_SCHEMA,
      systemPrompt:
        "너는 한국 이커머스 동일 상품 검수자다. 검색 후보가 원 상품과 같은 브랜드/상품군/핵심 규격/입수의 동일 상품인지 판정한다. 다나와 카탈로그를 못 찾는 경우에도 가격비교 표에 직접 넣을 수 있을 만큼 같은 상품만 허용한다. 유사 상품, 다른 브랜드 대체재, 중고/리퍼/해외직구, 보관함/케이스/부품/액세서리는 제외한다. JSON schema에 맞는 결과만 반환한다.",
      userPrompt: JSON.stringify({
        sourceProductName: input.sourceProductName,
        sourceBrand: input.sourceBrand || "",
        targetCategoryName: input.targetCategoryName || "",
        targetUnitCount: input.targetUnitCount || null,
        searchKeyword: input.searchKeyword,
        candidates: candidates.map((candidate) => ({
          candidateKey: candidate.candidateKey,
          name: candidate.name,
          categoryName: candidate.categoryName || "",
          summary: candidate.summary || "",
          price: candidate.price || null,
          reviewCount: candidate.reviewCount || 0,
          rating: candidate.rating || null,
        })),
        guidance: [
          "동일 상품 가격비교 표에 들어갈 후보만 acceptedCandidateKeys에 넣는다.",
          "브랜드가 다르면 원칙적으로 제외한다. 단, 원 상품 브랜드가 비어 있고 상품명/규격이 명확히 같은 경우만 허용한다.",
          "수량, 용량, 롤 수, 매수, 팩 수가 크게 다르면 제외한다.",
          "카탈로그가 아니어도 직접 구매 링크 후보로 쓸 수 있으면 허용한다.",
        ],
      }),
    });
    const allowedKeys = new Set(candidates.map((candidate) => candidate.candidateKey));
    const rejectedCandidates = result.rejectedCandidates.filter((candidate) =>
      allowedKeys.has(candidate.candidateKey),
    );
    const rejectedKeys = new Set(rejectedCandidates.map((candidate) => candidate.candidateKey));
    const acceptedCandidateKeys = result.acceptedCandidateKeys.filter(
      (key) => allowedKeys.has(key) && !rejectedKeys.has(key),
    );

    return {
      acceptedCandidateKeys,
      rejectedCandidates,
      confidence: Math.min(1, Math.max(0, result.confidence)),
    };
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw error;
    }

    return fallbackSameProductCandidateFilter({ ...input, candidates });
  }
}
