type SqlClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown[]>;
  close: () => Promise<void>;
};

type BunRuntime = {
  SQL: new (databaseUrl: string) => SqlClient;
};

export function createSqlClient() {
  const databaseUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
  const bun = (globalThis as typeof globalThis & { Bun?: BunRuntime }).Bun;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL or DIRECT_URL is required.");
  }

  if (!bun?.SQL) {
    throw new Error("Bun.SQL runtime is required for the current database adapter.");
  }

  return new bun.SQL(databaseUrl);
}
