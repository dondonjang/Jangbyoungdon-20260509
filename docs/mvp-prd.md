# 장바구니 비서 MVP PRD

작성일: 2026-05-09
기준 브랜치: 현재 로컬 git history
제품명: 생필품 장바구니 비서

## 1. Product Brief

장바구니 비서는 반복 구매하는 생필품의 재구매 판단 비용을 줄이는 쇼핑 어시스턴트다.

MVP의 핵심 가설은 다음과 같다.

- 사용자는 자주 사는 상품을 다시 찾을 때 상품명 검색, 가격 비교, 대체 상품 탐색을 반복한다.
- 상품 상세 링크 하나만 보내면, 서비스가 상품을 저장하고 같은 상품/유사 상품 후보를 모아 보여주는 흐름이 충분히 명확한 1차 가치가 된다.
- 초기에는 모든 커머스를 열기보다 마켓컬리 상품 상세 링크와 다나와 가격 비교 후보 수집에 집중하는 편이 제품 검증 속도가 빠르다.

## 2. MVP Goal

사용자가 채팅에 마켓컬리 상품 상세 링크를 입력하면, 시스템이 해당 상품을 분석하고 `자주 사는 상품` 목록에 저장한 뒤, 동일 상품 가격 비교와 유사 추천 상품 후보를 확인할 수 있게 한다.

### Success Criteria

- 사용자는 별도 온보딩 없이 채팅 입력창에 상품 링크를 붙여넣을 수 있다.
- 지원하지 않는 입력은 실패가 아니라 회복 가능한 안내로 처리된다.
- 저장된 상품은 `자주 사는 상품`에서 다시 확인할 수 있다.
- 저장 상품 화면은 동일 상품과 유사 추천 상품을 구분해 보여준다.
- MVP는 Vercel 배포 대상 구조로 유지된다.

### Non-goals

- 모든 커머스 링크 지원
- 실시간 최저가 보장
- 개인 계정/로그인 기반 멀티 유저 운영
- 완전 자동 스케줄러 기반 추천 갱신
- 결제, 장바구니 담기, 주문 연동

## 3. Target User

### Primary User

반복 구매 생필품이 있고, 매번 같은 상품을 다시 검색하거나 가격 비교하는 시간이 아까운 사용자.

### User Context

- 자주 사는 상품은 이미 정해져 있지만, 매번 같은 가격인지 확신하기 어렵다.
- 동일 상품과 대체 가능한 상품을 한 화면에서 비교하고 싶다.
- 상세한 필터보다 "내가 저장한 상품 기준으로 지금 볼 만한 후보"가 더 중요하다.

## 4. Core User Journey

1. 사용자가 채팅 탭에 마켓컬리 상품 상세 링크를 입력한다.
2. 프론트엔드는 지원 URL 여부를 확인하고, 불가한 입력은 안내 메시지로 돌려준다.
3. 서버는 상품 상세 데이터를 수집한다.
4. 서버는 OpenAI를 통해 상품명 정제, 동일 상품 키워드, 유사 상품 키워드, 핵심 속성을 생성한다.
5. 서버는 상품 마스터, 원본 상품, 입력 링크, 분석 로그, 사용자 저장 상품을 저장한다.
6. 사용자는 CTA를 통해 `자주 사는 상품` 탭으로 이동한다.
7. `자주 사는 상품`은 저장된 상품, 최저가 후보, 구매 링크, 유사 추천 상품을 보여준다.
8. 사용자는 필요 없는 저장 상품을 삭제할 수 있다.

## 5. MVP Scope

### In Scope

| Area | MVP 범위 |
| --- | --- |
| 입력 | 마켓컬리 상품 상세 링크 입력 |
| 분석 | 상품 상세 수집, OpenAI 기반 검색 키워드 생성 |
| 저장 | 상품 마스터, 입력 링크, 원본 상품, 분석 로그, 기본 사용자 저장 목록 |
| 추천/비교 | 동일 상품 링크와 유사 추천 상품 링크를 구분해 표시 |
| UI | 채팅 탭, 자주 사는 상품 탭, 모바일 하단 탭, 삭제 UX |
| 배포 | Vercel Nitro 설정, Prisma Postgres 런타임 연결 |

