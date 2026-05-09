import { createHash } from "node:crypto";
import { createSqlClient } from "@/server/db/sql";

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
  const sql = createSqlClient();

  try {
    await sql`
      insert into ai_request_logs (
        provider,
        task,
        model,
        status,
        input,
        output,
        "errorMessage",
        "promptHash",
        "latencyMs",
        "responseMeta",
        "startedAt",
        "finishedAt",
        "createdAt",
        "updatedAt"
      )
      values (
        ${input.provider},
        ${input.task},
        ${input.model},
        ${input.status},
        ${JSON.stringify(input.input)}::jsonb,
        ${input.output === undefined ? null : JSON.stringify(input.output)}::jsonb,
        ${input.errorMessage || null},
        ${input.promptHash || null},
        ${input.latencyMs ?? null},
        ${input.responseMeta === undefined ? null : JSON.stringify(input.responseMeta)}::jsonb,
        ${input.startedAt},
        ${input.finishedAt || new Date()},
        ${new Date()},
        ${new Date()}
      )
    `;
  } finally {
    await sql.close();
  }
}

// 프롬프트 전문을 매번 비교하지 않고 버전 변화를 추적하기 위한 짧은 해시를 만든다.
export function createPromptHash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
