import { z } from "zod";
import rawDefaultScrapeTargets from "@/server/data/default-scrape-targets.json";
import type { DefaultScrapeTarget } from "@/lib/scrape-types";

const defaultScrapeTarget = z.object({
  id: z.string().min(1),
  site: z.string().min(1),
  label: z.string().min(1),
  url: z.string().url(),
  pageKind: z.enum(["plp", "pdp", "unknown"]),
  enabled: z.boolean(),
  tags: z.array(z.string()),
  notes: z.string().optional(),
});

const defaultScrapeTargetsFile = z.object({
  version: z.number(),
  description: z.string(),
  targets: z.array(defaultScrapeTarget),
});

export function listDefaultScrapeTargets(options: { includeDisabled?: boolean } = {}) {
  const parsed = defaultScrapeTargetsFile.parse(rawDefaultScrapeTargets);
  const targets: DefaultScrapeTarget[] = parsed.targets;
  return options.includeDisabled ? targets : targets.filter((target) => target.enabled);
}