### Out of Scope For MVP

| Area | 제외 사유 |
| --- | --- |
| 상품명 텍스트 입력 분석 | 현재 클라이언트/서버 검증이 상세 URL 중심으로 고정되어 있음 |
| 다중 사용자 계정 | MVP 검증 전 인증/권한 비용이 큼 |
| 스케줄러 자동 갱신 | 수집/매칭 품질 검증 후 붙이는 것이 안전함 |
| 클릭 트래킹 | 구매 전환 학습에는 중요하지만 MVP 핵심 저장/비교 흐름 이후 단계 |
| 원클릭 구매 | 외부 커머스 정책 및 책임 범위가 커짐 |

## 6. Functional Requirements

### FR-1. Chat Product Intake

- 사용자는 채팅 입력창에 상품 상세 링크를 입력할 수 있다.
- 현재 지원 대상은 마켓컬리 `/goods/{id}` 상세 페이지다.
- 지원하지 않는 URL 또는 텍스트 입력은 "현재는 마켓컬리 상품 상세 링크만 지원" 안내를 보여준다.
- 분석 중에는 단계별 활동 로그를 보여 사용자가 대기 상태를 이해할 수 있어야 한다.
- 분석 완료 후 저장된 상품명과 `자주 사는 상품` 이동 CTA를 보여준다.

### FR-2. Product Analysis Pipeline

- 서버는 입력 URL을 정규화하고 마켓컬리 상품 번호를 추출한다.
- 서버는 상품 상세 데이터를 수집한다.
- 서버는 OpenAI를 호출해 다음 값을 만든다.
  - 정제 상품명
  - 동일 상품 검색 키워드
  - 유사 상품 검색 키워드
  - 유사 추천 판단에 필요한 핵심 속성
  - 추천 제외 키워드와 confidence
- 분석 결과는 재조회 가능한 형태로 DB에 저장한다.

### FR-3. Saved Product View

- 사용자는 `자주 사는 상품` 탭에서 저장된 상품 목록을 볼 수 있다.
- 저장 상품은 최신 업데이트 순으로 노출한다.
- 상품 카드에는 대표 이미지, 상품명, 요약 또는 핵심 속성을 보여준다.
- 동일 상품 가격 비교 후보가 있으면 최종가 기준 최저가를 강조한다.
- 구매 링크는 외부 링크로 열린다.
- 유사 추천 상품은 동일 상품과 별도 영역으로 구분한다.
- 저장 상품 삭제는 원본 수집/분석 데이터 삭제가 아니라 사용자 목록에서 soft delete 처리한다.

### FR-4. Data Model

- `ProductMaster`는 분석/비교 기준이 되는 상품 단위다.
- `Product`는 마켓의 실제 상품 또는 수집된 원본 상품이다.
- `ProductInputLink`는 사용자가 제출한 원본 입력 링크다.
- `ProductLink`와 `ProductLinkOffer`는 다나와 등 외부 가격 비교/추천 후보를 표현한다.
- `ProductAnalysis`와 `AiRequestLog`는 분석 근거와 AI 호출 관측성을 남긴다.
- `UserProduct`는 기본 사용자 기준 저장 목록 상태를 관리한다.

### FR-5. Deployment Readiness

- Vercel 배포 대상이므로 Cloudflare/Wrangler 설정을 재도입하지 않는다.
- Prisma Client는 Vercel 서버리스 환경에서 동작할 수 있는 wrapper를 사용한다.
- DB timestamp는 UTC instant로 저장하고, 사용자 노출 시점에 KST로 변환한다.

## 7. UX Principles

- 첫 화면은 마케팅 페이지가 아니라 바로 쓸 수 있는 채팅 경험이어야 한다.
- `자주 사는 상품`은 분석 도구가 아니라 저장된 반복 구매 상품 보관함처럼 느껴져야 한다.
- 추천/비교 UI는 필터처럼 보이면 안 된다. 실제 필터가 아니기 때문이다.
- 실패는 막다른 길이 아니라 다음 입력을 유도하는 안내여야 한다.
- 모바일 사용성을 우선해 하단 탭과 간결한 카드 구조를 유지한다.

