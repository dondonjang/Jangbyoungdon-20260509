import {
  DANAWA_CATALOG_PARSER_VERSION,
  DANAWA_MARKET_NAME,
  fetchDanawaCatalog,
} from "../src/server/services/scrape/danawa-catalog-collector.ts";

const databaseUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL or DIRECT_URL is required.");
}

const productLinkId = readPositiveInt(process.argv[2], 0);

if (!productLinkId) {
  throw new Error("Usage: bun scripts/collect-danawa-catalog-offers.mjs <productLinkId>");
}

const sql = new Bun.SQL(databaseUrl);

try {
  await ensureProductLinkOfferIndexes();

  const [parentLink] = await sql`
    select
      id,
      "masterId",
      "productId",
      "sourceUrl",
      name,
      "linkType"
    from product_links
    where id = ${productLinkId}
    limit 1
  `;

  if (!parentLink) {
    throw new Error(`ProductLink not found: ${productLinkId}`);
  }

  if (!String(parentLink.linkType).includes("CATALOG")) {
    throw new Error(`ProductLink is not a catalog link: ${productLinkId}`);
  }

  const startedAt = new Date();
  const result = await fetchDanawaCatalog({ catalogUrl: parentLink.sourceUrl });

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
      ${"CATALOG"},
      ${"HTML"},
      ${"SUCCESS"},
      ${result.status},
      ${result.contentType},
      ${JSON.stringify({ productLinkId, sourceUrl: parentLink.sourceUrl })}::text::jsonb,
      ${JSON.stringify({
        catalogProductNo: result.catalogProductNo,
        catalogName: result.catalogName,
        offerCount: result.offers.length,
      })}::text::jsonb,
      ${result.html},
      ${DANAWA_CATALOG_PARSER_VERSION},
      ${startedAt},
      ${new Date()},
      ${new Date()},
      ${new Date()}
    )
  `;

  for (const offer of result.offers) {
    await upsertProductLinkOffer(parentLink, offer);
  }

  console.log(
    JSON.stringify(
      {
        productLinkId,
        catalogProductNo: result.catalogProductNo,
        catalogName: result.catalogName,
        offerCount: result.offers.length,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.close();
}

async function upsertProductLinkOffer(parentLink, offer) {
  if (!offer.marketItemNo) {
    await upsertProductLinkOfferWithoutItemNo(parentLink, offer);
    return;
  }

  await sql`
    insert into product_link_offers (
      "masterId",
      "parentLinkId",
      "productId",
      "marketName",
      "marketProductNo",
      "marketItemNo",
      "mallName",
      "sellerName",
      "sourceUrl",
      name,
      "imageUrl",
      price,
      "shippingFee",
      "finalPrice",
      "deliveryText",
      availability,
      "listingOrder",
      "isAd",
      raw,
      "createdAt",
      "updatedAt"
    )
    values (
      ${parentLink.masterId},
      ${parentLink.id},
      ${null},
      ${offer.marketName},
      ${offer.marketProductNo},
      ${offer.marketItemNo},
      ${offer.mallName},
      ${offer.sellerName},
      ${offer.sourceUrl},
      ${offer.name},
      ${offer.imageUrl},
      ${offer.price || null},
      ${offer.shippingFee},
      ${offer.finalPrice},
      ${offer.deliveryText},
      ${offer.availability},
      ${offer.listingOrder},
      ${offer.isAd},
      ${JSON.stringify(offer.raw)}::text::jsonb,
      ${new Date()},
      ${new Date()}
    )
    on conflict ("parentLinkId", "marketName", "marketProductNo", "marketItemNo")
    do update set
      "masterId" = excluded."masterId",
      "productId" = excluded."productId",
      "mallName" = excluded."mallName",
      "sellerName" = excluded."sellerName",
      "sourceUrl" = excluded."sourceUrl",
      name = excluded.name,
      "imageUrl" = excluded."imageUrl",
      price = excluded.price,
      "shippingFee" = excluded."shippingFee",
      "finalPrice" = excluded."finalPrice",
      "deliveryText" = excluded."deliveryText",
      availability = excluded.availability,
      "listingOrder" = excluded."listingOrder",
      "isAd" = excluded."isAd",
      raw = excluded.raw,
      "updatedAt" = excluded."updatedAt"
  `;
}

async function upsertProductLinkOfferWithoutItemNo(parentLink, offer) {
  await sql`
    insert into product_link_offers (
      "masterId",
      "parentLinkId",
      "productId",
      "marketName",
      "marketProductNo",
      "marketItemNo",
      "mallName",
      "sellerName",
      "sourceUrl",
      name,
      "imageUrl",
      price,
      "shippingFee",
      "finalPrice",
      "deliveryText",
      availability,
      "listingOrder",
      "isAd",
      raw,
      "createdAt",
      "updatedAt"
    )
    values (
      ${parentLink.masterId},
      ${parentLink.id},
      ${null},
      ${offer.marketName},
      ${offer.marketProductNo},
      ${null},
      ${offer.mallName},
      ${offer.sellerName},
      ${offer.sourceUrl},
      ${offer.name},
      ${offer.imageUrl},
      ${offer.price || null},
      ${offer.shippingFee},
      ${offer.finalPrice},
      ${offer.deliveryText},
      ${offer.availability},
      ${offer.listingOrder},
      ${offer.isAd},
      ${JSON.stringify(offer.raw)}::text::jsonb,
      ${new Date()},
      ${new Date()}
    )
    on conflict ("parentLinkId", "marketName", "marketProductNo")
    where "marketItemNo" is null
    do update set
      "masterId" = excluded."masterId",
      "productId" = excluded."productId",
      "mallName" = excluded."mallName",
      "sellerName" = excluded."sellerName",
      "sourceUrl" = excluded."sourceUrl",
      name = excluded.name,
      "imageUrl" = excluded."imageUrl",
      price = excluded.price,
      "shippingFee" = excluded."shippingFee",
      "finalPrice" = excluded."finalPrice",
      "deliveryText" = excluded."deliveryText",
      availability = excluded.availability,
      "listingOrder" = excluded."listingOrder",
      "isAd" = excluded."isAd",
      raw = excluded.raw,
      "updatedAt" = excluded."updatedAt"
  `;
}

async function ensureProductLinkOfferIndexes() {
  await sql`
    create unique index if not exists product_link_offers_null_item_unique
    on product_link_offers ("parentLinkId", "marketName", "marketProductNo")
    where "marketItemNo" is null
  `;
}

function readPositiveInt(value, fallback) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}
