import type {
  OtherUserInterestProductView,
  ProductLinkOfferView,
  ProductLinkView,
  SavedProductListPage,
  SavedProductView,
} from "@/lib/product-types";
import { Prisma } from "@/generated/prisma/client";
import { isAccessoryProductName } from "@/lib/product-rules";
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
  mallCode: string | null;
  mallName: string | null;
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
  raw: unknown;
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

type OtherUserInterestProductRow = {
  id: number;
  displayName: string;
  brand: string | null;
  summary: string | null;
  interestCount: number | bigint;
  lastInterestedAt: Date | string;
  sourceProductId: number | null;
  sourceMarketName: string | null;
  sourceMarketProductNo: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  sourceImageUrl: string | null;
  sourcePrice: number | null;
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

// 저장 상품 목록 화면이 필요한 페이지 정보와 총 개수를 함께 내려준다.
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

// 등록 직후 또는 단건 갱신 후 최신 화면 모델을 다시 조회한다.
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

// 마스터 목록에 가격비교 링크, 판매처 offer, 다른 사용자 관심 상품을 붙여 화면 모델로 만든다.
async function hydrateSavedProductViews(masters: MasterRow[]) {
  const masterIds = masters.map((master) => master.id);
  const links = await prisma.$queryRaw<ProductLinkRow[]>`
      select
        id,
        "masterId",
        "marketName",
        "marketProductNo",
        "marketItemNo",
        "mallCode",
        "mallName",
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
        raw,
        "listingOrder",
        "isAd"
      from product_links
      where "masterId" in (${Prisma.join(masterIds)})
      order by
        "masterId" asc,
        case when "relationKind" = 'SAME_PRODUCT' then 0 else 1 end,
        case
          when "relationKind" = 'RECOMMENDED_PRODUCT'
          then coalesce((raw->>'recommendationScore')::int, 0)
          else 0
        end desc,
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

  const otherUserInterestProducts = await listOtherUserInterestProducts();

  return masters.map((master) =>
    toSavedProductView(master, links, offers, otherUserInterestProducts),
  );
}

// DB row와 하위 링크 데이터를 프론트에서 바로 렌더링 가능한 SavedProductView로 변환한다.
function toSavedProductView(
  master: MasterRow,
  links: ProductLinkRow[],
  offers: ProductLinkOfferRow[],
  otherUserInterestProducts: OtherUserInterestProductView[],
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
      (link) => link.relationKind === "RECOMMENDED_PRODUCT" && isVisibleRecommendedLink(link),
    ),
    otherUserInterestProducts: otherUserInterestProducts
      .filter((product) => product.id !== master.id)
      .slice(0, 3),
    createdAt: toIsoString(master.createdAt),
    updatedAt: toIsoString(master.updatedAt),
  };
}

// 현재 기본 사용자를 제외하고 다른 사용자들이 많이 저장한 상품을 인기 후보로 가져온다.
async function listOtherUserInterestProducts(): Promise<OtherUserInterestProductView[]> {
  const rows = await prisma.$queryRaw<OtherUserInterestProductRow[]>`
      select
        m.id,
        m."displayName",
        m.brand,
        m.summary,
        count(up.id) as "interestCount",
        max(up."updatedAt") as "lastInterestedAt",
        p.id as "sourceProductId",
        p."marketName" as "sourceMarketName",
        p."marketProductNo" as "sourceMarketProductNo",
        p."sourceUrl",
        p.name as "sourceName",
        p."imageUrl" as "sourceImageUrl",
        p.price as "sourcePrice"
      from user_products up
      inner join product_masters m on m.id = up."masterId"
      left join lateral (
        select *
        from products
        where "masterId" = m.id
        order by id asc
        limit 1
      ) p on true
      where up."userId" <> ${DEFAULT_USER_ID}
        and up.status = 'ACTIVE'
      group by
        m.id,
        m."displayName",
        m.brand,
        m.summary,
        p.id,
        p."marketName",
        p."marketProductNo",
        p."sourceUrl",
        p.name,
        p."imageUrl",
        p.price
      order by "interestCount" desc, "lastInterestedAt" desc
      limit 30
    `;

  return rows.map(toOtherUserInterestProductView);
}

// 다른 사용자 관심 상품 row를 카드 렌더링에 필요한 최소 shape으로 변환한다.
function toOtherUserInterestProductView(
  row: OtherUserInterestProductRow,
): OtherUserInterestProductView {
  return {
    id: row.id,
    displayName: row.displayName,
    brand: row.brand,
    summary: row.summary,
    interestCount: Number(row.interestCount),
    sourceProduct: row.sourceProductId
      ? {
          id: row.sourceProductId,
          marketName: row.sourceMarketName || "",
          marketProductNo: row.sourceMarketProductNo || "",
          sourceUrl: row.sourceUrl || "",
          name: row.sourceName || row.displayName,
          imageUrl: row.sourceImageUrl || "",
          price: row.sourcePrice || 0,
        }
      : null,
    updatedAt: toIsoString(row.lastInterestedAt),
  };
}

// 다나와/외부 링크 row에 추천 점수와 offer 목록을 붙여 가격표/추천 링크 view로 만든다.
function toProductLinkView(row: ProductLinkRow, offers: ProductLinkOfferRow[]): ProductLinkView {
  const raw = parseJsonObject(row.raw);

  return {
    id: row.id,
    marketName: row.marketName,
    marketProductNo: row.marketProductNo,
    marketItemNo: row.marketItemNo,
    mallCode: row.mallCode,
    mallName: row.mallName,
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
    recommendationScore: readNullableNumber(raw.recommendationScore),
    recommendationTier: readNullableString(raw.recommendationTier),
    recommendationReasons: parseJsonArray(raw.recommendationReasons),
    listingOrder: row.listingOrder,
    isAd: row.isAd,
    offers: offers.filter((offer) => offer.parentLinkId === row.id).map(toProductLinkOfferView),
  };
}

// 추천 링크는 점수화가 끝났고 본품으로 볼 수 있는 후보만 화면에 노출한다.
function isVisibleRecommendedLink(link: ProductLinkView) {
  return Boolean(link.recommendationScore !== null && !isAccessoryProductName(link.name));
}

// raw JSON에서 숫자형 추천 점수만 안전하게 꺼낸다.
function readNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// raw JSON에서 비어 있지 않은 문자열 메타만 안전하게 꺼낸다.
function readNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

// 카탈로그 판매처 row를 가격 비교 테이블에 쓰기 쉬운 offer view로 변환한다.
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

// Prisma Json 또는 문자열 JSON을 화면에 쓰는 문자열 배열로 정규화한다.
function parseJsonArray(value: unknown): string[] {
  const parsed = parseJson(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

// Prisma Json 또는 문자열 JSON을 key-value 객체로 정규화한다.
function parseJsonObject(value: unknown) {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

// Postgres/Prisma에서 넘어온 JSON 표현 차이를 흡수한다.
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

// Date 또는 문자열 날짜를 API 응답용 ISO 문자열로 통일한다.
function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// 페이지 번호와 같은 양의 정수 옵션을 안전하게 보정한다.
function normalizePositiveInteger(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || !value) return fallback;
  return Math.max(1, Math.floor(value));
}

// 클라이언트 요청 pageSize가 과도하게 커지지 않도록 제한한다.
function normalizePageSize(value: number | undefined) {
  if (!Number.isFinite(value) || !value) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(value)));
}
