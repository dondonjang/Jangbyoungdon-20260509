# Product Data and UI Roadmap

## Current Direction

This project is moving toward a saved-product assistant for recurring purchases.

The core user flow is:

1. User submits a product link or product name in chat.
2. The system creates a `ProductMaster` first, before full collection is complete.
3. The submitted link is stored separately in `ProductInputLink`.
4. The source product is collected into `Product`.
5. OpenAI extracts product attributes, benefits, cleaned product name, and search keywords.
6. Scheduled jobs use the keywords to search Danawa and other markets.
7. The system links same-product results and recommended-product results.
8. The UI compares price, benefits, and attributes for the user.

The important modeling choice is:

- `ProductMaster` is the analysis and comparison anchor.
- `Product` is an individual market listing or product URL.
- `ProductInputLink` is the user-submitted source link.
- `ProductAttribute` stores structured key-value attributes and benefits.
- `ProductMaster.sameKeywords` and `ProductMaster.relatedKeywords` store search terms.
- `ProductRelation` stores same/recommended product links with similarity evidence.

## Current Schema Status

Implemented in `prisma/schema.prisma`:

- `User`
- `UserProduct`
- `Market`
- `ScrapeTarget`
- `ScrapeRun`
- `ScrapedPage`
- `ProductMaster`
- `ProductInputLink`
- `Product`
- `ProductAttribute`
- `ProductRelation`
- `ProductAnalysis`
- `OutboundClick`

The schema already supports:

- user-specific saved product lists
- unified scrape target management for PLP/PDP/user-submitted URLs
- source link deduplication
- market/product URL deduplication
- external product and item numbers
- scrape status
- raw payload preservation
- key-value product attributes and benefits
- same-product and recommendation relations

## Timezone Contract

All Prisma `DateTime` fields should store real instants, not manually shifted local time.

Policy:

- Store `createdAt`, `updatedAt`, `scrapedAt`, `parsedAt`, and job timestamps as Prisma `DateTime`.
- Treat DB timestamps as UTC instants for portability across Vercel, local machines, and any future worker server.
- Convert to `Asia/Seoul` at the application boundary for display, daily buckets, reports, and logs that users read.
- Use `src/server/db/timestamps.ts` for timestamp creation and KST formatting.
- Do not add 9 hours manually before saving a `Date`; that creates incorrect instants.

If KST date grouping is needed later, add an explicit derived field such as `kstDateKey` (`YYYY-MM-DD`) for that specific use case rather than changing the meaning of `createdAt`.

## Data Fields To Add Or Revisit

### Product

Current `Product` keeps only fields that can be filled during near-term collection:

- market/product identifiers
- product title and normalized title
- brand and category
- representative image
- price and retail price
- availability and seller name
- scrape status and market-side registered/updated timestamps
- raw market payload

Reason:

Fields like maker, series, model, barcode, shipping fee, detail image list, and detail HTML should stay in `raw` until a collector actually populates and uses them.

### ProductMaster

Current `ProductMaster` keeps the minimum analysis anchor:

- refined product name
- brand and category
- summary
- match key
- analysis status
- raw analysis payload

Reason:

Detailed identity fields should be promoted only after OpenAI/Danawa matching proves they are used frequently.

### ProductAttribute

Current structure:

- `kind`
- `group`
- `key`
- `value`
- `unit`
- `raw`

- `rawKey`
- `label`
- `valueNumber`

Reason:

`key` should be stable for clustering, for example `volume`, `ingredient`, `maker`, `free_shipping`.
`label` should be display-friendly Korean text, for example `용량`, `성분`, `제조사`, `무료배송`.
`rawKey` keeps the original market text, for example `중량 · 용량 · 매수 · 크기`.

## Backend Work Still Needed

### 1. Prisma Runtime

Create a real Prisma client wrapper:

- `src/server/db/prisma.ts`
- avoid multiple Prisma clients in dev
- support Vercel serverless runtime safely

### 2. Product Intake API

Create one endpoint for user input:

- `POST /api/products/intake`

Responsibilities:

- accept product link or product name
- normalize URL
- identify market
- upsert `ProductMaster`
- upsert `ProductInputLink`
- create initial `Product` row with `PENDING` status if URL is known
- return job/status response

### 3. Source Product Collector

For the submitted URL:

- Kurly PLP: use `api.kurly.com/collection/v2/...`
- Kurly PDP: prefer HTML `__NEXT_DATA__` or `_next/data` fallback
- Danawa search: parse SSR HTML first

Save:

- `ScrapeTarget`
- `ScrapeRun`
- `ScrapedPage`
- source `Product`
- source `ProductAttribute`

### 4. OpenAI Product Structuring

After source product collection, call OpenAI with the collected product data.

Expected output:

- cleaned product name
- brand
- maker
- series
- model name/no
- category
- attributes
- benefits
- same-product search keywords
- related-product search keywords

Persist into:

- `ProductMaster`
- `ProductAttribute`
- `ProductAnalysis`

### 5. Danawa Search Jobs

Scheduled jobs should:

- find masters needing comparison
- search Danawa by `SAME_PRODUCT` keywords
- prefer Danawa catalog pages where many mall links are attached
- collect candidate links into `Product`
- create `ProductRelation` with `SAME_PRODUCT`

### 6. Recommendation Jobs

Scheduled jobs should:

- search by `RELATED_PRODUCT` keywords
- collect candidate products
- compare attributes, benefits, price, and name similarity
- reject same-product duplicates
- create `ProductRelation` with `RECOMMENDED_PRODUCT`

### 7. Matching and Scoring

Create a small scoring module before relying only on OpenAI:

- exact identifiers: barcode, modelNo, manufacturerCode
- strong text match: refinedName, brand, maker, series
- numeric match: volume, unitCount, unitPrice
- image/detail similarity later
- benefit comparison: free shipping, coupon, discount, bundle

OpenAI can explain and classify, but deterministic signals should drive the first pass.

### 8. Outbound Click Tracking

External product links should be routed through a click-tracking endpoint before redirecting.

Persist into `OutboundClick`:

- user
- master product
- clicked product
- market
- clicked URL
- UI source and position
- product title snapshot
- market name snapshot
- price, shipping fee, final price snapshot
- availability and seller snapshot

This preserves what the user saw at click time even if the product price changes later.

## UI Gaps

Current UI:

- chat input
- saved product tab
- simple price table
- same/similar recommendation cards

Needed UI changes:

### Chat

- show intake status, not just "analysis complete"
- states: `queued`, `collecting`, `analyzing`, `searching Danawa`, `ready`, `failed`
- allow URL paste and product-name search
- show source market when recognized

### Saved Products

Rename "자주 사는 상품" depending on final product language.

Candidate names:

- 저장한 상품
- 관리 상품
- 구매 후보
- 가격 추적 상품

This view should show:

- product master name
- source link
- main image
- current lowest price
- number of matched sellers/products
- recommendation count
- last updated time
- status badge

### Product Detail

Needed as a separate view or drawer:

- source product summary
- same-product price comparison table
- recommended products table/cards
- attribute comparison
- benefit comparison
- raw source links
- collection history

### Price Comparison

Table columns:

- market
- seller
- price
- shipping fee
- final price
- unit price
- coupon/benefit
- availability
- updatedAt
- link

### Attribute Comparison

Useful rows:

- brand
- maker
- series
- model
- volume
- unit count
- ingredients/material
- origin
- certification
- storage/use caution

### Recommendation Display

Recommended-product cards should explain:

- why recommended
- what is better
- what is worse
- price difference
- attribute differences
- confidence/similarity score

## Important Risks

- URL fetching needs SSRF protection before deployment.
- Market API response should not be returned raw to the client.
- Request policy fields exist but timeout, retry, and rate limit are not fully enforced.
- Danawa parser needs provider-specific implementation.
- Kurly PDP should parse product attributes from `__NEXT_DATA__` and only use `_next/data` as an optional fast path.
- Product matching should not depend only on product name; use maker/model/barcode/volume when available.

## Suggested Next Implementation Order

1. Add missing schema fields before first migration.
2. Create Prisma client wrapper.
3. Create `POST /api/products/intake`.
4. Save submitted link into `ProductInputLink`.
5. Create pending `ProductMaster` and source `Product`.
6. Implement Kurly PDP collector into DB.
7. Implement OpenAI structuring output schema.
8. Store attributes, benefits, and search keywords.
9. Implement Danawa search collector.
10. Build saved product list from DB.
11. Build product detail comparison UI.