## 8. Release Feature Log

git log 시간 순서 기준으로 MVP가 어떤 제품 능력을 얻었는지 정리한다.

| 순서 | Commit | 시간 | 제품/기술 피처 | MVP 의미 |
| --- | --- | --- | --- | --- |
| 1 | `cca45f9` | 2026-05-09 02:38 | 1차 구조 설계 | TanStack Start 기반 앱, 채팅/분석 탭, Prisma schema, 마켓/스크랩/상품 분석의 초기 경계가 생김 |
| 2 | `0196ef9` | 2026-05-09 18:50 | 스크랩 백엔드 1차 | 마켓컬리 PLP/PDP 수집 스크립트와 서버 수집 타입이 추가되어 "링크를 분석 가능한 데이터로 바꾸는" 기반 확보 |
| 3 | `5011121` | 2026-05-09 19:03 | 저장 상품 명명 정렬 | `AnalysisTab`을 `MyProductsTab`으로 전환해 제품 언어를 `자주 사는 상품` 방향으로 정리 |
| 4 | `60cbf1e` | 2026-05-09 19:42 | OpenAI 1차 연동 | 상품 구조화/키워드 생성을 위한 AI provider 경계와 환경 변수가 추가됨 |
| 5 | `52e37c4` | 2026-05-09 21:22 | 다나와 가격비교 링크 수집 구조 | 다나와 검색/카탈로그 수집, 상품 링크/오퍼 모델, AI request log가 추가되어 동일 상품/추천 상품 후보를 담을 수 있게 됨 |
| 6 | `1eed1de` | 2026-05-09 21:32 | Vercel Nitro 설정 | 로컬 프로토타입을 Vercel 배포 가능한 런타임 방향으로 정렬 |
| 7 | `fb77edc` | 2026-05-09 21:36 | Prisma DB 연결 정리 | Postgres/Prisma 런타임 연결을 정리해 서버리스 배포와 DB 조회 경로를 안정화 |
| 8 | `e24bfa6` | 2026-05-09 22:23 | 쇼핑 어시스턴트 UX 집중 | 채팅 완료 CTA, 저장 상품 목록, 삭제, 최저가 표시, 유사 추천 영역, 상품 API 경계가 실제 MVP 플로우로 연결됨 |

## 9. API And Endpoint Contract

현재 API는 두 층으로 나뉜다.

- HTTP API route: 외부 smoke test, 수집/운영 확인, 향후 모바일/외부 클라이언트 확장을 위한 명시적 endpoint
- TanStack Start server function: 현재 React UI가 직접 호출하는 내부 앱 경계

### 9.1 HTTP API Routes

| Endpoint | Method | 목적 | Request | Success Response | Error |
| --- | --- | --- | --- | --- | --- |
| `/api/products/analyze` | `POST` | 채팅 입력 상품 링크 분석 및 저장 | JSON body | `ChatProductAnalyzeResult` | `400 { "error": string }` |
| `/api/products` | `GET` | 저장 상품 목록 페이지 조회 | query string | `SavedProductListPage` | `500 { "error": string }` |
| `/api/internal/products` | `GET` | 내부 확인용 저장 상품 목록 조회 | 없음 | `{ "products": SavedProductView[] }` | `500 { "error": string }` |
| `/api/markets` | `GET` | 지원 마켓 목록/단일 마켓 조회 | query string | `{ "markets": Market[] }` 또는 `{ "market": Market }` | `404 { "error": string }` |
| `/api/scrape/parse` | `POST` | URL 수집/파싱 실행 | JSON body | `ScrapeParseResult` | `400 { "error": string }` |
| `/api/scrape/targets` | `GET` | 기본 수집 대상 목록 조회 | query string | `{ "targets": DefaultScrapeTarget[] }` | 현재 명시 error 없음 |

#### POST `/api/products/analyze`

