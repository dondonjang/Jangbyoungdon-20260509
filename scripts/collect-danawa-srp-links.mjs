import {
  DANAWA_MARKET_NAME,
  DANAWA_SEARCH_PARSER_VERSION,
  fetchDanawaSrp,
} from "../src/server/services/scrape/danawa-srp-collector.ts";

const databaseUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or DIRECT_URL is required.");
}

const masterId = readPositiveInt(process.argv[2], 0);
const query = process.argv[3];
const relationKind = process.argv[4] || "SAME_PRODUCT";

if (!masterId) {
  throw new Error(
    "Usage: bun scripts/collect-danawa-srp-links.mjs <masterId> <query> [relationKind]",
  );
}

if (!query?.trim()) {
  throw new Error("Danawa search query is required.");
}

const sql = new Bun.SQL(databaseUrl);

try {
  await ensureProductLinkIndexes();

  const [master] = await sql`
    select id
    from product_masters
    where id = ${masterId}
    limit 1
  `;

  if (!master) {
    throw new Error(`ProductMaster not found: ${masterId}`);
  }

  const result = await fetchDanawaSrp({ query });
  const products = uniqueByLinkIdentity(result.products);
  const startedAt = new Date();

  await sql`
    insert into scrape_logs (
      "marketName",
      "inputUrl",
      "finalUrl",
      "pageKind",
      source,
      status,
      "statusCode",
      "contentType",
      request,
      "responseMeta",
      html,
      "parserVersion",
      "startedAt",
      "finishedAt",
      "createdAt",
      "updatedAt"
    )
    values (
      ${DANAWA_MARKET_NAME},
      ${result.sourceUrl},
      ${result.finalUrl},
      ${"SRP"},
      ${"HTML"},
      ${"SUCCESS"},
      ${result.status},
      ${result.contentType},
      ${JSON.stringify({ masterId, query, relationKind })}::text::jsonb,
      ${JSON.stringify({
        productCount: result.products.length,
        uniqueLinkCount: products.length,
        adProductCount: result.products.filter((product) => product.isAd).length,
      })}::text::jsonb,
      ${result.html},
      ${DANAWA_SEARCH_PARSER_VERSION},
      ${startedAt},
      ${new Date()},
      ${new Date()},
      ${new Date()}
    )
  `;

  for (const product of products) {
    await upsertProductLink(masterId, query, relationKind, product);
  }

  console.log(
    JSON.stringify(
      {
        masterId,
        query,
        rawCount: result.products.length,
        uniqueLinkCount: products.length,
        adProductCount: result.products.filter((product) => product.isAd).length,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.close();
}

async function upsertProductLink(masterProductId, searchKeyword, kind, product) {
  if (!product.marketItemNo) {
    await upsertProductLinkWithoutItemNo(masterProductId, searchKeyword, kind, product);
    return;
  }

  await sql`
    insert into product_links (
      "masterId",
      "productId",
      "marketName",
      "marketProductNo",
      "marketItemNo",
      "linkType",
      "relationKind",
      "searchKeyword",
      "sourceUrl",
      name,
      "imageUrl",
      price,
      "isCatalog",
      "categoryName",
      "mallCount",
      "reviewCount",
      rating,
      summary,
      "listingOrder",
      "isAd",
      raw,
      "createdAt",
      "updatedAt"
    )
    values (
      ${masterProductId},
      ${null},
      ${DANAWA_MARKET_NAME},
      ${product.marketProductNo},
      ${product.marketItemNo},
      ${product.linkType},
      ${kind},
      ${searchKeyword},
      ${product.sourceUrl},
      ${product.name},
      ${product.imageUrl || null},
      ${product.price || null},
      ${product.isCatalog},
      ${product.categoryName},
      ${product.mallCount || null},
      ${product.reviewCount || null},
      ${product.rating},
      ${product.summary},
      ${product.listingOrder},
      ${product.isAd},
      ${JSON.stringify({
        categoryName: product.categoryName,
        mallCount: product.mallCount,
        reviewCount: product.reviewCount,
        rating: product.rating,
        summary: product.summary,
        isCatalog: product.isCatalog,
      })}::text::jsonb,
      ${new Date()},
      ${new Date()}
    )
    on conflict ("masterId", "marketName", "marketProductNo", "marketItemNo")
    do update set
      "linkType" = excluded."linkType",
      "relationKind" = excluded."relationKind",
      "searchKeyword" = excluded."searchKeyword",
      "sourceUrl" = excluded."sourceUrl",
      name = excluded.name,
      "imageUrl" = excluded."imageUrl",
      price = excluded.price,
      "isCatalog" = excluded."isCatalog",
      "categoryName" = excluded."categoryName",
      "mallCount" = excluded."mallCount",
      "reviewCount" = excluded."reviewCount",
      rating = excluded.rating,
      summary = excluded.summary,
      "listingOrder" = excluded."listingOrder",
      "isAd" = excluded."isAd",
      raw = excluded.raw,
      "updatedAt" = excluded."updatedAt"
  `;
}

async function upsertProductLinkWithoutItemNo(masterProductId, searchKeyword, kind, product) {
  await sql`
    insert into product_links (
      "masterId",
      "productId",
      "marketName",
      "marketProductNo",
      "marketItemNo",
      "linkType",
      "relationKind",
      "searchKeyword",
      "sourceUrl",
      name,
      "imageUrl",
      price,
      "isCatalog",
      "categoryName",
      "mallCount",
      "reviewCount",
      rating,
      summary,
      "listingOrder",
      "isAd",
      raw,
      "createdAt",
      "updatedAt"
    )
    values (
      ${masterProductId},
      ${null},
      ${DANAWA_MARKET_NAME},
      ${product.marketProductNo},
      ${null},
      ${product.linkType},
      ${kind},
      ${searchKeyword},
      ${product.sourceUrl},
      ${product.name},
      ${product.imageUrl || null},
      ${product.price || null},
      ${product.isCatalog},
      ${product.categoryName},
      ${product.mallCount || null},
      ${product.reviewCount || null},
      ${product.rating},
      ${product.summary},
      ${product.listingOrder},
      ${product.isAd},
      ${JSON.stringify({
        categoryName: product.categoryName,
        mallCount: product.mallCount,
        reviewCount: product.reviewCount,
        rating: product.rating,
        summary: product.summary,
        isCatalog: product.isCatalog,
      })}::text::jsonb,
      ${new Date()},
      ${new Date()}
    )
    on conflict ("masterId", "marketName", "marketProductNo")
    where "marketItemNo" is null
    do update set
      "linkType" = excluded."linkType",
      "relationKind" = excluded."relationKind",
      "searchKeyword" = excluded."searchKeyword",
      "sourceUrl" = excluded."sourceUrl",
      name = excluded.name,
      "imageUrl" = excluded."imageUrl",
      price = excluded.price,
      "isCatalog" = excluded."isCatalog",
      "categoryName" = excluded."categoryName",
      "mallCount" = excluded."mallCount",
      "reviewCount" = excluded."reviewCount",
      rating = excluded.rating,
      summary = excluded.summary,
      "listingOrder" = excluded."listingOrder",
      "isAd" = excluded."isAd",
      raw = excluded.raw,
      "updatedAt" = excluded."updatedAt"
  `;
}

async function ensureProductLinkIndexes() {
  await sql`
    create unique index if not exists product_links_null_item_unique
    on product_links ("masterId", "marketName", "marketProductNo")
    where "marketItemNo" is null
  `;
}

function uniqueByLinkIdentity(products) {
  const seen = new Set();

  return products.filter((product) => {
    const key = `${product.marketProductNo}:${product.marketItemNo || ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function readPositiveInt(value, fallback) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}
