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
import type { ProductLinkOfferView, ProductLinkView, SavedProductView } from "@/lib/product-types";
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
          최저가와 유사 추천 상품을 보여드려요
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
  const priceRows = buildPriceRows(product);
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

        {priceRows.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            아직 비교 가능한 판매처가 없어요.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto -mx-2">
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
                {priceRows.map((row) => {
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
                          {row.isAd && (
                            <Badge variant="outline" className="rounded-full text-[10px] h-5 px-2">
                              광고
                            </Badge>
                          )}
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
        )}
      </div>

      <div className="border-t border-border bg-secondary/30">
        <button
          type="button"
          onClick={() => setRecOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left"
          aria-expanded={recOpen}
        >
          <span className="font-semibold text-sm">유사 추천 상품</span>
          {recOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {recOpen && (
          <div className="px-5 pb-5">
            <RecommendationGroup title="유사 추천 상품" links={product.recommendedProductLinks} />
          </div>
        )}
      </div>
    </article>
  );
}

function RecommendationGroup({ title, links }: { title: string; links: ProductLinkView[] }) {
  const visibleLinks = links.slice(0, 3);

  return (
    <section className="mb-5 last:mb-0">
      <h4 className="text-xs font-semibold text-muted-foreground mb-2">{title}</h4>
      {visibleLinks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          아직 추천 링크가 없어요.
        </div>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-3 md:gap-3 md:overflow-visible md:px-0 md:pb-0">
          <div className="flex snap-x snap-mandatory gap-3 md:contents">
            {visibleLinks.map((link) => (
              <div
                key={link.id}
                className="min-w-0 basis-[calc((100%-0.75rem)/2)] shrink-0 snap-start md:contents"
              >
                <RecommendationCard link={link} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function RecommendationCard({ link }: { link: ProductLinkView }) {
  const lowestOffer = findLowestOffer(link.offers);
  const price = lowestOffer?.finalPrice ?? lowestOffer?.price ?? link.price;
  const href = lowestOffer?.sourceUrl || link.sourceUrl;

  return (
    <div className="rounded-xl bg-card border border-border p-3 flex flex-col shadow-sm">
      <div className="aspect-square rounded-lg bg-secondary flex items-center justify-center mb-3 overflow-hidden">
        {link.imageUrl ? (
          <img src={link.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <ImageIcon className="h-7 w-7 text-muted-foreground" />
        )}
      </div>
      <h5 className="text-sm font-medium leading-snug line-clamp-2 min-h-[2.5rem]">{link.name}</h5>
      <p className="text-base font-bold mt-1.5 tabular-nums">
        {price === null ? "가격 확인 중" : formatKRW(price)}
      </p>
      <p className="text-xs text-muted-foreground mt-2 line-clamp-2 leading-relaxed flex-1">
        {lowestOffer
          ? `${lowestOffer.mallName} 기준 ${link.offers.length}개 판매처`
          : link.searchKeyword || link.linkType}
      </p>
      <Button size="sm" variant="outline" className="rounded-full text-xs mt-3 w-full h-8" asChild>
        <a href={href} target="_blank" rel="noreferrer">
          자세히 보기
        </a>
      </Button>
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
    shop: link.marketName,
    title: link.name,
    price: link.price,
    shippingFee: null,
    finalPrice: link.price,
    sourceUrl: link.sourceUrl,
    isAd: link.isAd,
    listingOrder: link.listingOrder,
  };
}

function findLowestOffer(offers: ProductLinkOfferView[]) {
  return [...offers].sort((a, b) => {
    const aPrice = a.finalPrice ?? a.price ?? Number.MAX_SAFE_INTEGER;
    const bPrice = b.finalPrice ?? b.price ?? Number.MAX_SAFE_INTEGER;
    return aPrice - bPrice;
  })[0];
}