채팅 입력에서 사용하는 상품 분석/저장 endpoint다. 현재 MVP에서는 마켓컬리 상품 상세 링크만 성공 경로로 지원한다.

Request body:

```json
{
  "value": "https://www.kurly.com/goods/123456"
}
```

Response body:

```json
{
  "product": {
    "id": 1,
    "displayName": "상품명",
    "refinedName": "정제 상품명",
    "brand": null,
    "summary": "상품 요약",
    "analysisStatus": "ANALYZED",
    "sameKeywords": ["동일 상품 검색어"],
    "relatedKeywords": ["유사 상품 검색어"],
    "relatedCoreAttributes": ["핵심 속성"],
    "sourceProduct": {
      "id": 1,
      "marketName": "kurly",
      "marketProductNo": "123456",
      "sourceUrl": "https://www.kurly.com/goods/123456",
      "name": "원본 상품명",
      "imageUrl": "https://...",
      "price": 10000
    },
    "sameProductLinks": [],
    "recommendedProductLinks": [],
    "createdAt": "2026-05-09T13:23:32.000Z",
    "updatedAt": "2026-05-09T13:23:32.000Z"
  },
  "message": "상품명 상품을 자주 사는 상품에 저장했어요."
}
```

Validation/error:

- body는 `value: string`을 필수로 받는다.
- 지원하지 않는 입력이면 `400`과 `{ "error": "현재는 마켓컬리 상품 상세 링크만 지원합니다." }` 형식으로 응답한다.

#### GET `/api/products`

`자주 사는 상품` 목록을 페이지 단위로 조회한다.

Query parameters:

| 이름 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `page` | number | `1` | 1부터 시작하는 페이지 번호 |
| `pageSize` | number | `20` | 페이지당 상품 수. 서비스 함수 내부 최대값은 50 |

Example:

```http
GET /api/products?page=1&pageSize=10
```

Response body:

```json
{
  "products": [],
  "page": 1,
  "pageSize": 10,
  "totalCount": 0,
  "totalPages": 1,
  "hasNextPage": false,
  "hasPreviousPage": false
}
```

`products[]`의 item shape는 `SavedProductView`다.

#### GET `/api/internal/products`

페이지네이션 없이 저장 상품 목록을 확인하는 내부용 endpoint다. 운영 사용자-facing API라기보다 개발/검증 보조 성격이다.

Response body:

```json
{
  "products": []
}
```

`products[]`의 item shape는 `SavedProductView`다.

#### GET `/api/markets`

지원 마켓 설정을 조회한다.

Query parameters:

| 이름 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `includeDisabled` | boolean string | `false` | `true`면 비활성 마켓도 포함 |
| `slug` | string | 없음 | 특정 마켓 slug로 단일 조회 |
| `url` | string | 없음 | URL을 보고 해당 마켓 설정 조회 |

Example:

```http
GET /api/markets?slug=kurly
GET /api/markets?url=https%3A%2F%2Fwww.kurly.com%2Fgoods%2F123456
GET /api/markets?includeDisabled=true
```

Response body:

```json
{
  "markets": [
    {
      "slug": "kurly",
      "companyName": "Kurly",
      "displayName": "마켓컬리",
      "baseUrl": "https://www.kurly.com",
      "enabled": true
    }
  ]
}
```

단일 조회는 `{ "market": ... }` 형식이다. 찾지 못하면 `404`를 반환한다.

#### POST `/api/scrape/parse`

입력 URL을 수집하고 파싱 결과를 저장/반환하는 수집용 endpoint다. MVP 메인 UI 경로보다는 수집 파이프라인 검증에 가깝다.

Request body:

```json
{
  "url": "https://www.kurly.com/goods/123456"
}
```

또는:

```json
{
  "link": "https://www.kurly.com/goods/123456"
}
```

Validation:

- `url` 또는 `link` 중 하나가 필요하다.
- 둘 다 없으면 `400 { "error": "url or link is required." }` 형식으로 응답한다.

Response body:

