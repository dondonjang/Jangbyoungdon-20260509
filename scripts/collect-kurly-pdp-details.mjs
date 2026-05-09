import { PRODUCT_SCRAPE_STATUS } from "../src/lib/product-status.ts";
import {
  KURLY_MARKET_NAME,
  KURLY_PDP_PARSER_VERSION,
  buildKurlyPdpUrl,
  fetchKurlyPdp,
} from "../src/server/services/scrape/kurly-collector.ts";

const DEFAULT_LIMIT = 20;
const REQUEST_DELAY_MS = 250;
const databaseUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or DIRECT_URL is required.");
}

const limit = readLimit(process.argv[2], DEFAULT_LIMIT);
const sql = new Bun.SQL(databaseUrl);

try {
  const products = await sql`
    select id, "marketProductNo", "sourceUrl", name
    from products
    where "marketName" = ${KURLY_MARKET_NAME}
      and "scrapeStatus" <> ${PRODUCT_SCRAPE_STATUS.DETAIL_COLLECTED}
    order by id asc
    limit ${limit}
  `;

  console.log(`Collecting Kurly PDP details: ${products.length} product(s)`);

  let successCount = 0;
  let failCount = 0;

  for (const product of products) {
    const result = await collectProductDetail(product);

    if (result.ok) {
      successCount += 1;
      console.log(
        `OK ${product.marketProductNo} images=${result.descriptionImageCount} notices=${result.noticeItemCount}`,
      );
    } else {
      failCount += 1;
      console.log(`FAIL ${product.marketProductNo} ${result.errorMessage}`);
    }

    await sleep(REQUEST_DELAY_MS);
  }

  const counts = await sql`
    select "scrapeStatus", count(*)::int as count
    from products
    where "marketName" = ${KURLY_MARKET_NAME}
    group by "scrapeStatus"
    order by "scrapeStatus"
  `;

  console.log(JSON.stringify({ successCount, failCount, counts }, null, 2));
} finally {
  await sql.close();
}

async function collectProductDetail(product) {
  const startedAt = new Date();
  const sourceUrl = product.sourceUrl || buildKurlyPdpUrl(product.marketProductNo);

  try {
    const result = await fetchKurlyPdp(sourceUrl, product);
    const parsed = result.product;

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
        "responseMeta",
        html,
        "rawJson",
        "parserVersion",
        "startedAt",
        "finishedAt",
        "createdAt",
        "updatedAt"
      )
      values (
        ${KURLY_MARKET_NAME},
        ${sourceUrl},
        ${result.finalUrl},
        ${"PDP"},
        ${"HTML"},
        ${"SUCCESS"},
        ${result.status},
        ${result.contentType},
        ${JSON.stringify({
          productNo: parsed.marketProductNo,
          htmlLength: result.html.length,
          noticeItemCount: parsed.noticeItems.length,
          descriptionImageCount: parsed.descriptionImages.length,
        })}::text::jsonb,
        ${result.html},
        ${JSON.stringify(result.rawProduct)}::text::jsonb,
        ${KURLY_PDP_PARSER_VERSION},
        ${startedAt},
        ${new Date()},
        ${new Date()},
        ${new Date()}
      )
      returning id
    `;

    await sql`
      update products
      set
        "scrapeLogId" = ${log.id},
        name = ${parsed.name},
        "imageUrl" = ${parsed.imageUrl},
        price = ${parsed.price},
        "reviewCount" = ${parsed.reviewCount},
        rating = ${parsed.rating},
        summary = ${parsed.summary},
        description = ${parsed.description},
        "descriptionImages" = ${JSON.stringify(parsed.descriptionImages)}::text::jsonb,
        "noticeItems" = ${JSON.stringify(parsed.noticeItems)}::text::jsonb,
        "scrapeStatus" = ${PRODUCT_SCRAPE_STATUS.DETAIL_COLLECTED},
        "updatedAt" = ${new Date()}
      where id = ${product.id}
    `;

    return {
      ok: true,
      descriptionImageCount: parsed.descriptionImages.length,
      noticeItemCount: parsed.noticeItems.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await sql`
      insert into scrape_logs (
        "marketName",
        "inputUrl",
        "finalUrl",
        "pageKind",
        source,
        status,
        "errorMessage",
        "parserVersion",
        "startedAt",
        "finishedAt",
        "createdAt",
        "updatedAt"
      )
      values (
        ${KURLY_MARKET_NAME},
        ${sourceUrl},
        ${sourceUrl},
        ${"PDP"},
        ${"HTML"},
        ${"FAILED"},
        ${errorMessage},
        ${KURLY_PDP_PARSER_VERSION},
        ${startedAt},
        ${new Date()},
        ${new Date()},
        ${new Date()}
      )
    `;

    await sql`
      update products
      set "scrapeStatus" = ${PRODUCT_SCRAPE_STATUS.FAILED}, "updatedAt" = ${new Date()}
      where id = ${product.id}
    `;

    return { ok: false, errorMessage };
  }
}

function readLimit(value, fallback) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
