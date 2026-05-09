import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Image as ImageIcon,
  Star,
  ShoppingBag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FrequentProduct, ProductRecommendation } from "@/lib/product-types";
import { formatKRW } from "@/lib/product-types";

type Props = {
  products: FrequentProduct[];
  onGoToChat: () => void;
};

export function MyProductsTab({ products, onGoToChat }: Props) {
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
          동일 상품과 유사 추천 상품을 보여드려요
        </p>
        <Button onClick={onGoToChat} className="rounded-full">
          채팅 시작하기
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

function ProductCard({ product }: { product: FrequentProduct }) {
  const [recOpen, setRecOpen] = useState(true);
  const sorted = [...product.listings].sort(
    (a, b) => a.price + a.shipping - (b.price + b.shipping),
  );
  const lowestKey = sorted[0]?.shop;

  return (
    <article className="rounded-2xl bg-card border border-border shadow-sm overflow-hidden">
      {/* Section 1 */}
      <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-14 w-14 rounded-xl bg-secondary flex items-center justify-center shrink-0">
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-base">{product.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{product.summary}</p>
          </div>
        </div>

        {product.listings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            아직 비교 가능한 판매처가 없어요.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="font-medium py-2 px-2">쇼핑몰</th>
                  <th className="font-medium py-2 px-2 text-right">가격</th>
                  <th className="font-medium py-2 px-2 text-right">배송비</th>
                  <th className="font-medium py-2 px-2 text-right">링크</th>
                </tr>
              </thead>
              <tbody>
                {product.listings.map((l) => {
                  const isLowest = l.shop === lowestKey;
                  return (
                    <tr
                      key={l.shop}
                      className={`border-b border-border last:border-0 ${
                        isLowest ? "bg-success/10" : ""
                      }`}
                    >
                      <td className="py-3 px-2 font-medium">
                        <span className="flex items-center gap-2">
                          {l.shop}
                          {isLowest && (
                            <Badge className="bg-success text-success-foreground hover:bg-success rounded-full text-[10px] px-2 py-0 h-5">
                              최저가
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td
                        className={`py-3 px-2 text-right tabular-nums ${isLowest ? "font-bold text-success" : ""}`}
                      >
                        {formatKRW(l.price)}
                      </td>
                      <td className="py-3 px-2 text-right text-xs text-muted-foreground tabular-nums">
                        {l.shipping === 0 ? "무료" : formatKRW(l.shipping)}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <Button
                          size="sm"
                          variant={isLowest ? "default" : "outline"}
                          className="rounded-full h-8 text-xs"
                          asChild
                        >
                          <a
                            href={l.url}
                            target={l.url === "#" ? undefined : "_blank"}
                            rel="noreferrer"
                          >
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

      {/* Section 2 */}
      <div className="border-t border-border bg-secondary/30">
        <button
          type="button"
          onClick={() => setRecOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-left"
          aria-expanded={recOpen}
        >
          <span className="font-semibold text-sm">동일 상품 / 유사 추천 상품</span>
          {recOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        {recOpen && (
          <div className="px-5 pb-5">
            <RecommendationGroup title="동일 상품" recommendations={product.sameProducts} />
            <RecommendationGroup title="유사 추천 상품" recommendations={product.similarProducts} />
          </div>
        )}
      </div>
    </article>
  );
}

function RecommendationGroup({
  title,
  recommendations,
}: {
  title: string;
  recommendations: ProductRecommendation[];
}) {
  return (
    <section className="mb-5 last:mb-0">
      <h4 className="text-xs font-semibold text-muted-foreground mb-2">{title}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {recommendations.map((r) => (
          <div
            key={r.name}
            className="rounded-xl bg-card border border-border p-3 flex flex-col shadow-sm"
          >
            <div className="aspect-square rounded-lg bg-secondary flex items-center justify-center mb-3">
              <ImageIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <h5 className="text-sm font-medium leading-snug line-clamp-2 min-h-[2.5rem]">
              {r.name}
            </h5>
            <p className="text-base font-bold mt-1.5 tabular-nums">{formatKRW(r.price)}</p>
            <div className="flex items-center gap-1 mt-1">
              <Star className="h-3.5 w-3.5 fill-accent text-accent" />
              <span className="text-xs font-medium">{r.rating}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2 line-clamp-3 leading-relaxed flex-1">
              {r.reason || r.review}
            </p>
            <Button size="sm" variant="outline" className="rounded-full text-xs mt-3 w-full h-8">
              자세히 보기
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