```json
{
  "source": "market-api",
  "marketRequest": {},
  "marketResponse": {},
  "html": {
    "id": "scrape-id",
    "url": "https://...",
    "finalUrl": "https://...",
    "pageKind": "pdp",
    "status": 200,
    "fetchedAt": "2026-05-09T13:23:32.000Z",
    "htmlLength": 12345
  },
  "parsed": {
    "id": "parsed-id",
    "scrapeId": "scrape-id",
    "url": "https://...",
    "pageKind": "pdp",
    "title": "상품명",
    "product": {
      "name": "상품명",
      "url": "https://...",
      "image": "https://...",
      "price": 10000,
      "currency": "KRW"
    },
    "productCandidates": [],
    "parserVersion": "string",
    "parsedAt": "2026-05-09T13:23:32.000Z"
  }
}
```

#### GET `/api/scrape/targets`

기본 수집 대상 목록을 조회한다.

Query parameters:

| 이름 | 타입 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `includeDisabled` | boolean string | `false` | `true`면 비활성 target도 포함 |

Response body:

```json
{
  "targets": [
    {
      "id": "kurly-sample",
      "site": "kurly",
      "label": "마켓컬리 샘플",
      "url": "https://...",
      "pageKind": "pdp",
      "enabled": true,
      "tags": ["sample"],
      "notes": "검증용"
    }
  ]
}
```

### 9.2 React UI Server Functions

현재 React 화면은 HTTP fetch 대신 TanStack Start `createServerFn` wrapper를 호출한다. 이 경계는 클라이언트 import가 가능하지만, handler 안에서만 서버 서비스를 dynamic import한다.

| Server function | Method | 호출 화면 | Input | Output |
| --- | --- | --- | --- | --- |
| `analyzeChatProductFn` | `POST` | `ChatTab` | `{ "value": string }` | `ChatProductAnalyzeResult` |
| `listSavedProductViewPageFn` | `GET` | `Index`, `MyProductsTab` | `{ "page"?: number, "pageSize"?: number }` | `SavedProductListPage` |
| `listSavedProductViewsFn` | `GET` | legacy/internal | 없음 | `SavedProductView[]` |
| `softDeleteSavedProductFn` | `POST` | `MyProductsTab` | `{ "masterId": number }` | `{ "ok": true, "deletedCount": number }` |

#### `softDeleteSavedProductFn` Input

```json
{
  "masterId": 1
}
```

Response:

```json
{
  "ok": true,
  "deletedCount": 1
}
```

삭제는 `ProductMaster`, `Product`, `ProductAnalysis` 원본 데이터를 지우지 않고 `UserProduct.status`를 `DELETED`로 바꾼다.

### 9.3 Shared Response Types

#### `SavedProductView`

```ts
type SavedProductView = {
  id: number;
  displayName: string;
  refinedName: string | null;
  brand: string | null;
  summary: string | null;
  analysisStatus: string;
  sameKeywords: string[];
  relatedKeywords: string[];
  relatedCoreAttributes: string[];
  sourceProduct: {
    id: number;
    marketName: string;
    marketProductNo: string;
    sourceUrl: string;
    name: string;
    imageUrl: string;
    price: number;
  } | null;
  sameProductLinks: ProductLinkView[];
  recommendedProductLinks: ProductLinkView[];
  createdAt: string;
  updatedAt: string;
};
```

#### `ProductLinkView`

```ts
type ProductLinkView = {
  id: number;
  marketName: string;
  marketProductNo: string;
  marketItemNo: string | null;
  linkType: string;
  relationKind: "SAME_PRODUCT" | "RECOMMENDED_PRODUCT" | string;
  searchKeyword: string | null;
  sourceUrl: string;
  name: string;
  imageUrl: string | null;
  price: number | null;
  isCatalog: boolean;
  categoryName: string | null;
  mallCount: number | null;
  reviewCount: number | null;
  rating: number | null;
  summary: string | null;
  listingOrder: number | null;
  isAd: boolean;
  offers: ProductLinkOfferView[];
};
```

#### `ProductLinkOfferView`

