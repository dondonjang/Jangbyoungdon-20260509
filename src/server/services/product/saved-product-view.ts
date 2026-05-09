import type { ProductLinkOfferView, ProductLinkView, SavedProductView } from "@/lib/product-types";
import { createSqlClient } from "@/server/db/sql";

type MasterRow = {
  id: number;
  displayName: string;
  refinedName: string | null;
  brand: string | null;
  summary: string | null;
  analysisStatus: string;
  sameKeywords: unknown;
  relatedKeywords: unknown;
  raw: unknown;
  createdAt: Date | string;
  updatedAt: Date | string;
  sourceProductId: number | null;
  sourceMarketName: string | null;
  sourceMarketProductNo: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  sourceImageUrl: string | null;
  sourcePrice: number | null;
};

type ProductLinkRow = {
  id: number;
  masterId: number;
  marketName: string;
  marketProductNo: string;
  marketItemNo: string | null;
  linkType: string;
  relationKind: string;
  searchKeyword: string | null;
  sourceUrl: string;
  name: string;
  imageUrl: string | null;
  price: number | null;
  listingOrder: number | null;
  isAd: boolean;
};

type ProductLinkOfferRow = {
  id: number;
  parentLinkId: number;
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

export async function listSavedProductViews(): Promise<SavedProductView[]> {
  const sql = createSqlClient();

  try {
    const masters = (await sql`
      select
        m.id,
        m."displayName",
        m."refinedName",
        m.brand,
        m.summary,
        m."analysisStatus",
        m."sameKeywords",
        m."relatedKeywords",
        m.raw,
        m."createdAt",
        m."updatedAt",
        p.id as "sourceProductId",
        p."marketName" as "sourceMarketName",
        p."marketProductNo" as "sourceMarketProductNo",
        p."sourceUrl",
        p.name as "sourceName",
        p."imageUrl" as "sourceImageUrl",
        p.price as "sourcePrice"
      from product_masters m
      left join lateral (
        select *
        from products
        where "masterId" = m.id
        order by
          case when "marketName" = 'kurly' then 0 else 1 end,
          id asc
        limit 1
      ) p on true
      order by m."updatedAt" desc
    `) as MasterRow[];

    if (masters.length === 0) {
      return [];
    }

    const masterIds = masters.map((master) => master.id).join(",");
    const links = (await sql`
      select
        id,
        "masterId",
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
        "listingOrder",
        "isAd"
      from product_links
      where "masterId" = any(string_to_array(${masterIds}, ',')::int[])
      order by
        "masterId" asc,
        case when "relationKind" = 'SAME_PRODUCT' then 0 else 1 end,
        "listingOrder" asc nulls last,
        id asc
    `) as ProductLinkRow[];
    const linkIds = links.map((link) => link.id).join(",");
    const offers =
      linkIds.length > 0
        ? ((await sql`
            select
              id,
              "parentLinkId",
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
              "isAd"
            from product_link_offers
            where "parentLinkId" = any(string_to_array(${linkIds}, ',')::int[])
            order by
              "parentLinkId" asc,
              "listingOrder" asc nulls last,
              id asc
          `) as ProductLinkOfferRow[])
        : [];

    return masters.map((master) => toSavedProductView(master, links, offers));
  } finally {
    await sql.close();
  }
}

export async function getSavedProductView(masterId: number): Promise<SavedProductView | null> {
  const products = await listSavedProductViews();
  return products.find((product) => product.id === masterId) || null;
}

function toSavedProductView(
  master: MasterRow,
  links: ProductLinkRow[],
  offers: ProductLinkOfferRow[],
): SavedProductView {
  const masterLinks = links
    .filter((link) => link.masterId === master.id)
    .map((link) => toProductLinkView(link, offers));
  const raw = parseJsonObject(master.raw);

  return {
    id: master.id,
    displayName: master.displayName,
    refinedName: master.refinedName,
    brand: master.brand,
    summary: master.summary,
    analysisStatus: master.analysisStatus,
    sameKeywords: parseJsonArray(master.sameKeywords),
    relatedKeywords: parseJsonArray(master.relatedKeywords),
    relatedCoreAttributes: parseJsonArray(raw.relatedCoreAttributes),
    sourceProduct: master.sourceProductId
      ? {
          id: master.sourceProductId,
          marketName: master.sourceMarketName || "",
          marketProductNo: master.sourceMarketProductNo || "",
          sourceUrl: master.sourceUrl || "",
          name: master.sourceName || master.displayName,
          imageUrl: master.sourceImageUrl || "",
          price: master.sourcePrice || 0,
        }
      : null,
    sameProductLinks: masterLinks.filter((link) => link.relationKind === "SAME_PRODUCT"),
    recommendedProductLinks: masterLinks.filter(
      (link) => link.relationKind === "RECOMMENDED_PRODUCT",
    ),
    createdAt: toIsoString(master.createdAt),
    updatedAt: toIsoString(master.updatedAt),
  };
}

function toProductLinkView(row: ProductLinkRow, offers: ProductLinkOfferRow[]): ProductLinkView {
  return {
    id: row.id,
    marketName: row.marketName,
    marketProductNo: row.marketProductNo,
    marketItemNo: row.marketItemNo,
    linkType: row.linkType,
    relationKind: row.relationKind,
    searchKeyword: row.searchKeyword,
    sourceUrl: row.sourceUrl,
    name: row.name,
    imageUrl: row.imageUrl,
    price: row.price,
    listingOrder: row.listingOrder,
    isAd: row.isAd,
    offers: offers.filter((offer) => offer.parentLinkId === row.id).map(toProductLinkOfferView),
  };
}

function toProductLinkOfferView(row: ProductLinkOfferRow): ProductLinkOfferView {
  return {
    id: row.id,
    marketName: row.marketName,
    marketProductNo: row.marketProductNo,
    marketItemNo: row.marketItemNo,
    mallName: row.mallName,
    sellerName: row.sellerName,
    sourceUrl: row.sourceUrl,
    name: row.name,
    imageUrl: row.imageUrl,
    price: row.price,
    shippingFee: row.shippingFee,
    finalPrice: row.finalPrice,
    deliveryText: row.deliveryText,
    availability: row.availability,
    listingOrder: row.listingOrder,
    isAd: row.isAd,
  };
}

function parseJsonArray(value: unknown): string[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function parseJsonObject(value: unknown) {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

function parseJson(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }

  return value;
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
