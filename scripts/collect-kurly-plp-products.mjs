import { PRODUCT_SCRAPE_STATUS } from "../src/lib/product-status.ts";
import {
  KURLY_DEFAULT_CATEGORY_NAME,
  KURLY_DEFAULT_CATEGORY_NO,
  KURLY_DEFAULT_PER_PAGE,
  KURLY_DEFAULT_SORT_TYPE,
  KURLY_MARKET_NAME,
  KURLY_PLP_PARSER_VERSION,
  fetchKurlyPlp,
  readKurlySortTypes,
} from "../src/server/services/scrape/kurly-collector.ts";

const databaseUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or DIRECT_URL is required.");
}

const startPage = readPositiveInt(process.argv[2], 1);
const pageCount = readPositiveInt(process.argv[3], 1);
const sortTypes = readKurlySortTypes(process.argv[4]);
const sql = new Bun.SQL(databaseUrl);

try {
  let totalUpserted = 0;

  for (const sortType of sortTypes) {
    for (let offset = 0; offset < pageCount; offset += 1) {
      const page = startPage + offset;
      const result = await collectPage(page, sortType);
      totalUpserted += result.upsertedCount;

      console.log(
        `OK sort=${result.sortName} page=${page} products=${result.upsertedCount} order=${result.firstOrder}-${result.lastOrder}`,
      );
    }
  }

  const stats = await sql`
    select
      count(*)::int as total,
      count(*) filter (where "listingOrder" is not null)::int as ordered,
      min("listingOrder")::int as first_order,
      max("listingOrder")::int as last_order
    from products
    where "marketName" = ${KURLY_MARKET_NAME}
  `;
  const listingStats = await sql`
    select "sortType", "sortName", count(*)::int as count
    from product_listings
    where "marketName" = ${KURLY_MARKET_NAME}
      and "categoryNo" = ${KURLY_DEFAULT_CATEGORY_NO}
    group by "sortType", "sortName"
    order by "sortType"
  `;

  console.log(JSON.stringify({ totalUpserted, stats: stats[0], listingStats }, null, 2));
} finally {
  await sql.close();
}

async function collectPage(page, sortType) {
  const startedAt = new Date();
  const result = await fetchKurlyPlp({
    categoryNo: KURLY_DEFAULT_CATEGORY_NO,
    categoryName: KURLY_DEFAULT_CATEGORY_NAME,
    page,
    perPage: KURLY_DEFAULT_PER_PAGE,
    sortType,
  });

  const [log] = await sql`
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
      "rawJson",
      "parserVersion",
      "startedAt",
      "finishedAt",
      "createdAt",
      "updatedAt"
    )
    values (
      ${KURLY_MARKET_NAME},
      ${result.sourceUrl},
      ${result.apiUrl},
      ${"PLP"},
      ${"MARKET_API"},
      ${"SUCCESS"},
      ${result.status},
      ${result.contentType},
      ${JSON.stringify({
        categoryNo: KURLY_DEFAULT_CATEGORY_NO,
        categoryName: KURLY_DEFAULT_CATEGORY_NAME,
        page,
        perPage: KURLY_DEFAULT_PER_PAGE,
        sortType,
        sortName: result.sortName,
      })}::text::jsonb,
      ${JSON.stringify({
        productCount: result.products.length,
        firstOrder: result.products[0]?.listingOrder ?? null,
      })}::text::jsonb,
      ${JSON.stringify(result.rawJson)}::text::jsonb,
      ${KURLY_PLP_PARSER_VERSION},
      ${startedAt},
      ${new Date()},
      ${new Date()},
      ${new Date()}
    )
    returning id
  `;

  for (const product of result.products) {
    const isDefaultSort = sortType === KURLY_DEFAULT_SORT_TYPE;

    await upsertProduct(log.id, product, isDefaultSort);
    await upsertListing(log.id, product, sortType, result.sortName);
  }

  return {
    upsertedCount: result.products.length,
    sortName: result.sortName,
    firstOrder: result.products[0]?.listingOrder ?? null,
    lastOrder: result.products.at(-1)?.listingOrder ?? null,
  };
}

