import type { ChatProductAnalyzeResult } from "@/lib/product-types";
import { prisma } from "@/server/db/prisma";
import { registerProductFromUserInput } from "@/server/services/product/product-registration-service";
import { getDefaultUser } from "@/server/services/product/product-user";

// 프론트의 채팅 등록 요청을 상품 등록 도메인 서비스로 위임한다.
export async function analyzeProductFromChat(value: string): Promise<ChatProductAnalyzeResult> {
  return registerProductFromUserInput(value);
}

// 사용자 저장 목록에서만 DELETED 상태로 내리고, 수집/분석 원본 데이터는 보존한다.
export async function softDeleteSavedProduct(masterId: number) {
  const user = await getDefaultUser();
  const result = await prisma.userProduct.updateMany({
    where: {
      userId: user.id,
      masterId,
      status: "ACTIVE",
    },
    data: {
      status: "DELETED",
      updatedAt: new Date(),
    },
  });

  return {
    ok: true,
    deletedCount: result.count,
  };
}
