import { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  Image as ImageIcon,
  LoaderCircle,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MY_PRODUCTS_COPY } from "@/lib/my-products-copy";
import type {
  OtherUserInterestProductView,
  ProductLinkOfferView,
  ProductLinkView,
  SavedProductView,
} from "@/lib/product-types";
import { formatKRW } from "@/lib/product-types";

type Props = {
  products: SavedProductView[];
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onPageChange: (page: number) => void;
  onRemoveProduct: (masterId: number) => void;
  deletingProductIds: number[];
  onGoToChat: () => void;
};

type PriceRow = {
  id: string;
  shop: string;
  title: string;
  price: number | null;
  shippingFee: number | null;
  finalPrice: number | null;
  sourceUrl: string;
  isAd: boolean;
  listingOrder: number | null;
};

const PRICE_ROW_PREVIEW_COUNT = 5;
const POPULAR_PRODUCT_PREVIEW_COUNT = 3;

export function MyProductsTab({
  products,
  page,
  totalPages,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
  onRemoveProduct,
  deletingProductIds,
  onGoToChat,
}: Props) {
  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <div className="h-16 w-16 rounded-full bg-accent flex items-center justify-center mb-4">
          <ShoppingBag className="h-7 w-7 text-accent-foreground" />
        </div>
        <h2 className="text-lg font-semibold mb-2">아직 자주 사는 상품이 없어요</h2>
        <p className="text-sm text-muted-foreground mb-5 max-w-sm">
          채팅 탭에서 상품 상세 페이지 링크를 보내주시면
          <br />
          최저가와 인기 상품을 보여드려요
        </p>
        <Button onClick={onGoToChat} className="rounded-full">
          채팅 시작하기
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          isDeleting={deletingProductIds.includes(product.id)}
          onRemoveProduct={onRemoveProduct}
        />
      ))}
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={!hasPreviousPage}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          이전
        </Button>
        <span className="min-w-16 text-center text-xs text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={!hasNextPage}
          onClick={() => onPageChange(page + 1)}
        >
          다음
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ProductCard({
  product,
  isDeleting,
  onRemoveProduct,
}: {
  product: SavedProductView;
  isDeleting: boolean;
  onRemoveProduct: (masterId: number) => void;
}) {
  const [recOpen, setRecOpen] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const hasPriceComparisonData = product.sameProductLinks.length > 0;
  const priceRows = buildPriceRows(product);
  const hiddenPriceRowCount = Math.max(0, priceRows.length - PRICE_ROW_PREVIEW_COUNT);
  const visiblePriceRows = priceOpen ? priceRows : priceRows.slice(0, PRICE_ROW_PREVIEW_COUNT);
  const lowestFinalPrice = Math.min(
    ...priceRows
      .map((row) => row.finalPrice ?? row.price)
      .filter((price): price is number => typeof price === "number"),
  );

  return (
    <article className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="h-14 w-14 rounded-xl bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
            {product.sourceProduct?.imageUrl ? (
              <img
                src={product.sourceProduct.imageUrl}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-base leading-snug">{product.displayName}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {product.summary || product.relatedCoreAttributes.join(", ") || "분석 대기 중"}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={MY_PRODUCTS_COPY.delete.ariaLabel(product.displayName)}
            disabled={isDeleting}
            title={
              isDeleting ? MY_PRODUCTS_COPY.delete.pendingLabel : MY_PRODUCTS_COPY.delete.label
            }
            onClick={() => setConfirmingDelete(true)}
          >
            {isDeleting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>

        {confirmingDelete && (
          <div className="mb-4 mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <Trash2 className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{MY_PRODUCTS_COPY.delete.confirmTitle}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {MY_PRODUCTS_COPY.delete.confirmDescription}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    disabled={isDeleting}
                    onClick={() => {
                      setConfirmingDelete(false);
                      onRemoveProduct(product.id);
                    }}
                  >
                    {isDeleting && <LoaderCircle className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    {MY_PRODUCTS_COPY.delete.confirmLabel}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-full px-3 text-xs"
                    disabled={isDeleting}
                    onClick={() => setConfirmingDelete(false)}
                  >
                    {MY_PRODUCTS_COPY.delete.cancelLabel}
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:bg-background"
                disabled={isDeleting}
                aria-label={MY_PRODUCTS_COPY.delete.cancelLabel}
                onClick={() => setConfirmingDelete(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {!hasPriceComparisonData ? (
          <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            가격비교 상품을 수집 중입니다.
          </div>
        ) : (
          <div className="mt-4">
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="font-medium py-2 px-2">쇼핑몰</th>
                    <th className="font-medium py-2 px-2">상품명</th>
                    <th className="font-medium py-2 px-2 text-right">최종가</th>
                    <th className="font-medium py-2 px-2 text-right">링크</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePriceRows.map((row) => {
                    const comparePrice = row.finalPrice ?? row.price;
                    const isLowest = comparePrice !== null && comparePrice === lowestFinalPrice;

                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-border last:border-0 ${
                          isLowest ? "bg-success/10" : ""
                        }`}
                      >
                        <td className="py-3 px-2 font-medium whitespace-nowrap">
                          <span className="flex items-center gap-2">
                            {row.shop}
                            {isLowest && (
                              <Badge className="bg-success text-success-foreground hover:bg-success rounded-full text-[10px] h-5 px-2">
                                최저가
                              </Badge>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-2 min-w-[180px]">
                          <p className="line-clamp-2 text-xs leading-relaxed">{row.title}</p>
                        </td>
                        <td
                          className={`py-3 px-2 text-right tabular-nums whitespace-nowrap ${
                            isLowest ? "font-bold text-success" : ""
                          }`}
                        >
                          {comparePrice === null ? "-" : formatKRW(comparePrice)}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <Button
                            size="sm"
                            variant={isLowest ? "default" : "outline"}
                            className="rounded-full h-8 text-xs"
                            asChild
                          >
                            <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                              구매하기 <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {hiddenPriceRowCount > 0 && (
              <div className="mt-3 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full px-4 text-xs"
                  onClick={() => setPriceOpen((open) => !open)}
                  aria-expanded={priceOpen}
                >
                  {priceOpen ? (
                    <>
                      접기 <ChevronUp className="ml-1 h-3.5 w-3.5" />
                    </>
                  ) : (
                    <>
                      판매처 {hiddenPriceRowCount}개 더보기
                      <ChevronDown className="ml-1 h-3.5 w-3.5" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-secondary/30">
        <button
          type="button"
          onClick={() => setRecOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left"
          aria-expanded={recOpen}
        >
          <span className="font-semibold text-sm">많이 찾는 유사 상품</span>
          {recOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {recOpen && (
          <div className="px-5 pb-5">
            <PopularProductGroup products={product.otherUserInterestProducts} />
          </div>
        )}
      </div>
    </article>
  );
}

function PopularProductGroup({ products }: { products: OtherUserInterestProductView[] }) {
  // API 호환상 OtherUserInterestProductView 타입을 쓰지만, 현재 화면 의미는 상품별 유사 추천 후보이다.
  const visibleProducts = products.slice(0, POPULAR_PRODUCT_PREVIEW_COUNT);

  if (visibleProducts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
        유사 상품을 분석 중입니다.
      </div>
    );
  }

  return (
    <section>
      <div className="grid gap-3 sm:grid-cols-2">
        {visibleProducts.map((product) => (
          <PopularProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}

function PopularProductCard({ product }: { product: OtherUserInterestProductView }) {
  const source = product.sourceProduct;

  return (
    <div className="rounded-xl bg-card border border-border p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-secondary flex items-center justify-center">
          {source?.imageUrl ? (
            <img
              src={source.imageUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <ImageIcon className="h-7 w-7 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Badge className="h-5 rounded-full px-2 text-[10px]">
              관심 {product.interestCount.toLocaleString("ko-KR")}명
            </Badge>
          </div>
          <h5 className="line-clamp-2 text-sm font-medium leading-snug">{product.displayName}</h5>
          <p className="mt-1 text-sm font-bold tabular-nums">
            {source ? formatKRW(source.price) : "가격 확인 중"}
          </p>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {product.summary || product.brand || "비슷한 조건으로 많이 찾는 상품"}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">
          {source?.marketName || "관심 상품"}
        </span>
        {source && (
          <Button size="sm" variant="outline" className="h-8 rounded-full px-3 text-xs" asChild>
            <a href={source.sourceUrl} target="_blank" rel="noreferrer">
              보기
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
function buildPriceRows(product: SavedProductView): PriceRow[] {
  const sourceRows: PriceRow[] = product.sourceProduct
    ? [
        {
          id: `source-${product.sourceProduct.id}`,
          shop: product.sourceProduct.marketName,
          title: product.sourceProduct.name,
          price: product.sourceProduct.price,
          shippingFee: null,
          finalPrice: product.sourceProduct.price,
          sourceUrl: product.sourceProduct.sourceUrl,
          isAd: false,
          listingOrder: 0,
        },
      ]
    : [];
  const offerRows = product.sameProductLinks.flatMap((link) =>
    link.offers.length > 0
      ? link.offers.map((offer) => toOfferPriceRow(link, offer))
      : [toLinkPriceRow(link)],
  );

  return [...sourceRows, ...offerRows].sort((a, b) => {
    const aPrice = a.finalPrice ?? a.price ?? Number.MAX_SAFE_INTEGER;
    const bPrice = b.finalPrice ?? b.price ?? Number.MAX_SAFE_INTEGER;
    return aPrice - bPrice || (a.listingOrder ?? 9999) - (b.listingOrder ?? 9999);
  });
}

function toOfferPriceRow(link: ProductLinkView, offer: ProductLinkOfferView): PriceRow {
  return {
    id: `offer-${offer.id}`,
    shop: offer.mallName || offer.marketName,
    title: offer.name || link.name,
    price: offer.price,
    shippingFee: offer.shippingFee,
    finalPrice: offer.finalPrice ?? offer.price,
    sourceUrl: offer.sourceUrl,
    isAd: offer.isAd || link.isAd,
    listingOrder: offer.listingOrder,
  };
}

function toLinkPriceRow(link: ProductLinkView): PriceRow {
  return {
    id: `link-${link.id}`,
    shop: link.mallName || link.marketName,
    title: link.name,
    price: link.price,
    shippingFee: null,
    finalPrice: link.price,
    sourceUrl: link.sourceUrl,
    isAd: link.isAd,
    listingOrder: link.listingOrder,
  };
}
