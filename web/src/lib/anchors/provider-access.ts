import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

import {
  createPostgresDatabase,
  type SqlDatabase,
} from "../automation/store";

export class ProviderQuoteAccessError extends Error {
  constructor(
    readonly status: 401 | 429 | 503,
    message: string,
  ) {
    super(message);
    this.name = "ProviderQuoteAccessError";
  }
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export async function consumeProviderQuoteRateLimit(
  database: SqlDatabase,
  subjectHash: string,
  limit: number,
) {
  const result = await database.query<{ request_count: number }>(
    `WITH current_window AS (
       SELECT date_trunc('minute', clock_timestamp()) AS window_start
     ), consumed AS (
       INSERT INTO anchorscout_provider_quote_limits
         (subject_hash, window_start, request_count)
       SELECT $1, window_start, 1 FROM current_window
       ON CONFLICT (subject_hash, window_start)
       DO UPDATE SET request_count = anchorscout_provider_quote_limits.request_count + 1
       WHERE anchorscout_provider_quote_limits.request_count < $2
       RETURNING request_count
     )
     SELECT request_count FROM consumed`,
    [subjectHash, limit],
  );
  return Boolean(result.rows[0]);
}

export async function authorizeAccountScopedCoins(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization) return false;

  const expected = process.env.COINS_PH_QUOTE_ACCESS_TOKEN?.trim();
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!expected || expected.length < 32 || !secureEqual(supplied, expected)) {
    throw new ProviderQuoteAccessError(
      401,
      "Account-scoped provider authorization failed",
    );
  }
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new ProviderQuoteAccessError(
      503,
      "Account-scoped provider rate limiting is not configured",
    );
  }

  const configuredLimit = Number(
    process.env.COINS_PH_QUOTE_RATE_LIMIT_PER_MINUTE ?? "10",
  );
  const limit = Number.isInteger(configuredLimit)
    ? Math.min(Math.max(configuredLimit, 1), 60)
    : 10;
  const database = createPostgresDatabase(databaseUrl);
  try {
    const consumed = await consumeProviderQuoteRateLimit(
      database,
      createHash("sha256").update(expected).digest("hex"),
      limit,
    );
    if (!consumed) {
      throw new ProviderQuoteAccessError(
        429,
        "Account-scoped provider quote limit reached",
      );
    }
    return true;
  } finally {
    await database.close?.();
  }
}
