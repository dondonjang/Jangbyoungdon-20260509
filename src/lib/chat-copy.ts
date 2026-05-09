export const CHAT_COPY = {
  analysisTitle: "생필품 장바구니 비서 분석중입니다",
  unsupportedProductUrl: "상품 상세 페이지 링크를 넣어주세요.",
  retryRequested:
    "개발 친구한테 재시도 요청을 했어요.\n완료 되면 다시 알려드릴게요.\n죄송 하지만 조금만 기다려 주세요.",
  welcome: {
    intro: "안녕하세요! 저는",
    assistantName: "생필품 장바구니 비서",
    suffix: "예요.",
    instruction: "상품 상세 페이지 링크를 보내주시면 분석해서 자주 사는 상품에 저장해둘게요.",
    promise: "반복 구매 스트레스를 줄여드립니다. 더 이상 시간 낭비하지마세요.",
    supportedMarket: "(현재는 마켓컬리 생필품만 지원을 하고 있어요)",
  },
  completion: {
    registeredSuffix: "상품이 등록 되었습니다.",
    trackingPromise:
      "이제 자주 사시는 상품의 최저가와 다른 사람들이 많이 사는 상품을 항상 추적해서 알려드리겠습니다.",
    action: "결과 보기",
  },
  input: {
    placeholder: "상품 상세 페이지 링크를 입력하세요",
    submitLabel: "전송",
  },
} as const;

export const CHAT_AGENT_ACTIVITY_LOGS = [
  {
    label: "상품을 확인 중입니다",
    detail: "링크에서 상품 페이지와 기본 정보를 확인하고 있어요.",
  },
  {
    label: "상품을 분석 중입니다.",
    detail: "OpenAI로 속성, 구성, 혜택 정보를 추출하고 있어요.",
  },
  {
    label: "상품의 검색 키워드를 분석 중입니다.",
    detail: "OpenAI로 최저가 추적에 필요한 검색 키워드를 정리하고 있어요.",
  },
] as const;
