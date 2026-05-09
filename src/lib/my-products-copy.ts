export const MY_PRODUCTS_COPY = {
  delete: {
    label: "삭제",
    pendingLabel: "삭제 중",
    confirmTitle: "자주 사는 상품에서 삭제할까요?",
    confirmDescription:
      "삭제해도 상품 수집 기록은 보존되고, 내 자주 사는 상품 목록에서만 사라져요.",
    cancelLabel: "취소",
    confirmLabel: "삭제하기",
    ariaLabel: (productName: string) => `${productName} 삭제`,
  },
} as const;
