import type {
  ProductLinkOfferView,
  ProductLinkView,
  SavedProductListPage,
  SavedProductView,
} from "@/lib/product-types";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { DEFAULT_USER_ID } from "@/server/services/product/product-user";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

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
  isCatalog: boolean;
  categoryName: string | null;
  mallCount: number | null;
  reviewCount: number | null;
  rating: number | null;
  summary: string | null;
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

type SavedProductListOptions = {
  page?: number;
  pageSize?: number;
};

export async function listSavedProductViews(
  options: SavedProductListOptions = {},
): Promise<SavedProductView[]> {
  const page = normalizePositiveInteger(options.page, DEFAULT_PAGE);
  const pageSize = normalizePageSize(options.pageSize);
  const offset = (page - 1) * pageSize;
  const masters = await prisma.$queryRaw<MasterRow[]>`
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
      inner join user_products up on up."masterId" = m.id
      left join lateral (
        select *
        from products
        where "masterId" = m.id
        order by
          case when "marketName" = 'kurly' then 0 else 1 end,
          id asc
        limit 1
      ) p on true
      where up."userId" = ${DEFAULT_USER_ID}
        and up.status = 'ACTIVE'
      order by up."updatedAt" desc, up.id desc
      limit ${pageSize}
      offset ${offset}
    `;

  if (masters.length === 0) {
    return [];
  }

  return hydrateSavedProductViews(masters);
}

export async function listSavedProductViewPage(
  options: SavedProductListOptions = {},
): Promise<SavedProductListPage> {
  const page = normalizePositiveInteger(options.page, DEFAULT_PAGE);
  const pageSize = normalizePageSize(options.pageSize);
  const countRows = await prisma.$queryRaw<Array<{ count: number | bigint }>>`
      select count(*) as count
      from user_products up
      where up."userId" = ${DEFAULT_USER_ID}
        and up.status = 'ACTIVE'
    `;
  const totalCount = Number(countRows[0]?.count || 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const products = await listSavedProductViews({ page, pageSize });

  return {
    products,
    page,
    pageSize,
    totalCount,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export async function getSavedProductView(masterId: number): Promise<SavedProductView | null> {
  const masters = await prisma.$queryRaw<MasterRow[]>`
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
      where m.id = ${masterId}
      limit 1
    `;
  const products = await hydrateSavedProductViews(masters);
  return products[0] || null;
}

async function hydrateSavedProductViews(masters: MasterRow[]) {
  const masterIds = masters.map((master) => master.id);
  const links = await prisma.$queryRaw<ProductLinkRow[]>`
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
        "isCatalog",
        "categoryName",
        "mallCount",
        "reviewCount",
        rating,
        summary,
        "listingOrder",
        "isAd"
      from product_links
      where "masterId" in (${Prisma.join(masterIds)})
      order by
        "masterId" asc,
        case when "relationKind" = 'SAME_PRODUCT' then 0 else 1 end,
        "listingOrder" asc nulls last,
        id asc
    `;
  const linkIds = links.map((link) => link.id);
  const offers =
    linkIds.length > 0
      ? await prisma.$queryRaw<ProductLinkOfferRow[]>`
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
            where "parentLinkId" in (${Prisma.join(linkIds)})
            order by
              "parentLinkId" asc,
              "listingOrder" asc nulls last,
              id asc
          `
      : [];

  return masters.map((master) => toSavedProductView(master, links, offers));
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
    isCatalog: row.isCatalog,
    categoryName: row.categoryName,
    mallCount: row.mallCount,
    reviewCount: row.reviewCount,
    rating: row.rating,
    summary: row.summary,
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

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || !value) return fallback;
  return Math.max(1, Math.floor(value));
}

function normalizePageSize(value: number | undefined) {
  if (!Number.isFinite(value) || !value) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(value)));
}
