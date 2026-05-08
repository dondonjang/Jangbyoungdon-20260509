import type { FrequentProduct } from "@/lib/product-types";

export type FrequentProductsRepository = {
  list(): Promise<FrequentProduct[]>;
  save(product: FrequentProduct): Promise<FrequentProduct>;
  remove(id: string): Promise<void>;
};

const products = new Map<string, FrequentProduct>();

export const inMemoryFrequentProductsRepository: FrequentProductsRepository = {
  async list() {
    return [...products.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async save(product) {
    products.set(product.id, product);
    return product;
  },
  async remove(id) {
    products.delete(id);
  },
};