```ts
type ProductLinkOfferView = {
  id: number;
  marketName: string;
  marketProductNo: string;
  marketItemNo: string | null;
  mallName: string;
  sellerName: string | null;
  sourceUrl: string;
  name: string;
  imageUrl: string | null;
  price: number | null;
  shippingFee: number | null;
  finalPrice: number | null;
  deliveryText: string | null;
  availability: string | null;
  listingOrder: number | null;
  isAd: boolean;
};
```

## 10. QA And Improvement Log

릴리즈 로그와 같은 순서를 유지하되, 각 단계에서 확인해야 할 QA 관점과 이후 개선 포인트를 남긴다.

### 10.1 구조 설계 QA

검증 포인트:

- TanStack Router 초기 라우팅이 `/`에서 정상 동작한다.
- 클라이언트 컴포넌트가 `src/server/*`를 직접 import하지 않는다.
- 상품 관련 canonical type은 `src/lib/product-types.ts`에 모인다.
- Cloudflare/Wrangler 설정이 다시 생기지 않는다.

개선 로그:

- 초기 `AnalysisTab` 명칭은 제품 언어와 어긋났고, 이후 `MyProductsTab`으로 정리되었다.
- roadmap 문서는 데이터 중심이므로, 제품 의사결정용 PRD 문서가 별도로 필요해졌다.

### 10.2 스크랩 백엔드 QA

검증 포인트:

- 마켓컬리 상세 링크에서 상품 번호를 추출할 수 있다.
- PDP 수집 실패 시 사용자에게 재시도 가능한 실패로 돌아온다.
- 원본 HTML/JSON 저장 범위가 과도하지 않은지 확인한다.
- 수집 스크립트가 운영 API와 앱 서버 책임을 혼동하지 않는다.

개선 로그:

- 초기 수집 범위는 마켓컬리에 집중하는 것이 맞다.
- 다음 단계에서는 수집 실패 원인을 UI에 더 세분화해 보여줄 수 있다.

### 10.3 저장 상품 UX 명명 QA

검증 포인트:

- 탭 라벨은 `자주 사는 상품`을 사용한다.
- 사용자가 "분석 결과"가 아니라 "내가 저장한 반복 구매 상품"으로 이해할 수 있다.
- 빈 상태는 채팅 입력으로 자연스럽게 돌아가게 한다.

개선 로그:

- `AnalysisTab`에서 `MyProductsTab`으로 변경되며 PO 관점의 제품 언어가 더 명확해졌다.
- 다만 코드 내부에서는 `SavedProduct`와 `MyProducts` 용어가 함께 쓰이므로 장기적으로 용어 사전을 둘 필요가 있다.

### 10.4 OpenAI 연동 QA

검증 포인트:

- OpenAI API key는 클라이언트 번들에 노출되지 않는다.
- AI output은 화면 표시 전에 구조화된 schema 또는 타입 경계를 통과한다.
- AI 실패 시 저장 흐름 전체가 무조건 깨지는지, fallback이 가능한지 확인한다.
- `AiRequestLog`에 provider, task, status, latency, raw output을 남길 수 있다.

개선 로그:

- 현재 MVP는 AI 결과를 상품 저장의 핵심 경로에 사용한다.
- 이후에는 동일 상품 판별의 1차 기준을 deterministic signal로 보강해야 한다.

### 10.5 다나와 링크 수집 QA

검증 포인트:

- 동일 상품 후보와 유사 추천 후보가 `relationKind`로 분리 저장된다.
- 카탈로그 링크와 판매처 offer가 별도 구조로 표현된다.
- 광고 여부, 노출 순서, 최종가, 배송비가 UI 비교에 필요한 수준으로 들어온다.
- 추천 후보가 동일 상품과 섞이지 않는지 확인한다.

개선 로그:

- 다나와 수집 구조가 들어오며 MVP의 "가격 비교" 약속을 담을 수 있는 그릇이 생겼다.
- 다음 단계는 후보 품질 점수와 제외 규칙을 명시하는 것이다.

### 10.6 Vercel 설정 QA

검증 포인트:

