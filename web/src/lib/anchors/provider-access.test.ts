import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  SqlConnection,
  SqlDatabase,
} from "../automation/store";
import { consumeProviderQuoteRateLimit } from "./provider-access";

describe("account-scoped provider quote limiter", () => {
  let postgres: PGlite;
  let database: SqlDatabase;

  beforeAll(async () => {
    postgres = new PGlite();
    const connection = (client: Pick<PGlite, "query">): SqlConnection => ({
      async query<T>(sql: string, values?: unknown[]) {
        const result = await client.query(sql, values);
        return { rows: result.rows as T[] };
      },
    });
    database = {
      ...connection(postgres),
      transaction: (work) =>
        postgres.transaction((transaction) => work(connection(transaction))),
      close: () => postgres.close(),
    };
    await postgres.exec(
      await readFile(new URL("../automation/schema.sql", import.meta.url), "utf8"),
    );
  });

  afterAll(async () => {
    await database.close?.();
  });

  it("atomically rejects requests after the per-minute allowance", async () => {
    expect(await consumeProviderQuoteRateLimit(database, "subject", 2)).toBe(
      true,
    );
    expect(await consumeProviderQuoteRateLimit(database, "subject", 2)).toBe(
      true,
    );
    expect(await consumeProviderQuoteRateLimit(database, "subject", 2)).toBe(
      false,
    );
  });
});