async function upsertProduct(scrapeLogId, product, isDefaultSort) {
  await sql`
    insert into products (
      "scrapeLogId",
      "marketName",
      "marketProductNo",
      "marketItemNo",
      "sourceUrl",
      name,
      "imageUrl",
      price,
      "listingPage",
      "listingOrder",
      "reviewCount",
      rating,
      summary,
      "scrapeStatus",
      "createdAt",
      "updatedAt"
    )
    values (
      ${scrapeLogId},
      ${KURLY_MARKET_NAME},
      ${product.marketProductNo},
      ${product.marketItemNo},
      ${product.sourceUrl},
      ${product.name},
      ${product.imageUrl},
      ${product.price},
      ${isDefaultSort ? product.listingPage : null},
      ${isDefaultSort ? product.listingOrder : null},
      ${product.reviewCount},
      ${product.rating},
      ${product.summary},
      ${PRODUCT_SCRAPE_STATUS.LIST_COLLECTED},
      ${new Date()},
      ${new Date()}
    )
    on conflict ("marketName", "marketProductNo")
    do update set
      "scrapeLogId" = excluded."scrapeLogId",
      "marketItemNo" = excluded."marketItemNo",
      "sourceUrl" = excluded."sourceUrl",
      name = excluded.name,
      "imageUrl" = excluded."imageUrl",
      price = excluded.price,
      "listingPage" = case
        when ${isDefaultSort} then excluded."listingPage"
        else products."listingPage"
      end,
      "listingOrder" = case
        when ${isDefaultSort} then excluded."listingOrder"
        else products."listingOrder"
      end,
      "reviewCount" = excluded."reviewCount",
      rating = excluded.rating,
      summary = excluded.summary,
      "scrapeStatus" = case
        when products."scrapeStatus" = ${PRODUCT_SCRAPE_STATUS.DETAIL_COLLECTED}
          then products."scrapeStatus"
        else excluded."scrapeStatus"
      end,
      "updatedAt" = excluded."updatedAt"
  `;
}

async function upsertListing(scrapeLogId, product, sortType, sortName) {
  await sql`
    insert into product_listings (
      "productId",
      "scrapeLogId",
      "marketName",
      "categoryNo",
      "categoryName",
      "sortType",
      "sortName",
      page,
      "perPage",
      "pageOrder",
      "listingOrder",
      "marketProductNo",
      "sourceUrl",
      name,
      price,
      "createdAt",
      "updatedAt"
    )
    values (
      (
        select id
        from products
        where "marketName" = ${KURLY_MARKET_NAME}
          and "marketProductNo" = ${product.marketProductNo}
      ),
      ${scrapeLogId},
      ${KURLY_MARKET_NAME},
      ${KURLY_DEFAULT_CATEGORY_NO},
      ${KURLY_DEFAULT_CATEGORY_NAME},
      ${sortType},
      ${sortName},
      ${product.listingPage},
      ${KURLY_DEFAULT_PER_PAGE},
      ${((product.listingOrder - 1) % KURLY_DEFAULT_PER_PAGE) + 1},
      ${product.listingOrder},
      ${product.marketProductNo},
      ${product.sourceUrl},
      ${product.name},
      ${product.price},
      ${new Date()},
      ${new Date()}
    )
    on conflict ("marketName", "categoryNo", "sortType", "marketProductNo")
    do update set
      "productId" = excluded."productId",
      "scrapeLogId" = excluded."scrapeLogId",
      "sortName" = excluded."sortName",
      page = excluded.page,
      "perPage" = excluded."perPage",
      "pageOrder" = excluded."pageOrder",
      "listingOrder" = excluded."listingOrder",
      "sourceUrl" = excluded."sourceUrl",
      name = excluded.name,
      price = excluded.price,
      "updatedAt" = excluded."updatedAt"
  `;
}

function readPositiveInt(value, fallback) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}
