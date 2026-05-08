import type { ExecutedMarketRequest, ResolvedMarketRequest } from "@/lib/market-types";
import { nowIsoTimestamp } from "@/lib/common";

export async function executeMarketRequest(request: ResolvedMarketRequest) {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
  });
  const contentType = response.headers.get("content-type") ?? undefined;
  const fetchedAt = nowIsoTimestamp();

  if (!response.ok) {
    throw new Error(`Resolved market request failed: ${response.status}`);
  }

  if (contentType?.includes("application/json")) {
    return {
      status: response.status,
      contentType,
      fetchedAt,
      data: await response.json(),
    } satisfies ExecutedMarketRequest;
  }

  return {
    status: response.status,
    contentType,
    fetchedAt,
    text: await response.text(),
  } satisfies ExecutedMarketRequest;
}
