export class CronUnauthorizedError extends Error {
  constructor() {
    super("크론 실행 권한이 없습니다.");
    this.name = "CronUnauthorizedError";
  }
}

// Vercel Cron 또는 수동 실행 시 공유하는 간단한 Bearer 인증 검사다.
export function assertCronRequestAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return;
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    throw new CronUnauthorizedError();
  }
}

export function readCronNumberParam(request: Request, key: string) {
  const value = new URL(request.url).searchParams.get(key);
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : undefined;
}
