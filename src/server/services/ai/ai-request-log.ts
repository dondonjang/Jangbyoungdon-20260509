import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

type AiRequestLogInput = {
  provider: string;
  task: string;
  model: string;
  status: "SUCCESS" | "FAILED";
  input: unknown;
  output?: unknown;
  errorMessage?: string;
  promptHash?: string;
  latencyMs?: number;
  responseMeta?: unknown;
  startedAt: Date;
  finishedAt?: Date;
};

// provider가 바뀌어도 동일한 호출 로그 테이블을 쓰도록 AI 요청 기록을 공통화한다.
export async function saveAiRequestLog(input: AiRequestLogInput) {
  await prisma.aiRequestLog.create({
    data: {
      provider: input.provider,
      task: input.task,
      model: input.model,
      status: input.status,
      input: input.input as Prisma.InputJsonValue,
      output: input.output === undefined ? undefined : (input.output as Prisma.InputJsonValue),
      errorMessage: input.errorMessage || null,
      promptHash: input.promptHash || null,
      latencyMs: input.latencyMs ?? null,
      responseMeta:
        input.responseMeta === undefined
          ? undefined
          : (input.responseMeta as Prisma.InputJsonValue),
      startedAt: input.startedAt,
      finishedAt: input.finishedAt || new Date(),
    },
  });
}

// 프롬프트 전문을 매번 비교하지 않고 버전 변화를 추적하기 위한 짧은 해시를 만든다.
export function createPromptHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
