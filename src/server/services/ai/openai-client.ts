import type { ProductRecommendation } from "@/lib/product-types";
import { createPromptHash, saveAiRequestLog } from "@/server/services/ai/ai-request-log";

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
    negativeKeywords: ["중고", "리퍼", "해외직구"],
    confidence: 0.3,
  };
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

type ProductIntelInput = {
  sourceValue: string;
  scrapedTitle?: string;
  scrapedDescription?: string;
  textSample?: string;
};

export type ProductIntel = {
  name: string;
  normalizedName: string;
  summary: string;
  sameProducts: ProductRecommendation[];
  similarProducts: ProductRecommendation[];
};

function fallbackIntel(input: ProductIntelInput): ProductIntel {
  const name = input.scrapedTitle || input.sourceValue;
  const base = Math.max(5000, name.length * 1200);

  return {
    name,
    normalizedName: name.trim().toLowerCase(),
    summary: input.scrapedDescription || "상품명/링크를 기반으로 자주 사는 상품 후보를 분석했어요.",
    sameProducts: [
      {
        name: `${name} 동일 상품`,
        price: base,
        rating: 4.7,
        review: "상품명과 핵심 구성이 가까운 후보예요.",
        reason: "동일 상품 비교를 위한 기본 후보입니다.",
      },
    ],
    similarProducts: [
      {
        name: `${name} 대체 추천`,
        price: Math.round(base * 0.9),
        rating: 4.5,
        review: "용도와 가격대가 비슷한 대체 상품 후보예요.",
        reason: "같은 구매 목적을 만족할 수 있는 유사 상품입니다.",
      },
    ],
  };
}

export async function buildProductIntel(input: ProductIntelInput): Promise<ProductIntel> {
  // Temporary mock provider until the OpenAI structured output schema is implemented.
  // Keep this server-only; this module is imported dynamically from createServerFn handlers.
  return fallbackIntel(input);
}
