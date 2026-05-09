import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { MessageCircle, ShoppingBag } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChatTab } from "@/components/ChatTab";
import { MyProductsTab } from "@/components/MyProductsTab";
import { MOCK_SAVED_PRODUCT_PAGE } from "@/lib/mock-products";
import type { SavedProductListPage } from "@/lib/product-types";
import {
  analyzeChatProductFn,
  listSavedProductViewPageFn,
  softDeleteSavedProductFn,
} from "@/lib/product-functions";

const DEFAULT_PRODUCT_PAGE: SavedProductListPage = {
  products: [],
  page: 1,
  pageSize: 10,
  totalCount: 0,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

type AppTab = "chat" | "myProducts";

function normalizeTab(value: unknown): AppTab {
  return value === "myProducts" ? "myProducts" : "chat";
}

export const Route = createFileRoute("/")({
  validateSearch: (search) => ({
    tab: normalizeTab(search.tab),
  }),
  component: Index,
  head: () => ({
    meta: [
      { title: "생필품 장바구니 비서" },
      {
        name: "description",
        content: "반복 구매 스트레스를 줄여드립니다. 더 이상 시간 낭비하지마세요.",
      },
    ],
  }),
});

function Index() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [productPage, setProductPage] = useState<SavedProductListPage>(DEFAULT_PRODUCT_PAGE);
  const [deletingProductIds, setDeletingProductIds] = useState<number[]>([]);
  const listSavedProducts = useServerFn(listSavedProductViewPageFn);
  const analyzeChatProduct = useServerFn(analyzeChatProductFn);
  const softDeleteSavedProduct = useServerFn(softDeleteSavedProductFn);

  const loadSavedProducts = useCallback(
    async (page: number) => {
      try {
        const savedProducts = await listSavedProducts({
          data: { page, pageSize: productPage.pageSize },
        });
        setProductPage(savedProducts);
      } catch {
        setProductPage(MOCK_SAVED_PRODUCT_PAGE);
      }
    },
    [listSavedProducts, productPage.pageSize],
  );

  useEffect(() => {
    void listSavedProducts({ data: { page: 1, pageSize: DEFAULT_PRODUCT_PAGE.pageSize } })
      .then(setProductPage)
      .catch(() => setProductPage(MOCK_SAVED_PRODUCT_PAGE));
  }, [listSavedProducts]);

  useEffect(() => {
    if (tab === "myProducts") {
      void loadSavedProducts(productPage.page);
    }
  }, [loadSavedProducts, productPage.page, tab]);

  function handleTabChange(value: string) {
    const nextTab = normalizeTab(value);
    void navigate({ search: { tab: nextTab } });
  }

  async function handleAddProduct(value: string) {
    const result = await analyzeChatProduct({ data: { value } });
    await loadSavedProducts(1);
    return result.product.displayName;
  }

  async function handleRemoveProduct(masterId: number) {
    if (deletingProductIds.includes(masterId)) return;

    const previousPage = productPage;
    setDeletingProductIds((ids) => [...ids, masterId]);
    setProductPage((page) => removeProductFromPage(page, masterId));

    try {
      await softDeleteSavedProduct({ data: { masterId } });
    } catch {
      setProductPage(previousPage);
    } finally {
      setDeletingProductIds((ids) => ids.filter((id) => id !== masterId));
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto">
        <header className="px-4 pt-6 pb-3 flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center shadow-sm">
            <ShoppingBag className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">생필품 장바구니 비서</h1>
            <p className="text-xs text-muted-foreground">
              반복 구매 스트레스를 줄여드립니다. 더 이상 시간 낭비하지마세요.
            </p>
          </div>
        </header>

        <Tabs value={tab} onValueChange={handleTabChange} className="w-full pb-24 md:pb-0">
          <div className="sticky top-0 z-10 hidden bg-background/90 px-4 pb-3 pt-2 backdrop-blur md:block">
            <MainTabsList totalCount={productPage.totalCount} />
          </div>

          <TabsContent value="chat" className="mt-0">
            <ChatTab
              onAddProduct={handleAddProduct}
              onGoToMyProducts={() => handleTabChange("myProducts")}
            />
          </TabsContent>
          <TabsContent value="myProducts" className="mt-0">
            <MyProductsTab
              products={productPage.products}
              page={productPage.page}
              totalPages={productPage.totalPages}
              hasNextPage={productPage.hasNextPage}
              hasPreviousPage={productPage.hasPreviousPage}
              onPageChange={(page) => void loadSavedProducts(page)}
              onRemoveProduct={(masterId) => void handleRemoveProduct(masterId)}
              deletingProductIds={deletingProductIds}
              onGoToChat={() => handleTabChange("chat")}
            />
          </TabsContent>

          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 shadow-[0_-10px_30px_-24px_oklch(0_0_0/0.45)] backdrop-blur md:hidden">
            <MobileTabsList totalCount={productPage.totalCount} />
          </div>
        </Tabs>
      </div>
    </div>
  );
}

function removeProductFromPage(page: SavedProductListPage, masterId: number): SavedProductListPage {
  const products = page.products.filter((product) => product.id !== masterId);
  const removedCount = products.length === page.products.length ? 0 : 1;
  const totalCount = Math.max(0, page.totalCount - removedCount);
  const totalPages = Math.max(1, Math.ceil(totalCount / page.pageSize));

  return {
    ...page,
    products,
    totalCount,
    totalPages,
    hasNextPage: page.page < totalPages,
    hasPreviousPage: page.page > 1,
  };
}

function MainTabsList({ totalCount }: { totalCount: number }) {
  return (
    <TabsList className="grid h-11 w-full grid-cols-2 rounded-full bg-secondary p-1">
      <TabsTrigger
        value="chat"
        className="rounded-full text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm"
      >
        채팅
      </TabsTrigger>
      <TabsTrigger
        value="myProducts"
        className="rounded-full text-sm font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm"
      >
        자주 사는 상품
        {totalCount > 0 && (
          <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {totalCount}
          </span>
        )}
      </TabsTrigger>
    </TabsList>
  );
}

function MobileTabsList({ totalCount }: { totalCount: number }) {
  return (
    <TabsList className="mx-auto grid h-14 max-w-3xl grid-cols-2 bg-transparent p-0 text-muted-foreground">
      <TabsTrigger
        value="chat"
        className="h-full rounded-none bg-transparent px-2 py-1 text-xs font-medium shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
      >
        <span className="flex flex-col items-center gap-1">
          <MessageCircle className="h-5 w-5" />
          채팅
        </span>
      </TabsTrigger>
      <TabsTrigger
        value="myProducts"
        className="h-full rounded-none bg-transparent px-2 py-1 text-xs font-medium shadow-none data-[state=active]:bg-transparent data-[state=active]:text-primary data-[state=active]:shadow-none"
      >
        <span className="relative flex flex-col items-center gap-1">
          <ShoppingBag className="h-5 w-5" />
          자주 사는 상품
          {totalCount > 0 && (
            <span className="absolute -right-3 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
              {totalCount}
            </span>
          )}
        </span>
      </TabsTrigger>
    </TabsList>
  );
}