- `bun run build`가 Vercel target 설정으로 통과한다.
- Nitro preset이 Vercel 배포에 맞게 유지된다.
- 런타임 환경 변수가 `.env.example`과 실제 배포 환경에서 일치한다.

개선 로그:

- 배포 플랫폼을 Vercel로 고정하면서 Cloudflare 계열 설정을 다시 들이지 않는 원칙이 생겼다.
- preview 배포에서 DB 연결 실패 시 fallback UX를 점검해야 한다.

### 10.7 Prisma DB 연결 QA

검증 포인트:

- Prisma client wrapper가 dev hot reload에서 client를 중복 생성하지 않는다.
- Postgres adapter 설정이 Vercel runtime에서 동작한다.
- raw query 기반 saved product view가 빈 목록, pagination, deleted 상태를 올바르게 처리한다.
- timestamp는 UTC instant로 저장된다.

개선 로그:

- in-memory 저장소에서 실제 DB 조회 경계로 이동하며 MVP 신뢰도가 높아졌다.
- 이후에는 migration/seed/운영 DB reset 절차가 문서화되어야 한다.

### 10.8 쇼핑 어시스턴트 UX QA

검증 포인트:

- 채팅 입력부터 저장 완료 CTA까지 한 번에 이어진다.
- 분석 중 activity log가 너무 빠르거나 느리게 느껴지지 않는다.
- 모바일 하단 탭에서 `채팅`과 `자주 사는 상품` 전환이 명확하다.
- 저장 상품 카드에서 최저가 badge와 구매 버튼이 잘 구분된다.
- 삭제는 confirmation을 거치고, 실패 시 optimistic update가 rollback된다.
- 유사 추천 상품 영역은 동일 상품 가격 비교와 시각적으로 분리된다.

개선 로그:

- MVP의 사용 흐름이 기술 데모에서 실제 쇼핑 어시스턴트 형태로 정리되었다.
- 현재는 지원 입력이 마켓컬리 상세 URL로 좁으므로, 온보딩 copy와 unsupported 안내의 기대치 조절이 중요하다.

## 11. MVP Risks

| Risk | 영향 | 대응 |
| --- | --- | --- |
| 마켓컬리 DOM/API 변경 | 상품 수집 실패 | 수집 실패 상태와 parser version 기록, fallback parser 추가 |
| OpenAI 결과 품질 편차 | 추천/검색 키워드 품질 저하 | schema validation, confidence 저장, deterministic matching 보강 |
| 다나와 후보 noise | 사용자 신뢰도 하락 | relation scoring, negative keyword, 동일/유사 후보 dedupe |
| Vercel DB connection | 배포 환경 장애 | Prisma wrapper와 env validation, preview smoke test |
| MVP 입력 범위 오해 | 사용자가 일반 텍스트/타 커머스 입력 기대 | 채팅 welcome/notice copy에서 지원 범위 명확화 |

## 12. Next Decisions

1. 텍스트 상품명 입력을 MVP에 포함할지, URL MVP 검증 이후로 미룰지 결정한다.
2. 다나와 수집을 실시간 요청으로 둘지, 별도 job/queue로 분리할지 결정한다.
3. 동일 상품 판별 기준을 AI 중심에서 rule + AI hybrid로 전환할 시점을 정한다.
4. 기본 사용자 모델을 실제 로그인 사용자로 전환할 기준을 정한다.
5. 외부 구매 링크 클릭 트래킹을 MVP+1에 포함할지 결정한다.

## 13. Launch Checklist

- `bun run lint` 통과 또는 기존 shadcn fast-refresh warning 외 신규 오류 없음 확인
- `bun run build` 통과
- 마켓컬리 상품 상세 링크 3개 이상으로 수동 smoke test
- 지원하지 않는 URL/텍스트 입력 안내 확인
- 저장 상품 빈 상태/목록 상태/삭제 상태 확인
- Vercel preview에서 DB 연결과 상품 목록 조회 확인
- OpenAI key 미설정 시 실패 메시지와 로그 확인
- 다나와 후보 데이터가 있는 상품에서 동일 상품/유사 추천 구분 확인
