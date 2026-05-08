import { readFileSync } from "node:fs";

const schemaPath = new URL("../prisma/schema.prisma", import.meta.url);
const schema = readFileSync(schemaPath, "utf8");

const ignoredModels = new Set();
const modelPattern = /^model\s+(\w+)\s+\{([\s\S]*?)^\}/gm;
const failures = [];

for (const match of schema.matchAll(modelPattern)) {
  const [, modelName, body] = match;
  if (ignoredModels.has(modelName)) continue;

  const hasCreatedAt = /^\s*createdAt\s+DateTime\s+@default\(now\(\)\)/m.test(body);
  const hasUpdatedAt = /^\s*updatedAt\s+DateTime\s+@updatedAt/m.test(body);

  if (!hasCreatedAt || !hasUpdatedAt) {
    failures.push({
      modelName,
      hasCreatedAt,
      hasUpdatedAt,
    });
  }
}

if (failures.length > 0) {
  console.error("Prisma timestamp contract failed:");
  for (const failure of failures) {
    console.error(
      `- ${failure.modelName}: createdAt=${failure.hasCreatedAt}, updatedAt=${failure.hasUpdatedAt}`,
    );
  }
  process.exit(1);
}

console.log("Prisma timestamp contract passed.");
