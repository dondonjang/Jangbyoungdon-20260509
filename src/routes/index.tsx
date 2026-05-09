import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChatTab } from "@/components/ChatTab";
import { AnalysisTab } from "@/components/AnalysisTab";
import type { FrequentProduct } from "@/lib/product-types";
import { analyzeFrequentProductFn, listFrequentProductsFn } from "@/lib/product-functions";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "장바구니 비서 - 똑똑한 쇼핑 도우미" },
      {
        name: "description",
        content:
          "상품 상세 링크를 분석해 자주 사는 상품을 저장하고, 동일 상품과 유사 추천 상품을 비교해드려요.",
      },
    ],
  }),
});

function Index() {
  const [tab, setTab] = useState<"chat" | "analysis">("chat");
  const [products, setProducts] = useState<FrequentProduct[]>([]);
  const listFrequentProducts = useServerFn(listFrequentProductsFn);
  const analyzeFrequentProduct = useServerFn(analyzeFrequentProductFn);

  async function loadFrequentProducts() {
    const savedProducts = await listFrequentProducts();
    setProducts(savedProducts);
  }

  useEffect(() => {
    void listFrequentProducts().then(setProducts);
  }, [listFrequentProducts]);

  function handleTabChange(value: string) {
    const nextTab = value as "chat" | "analysis";
    setTab(nextTab);
    if (nextTab === "analysis") {
      void loadFrequentProducts();
    }
  }

  async function handleAddProduct(value: string) {
    const product = await analyzeFrequentProduct({ data: { value } });
    setProducts((prev) => [product, ...prev.filter((p) => p.id !== product.id)]);
    return product.name;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto">
        <header className="px-4 pt-6 pb-3 flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center shadow-sm">
            <ShoppingBag className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">장바구니 비서</h1>
            <p className="text-xs text-muted-foreground">똑똑한 쇼핑 도우미</p>
          </div>
        </header>

        <Tabs value={tab} onValueChange={handleTabChange} className="w-full">
          <div className="px-4 sticky top-0 z-10 bg-background/90 backdrop-blur pt-2 pb-3">
            <TabsList className="grid grid-cols-2 w-full bg-secondary rounded-full h-11 p-1">
              <TabsTrigger
                value="chat"
                className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm text-sm font-medium"
              >
                채팅
              </TabsTrigger>
              <TabsTrigger
                value="analysis"
                className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-sm text-sm font-medium"
              >
                자주 사는 상품
                {products.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full bg-primary text-primary-foreground px-1">
                    {products.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="chat" className="mt-0">
            <ChatTab
              onAddProduct={handleAddProduct}
              onGoToAnalysis={() => handleTabChange("analysis")}
            />
          </TabsContent>
          <TabsContent value="analysis" className="mt-0">
            <AnalysisTab products={products} onGoToChat={() => setTab("chat")} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
