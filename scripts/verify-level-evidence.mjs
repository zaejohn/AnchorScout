#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/11oEpTGkshRKcEfe2DZspYGqoi27uqUCLUvwlB54x1EI/export?format=csv";
const DEFAULT_APP_URL = "https://anchorscout.vercel.app";
const DEFAULT_HORIZON_URL = "https://horizon-testnet.stellar.org";
const TRANSACTION_HASH = /^[a-f0-9]{64}$/;
const STELLAR_WALLET = /^G[A-Z2-7]{55}$/;

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputPath = path.resolve(
  repositoryRoot,
  process.env.ANCHORSCOUT_EVIDENCE_OUTPUT ??
    "docs/evidence/level-4-5-verification.json",
);
const sheetCsvUrl =
  process.env.ANCHORSCOUT_SHEET_CSV_URL ?? DEFAULT_SHEET_CSV_URL;
const appUrl = (process.env.ANCHORSCOUT_APP_URL ?? DEFAULT_APP_URL).replace(
  /\/$/,
  "",
);
const horizonUrl = (
  process.env.STELLAR_HORIZON_URL ?? DEFAULT_HORIZON_URL
).replace(/\/$/, "");
const concurrency = parsePositiveInteger(
  process.env.ANCHORSCOUT_EVIDENCE_CONCURRENCY ?? "6",
  "ANCHORSCOUT_EVIDENCE_CONCURRENCY",
);

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 20) {
    throw new Error(`${name} must be an integer from 1 to 20.`);
  }
  return parsed;
}

function parseCsv(input) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (quoted) throw new Error("The Google Sheet CSV contains an open quote.");
  if (value.length > 0 || row.length > 0) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function findHeader(headers, pattern, label) {
  const index = headers.findIndex((header) => pattern.test(header.trim()));
  if (index === -1) throw new Error(`The Google Sheet has no ${label} column.`);
  return index;
}

function normalizeIdentity(email) {
  return email.trim().toLowerCase();
}

function privateIdentityId(email) {
  return createHash("sha256").update(normalizeIdentity(email)).digest("hex");
}

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { accept: "application/json", ...options.headers },
        signal: AbortSignal.timeout(20_000),
      });
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  }
  throw new Error(`Request failed for ${url}: ${lastError?.message ?? lastError}`);
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url);
  return response ? response.json() : null;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(items[currentIndex], currentIndex);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

function isSuccessfulAnchorScoutOperation(kind, wallet, operations) {
  if (kind === "ATOMIC_PROOF") {
    return operations.some(
      (operation) =>
        operation.type === "invoke_host_function" &&
        operation.source_account === wallet &&
        operation.transaction_successful !== false,
    );
  }
  if (kind === "LEGACY_PAYMENT") {
    return operations.some(
      (operation) =>
        operation.type === "payment" &&
        operation.from === wallet &&
        operation.source_account === wallet &&
        operation.asset_type === "native" &&
        operation.amount === "0.1000000" &&
        operation.transaction_successful !== false,
    );
  }
  return false;
}

async function verifyTransaction(wallet, route) {
  const hash = String(route.transactionHash ?? "").toLowerCase();
  if (!TRANSACTION_HASH.test(hash)) return null;

  const [transaction, operationsPage] = await Promise.all([
    fetchJson(`${horizonUrl}/transactions/${hash}`),
    fetchJson(`${horizonUrl}/transactions/${hash}/operations?limit=200`),
  ]);
  const operations = operationsPage?._embedded?.records ?? [];
  if (
    !transaction?.successful ||
    transaction.source_account !== wallet ||
    !isSuccessfulAnchorScoutOperation(route.transactionKind, wallet, operations)
  ) {
    return null;
  }

  return {
    wallet,
    transactionHash: hash,
    transactionKind: route.transactionKind,
    routeId: route.routeId,
    ledger: transaction.ledger,
    createdAt: transaction.created_at,
    stellarExpertUrl: `https://stellar.expert/explorer/testnet/tx/${hash}`,
  };
}

async function verifyWallet(wallet) {
  const history = await fetchJson(
    `${appUrl}/api/stellar/history/${encodeURIComponent(wallet)}`,
  );
  const completedRoutes = (history?.routes ?? []).filter(
    (route) =>
      route.status === "COMPLETED" &&
      route.network === "TESTNET" &&
      route.transactionStatus === "SUCCESS",
  );
  const checked = await mapLimit(completedRoutes, 3, (route) =>
    verifyTransaction(wallet, route),
  );
  return checked.filter(Boolean);
}

async function main() {
  const sheetResponse = await fetchWithRetry(sheetCsvUrl, {
    headers: { accept: "text/csv" },
  });
  const csv = await sheetResponse.text();
  const [headers, ...rows] = parseCsv(csv);
  if (!headers || rows.length === 0) throw new Error("The Google Sheet is empty.");

  const nameIndex = findHeader(headers, /name/i, "name");
  const emailIndex = findHeader(headers, /email/i, "email");
  const walletIndex = findHeader(headers, /wallet/i, "wallet");
  const ratingIndex = findHeader(headers, /rat(e|ing)/i, "rating");
  const feedbackIndex = findHeader(headers, /feedback/i, "feedback");

  const validRows = rows
    .map((row) => ({
      name: String(row[nameIndex] ?? "").trim(),
      email: String(row[emailIndex] ?? "").trim(),
      wallet: String(row[walletIndex] ?? "").trim().toUpperCase(),
      rating: String(row[ratingIndex] ?? "").trim(),
      feedback: String(row[feedbackIndex] ?? "").trim(),
    }))
    .filter((row) => row.name && row.email && STELLAR_WALLET.test(row.wallet));

  const identities = new Set(validRows.map((row) => privateIdentityId(row.email)));
  const submittedWallets = [...new Set(validRows.map((row) => row.wallet))].sort();
  const walletToIdentities = new Map();
  for (const row of validRows) {
    const ids = walletToIdentities.get(row.wallet) ?? new Set();
    ids.add(privateIdentityId(row.email));
    walletToIdentities.set(row.wallet, ids);
  }

  console.error(
    `Checking ${submittedWallets.length} submitted wallets against AnchorScout and Stellar Testnet...`,
  );
  const walletResults = await mapLimit(
    submittedWallets,
    concurrency,
    async (wallet, index) => {
      const transactions = await verifyWallet(wallet);
      console.error(
        `[${index + 1}/${submittedWallets.length}] ${wallet.slice(0, 8)}… ${transactions.length ? "verified" : "no verified transaction"}`,
      );
      return { wallet, transactions };
    },
  );

  const verificationRecords = walletResults
    .flatMap((result) => result.transactions)
    .filter(
      (record, index, records) =>
        records.findIndex(
          (candidate) => candidate.transactionHash === record.transactionHash,
        ) === index,
    )
    .sort((left, right) => left.wallet.localeCompare(right.wallet));
  const verifiedWallets = [
    ...new Set(verificationRecords.map((record) => record.wallet)),
  ].sort();
  const verifiedIdentityIds = new Set(
    verifiedWallets.flatMap((wallet) => [
      ...(walletToIdentities.get(wallet) ?? []),
    ]),
  );
  const successfulHashes = verificationRecords
    .map((record) => record.transactionHash)
    .sort();
  const recordsByWallet = new Map();
  for (const record of verificationRecords) {
    const records = recordsByWallet.get(record.wallet) ?? [];
    records.push(record.transactionHash);
    recordsByWallet.set(record.wallet, records);
  }
  const verifiedUsersByIdentity = new Map();
  for (const row of validRows) {
    const transactionHashes = recordsByWallet.get(row.wallet);
    if (!transactionHashes) continue;
    const userId = privateIdentityId(row.email);
    if (!verifiedUsersByIdentity.has(userId)) {
      verifiedUsersByIdentity.set(userId, {
        userId,
        wallet: row.wallet,
        successfulTransactionHashes: [...transactionHashes].sort(),
      });
    }
  }
  const verifiedUsers = [...verifiedUsersByIdentity.values()].sort((left, right) =>
    left.userId.localeCompare(right.userId),
  );
  const ratingCounts = Object.fromEntries(
    [...new Set(validRows.map((row) => row.rating))]
      .sort()
      .map((rating) => [
        rating || "blank",
        validRows.filter((row) => row.rating === rating).length,
      ]),
  );

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    network: "Stellar Testnet",
    sources: {
      googleSheetCsv: sheetCsvUrl,
      anchorScoutApp: appUrl,
      anchorScoutHistoryApi: `${appUrl}/api/stellar/history/{wallet}`,
      stellarHorizon: horizonUrl,
      stellarExpertTransactionPrefix:
        "https://stellar.expert/explorer/testnet/tx/",
    },
    definitions: {
      uniqueUser:
        "A distinct normalized email identity in the supplied Google Form export. Email values are hashed in memory and are not written to this report.",
      successfulAnchorScoutTransaction:
        "A completed Testnet route returned by AnchorScout contract-backed history whose transaction is successful in Horizon, is sourced by the submitted wallet, and contains the expected atomic contract invocation or legacy 0.1 XLM proof payment.",
      humanIdentityLimitation:
        "Public form and blockchain data verify distinct submitted identities, wallets, and transactions, but cannot independently prove that every identity belongs to a different human. Human participation must be supported by the form owner's collection process or consent records.",
    },
    summary: {
      formResponses: rows.length,
      validUserRecords: validRows.length,
      uniqueUsers: identities.size,
      uniqueWallets: submittedWallets.length,
      usersWithSuccessfulAnchorScoutTransaction: verifiedIdentityIds.size,
      walletsWithSuccessfulAnchorScoutTransaction: verifiedWallets.length,
      successfulAnchorScoutTransactions: successfulHashes.length,
      nonBlankFeedbackResponses: validRows.filter((row) => row.feedback).length,
      ratingCounts,
    },
    levelEvidence: {
      level4UserWalletTransactionThresholdsMet:
        verifiedIdentityIds.size >= 10 &&
        verifiedWallets.length >= 10 &&
        successfulHashes.length >= 10,
      level5UserWalletTransactionThresholdsMet:
        verifiedIdentityIds.size >= 50 &&
        verifiedWallets.length >= 50 &&
        successfulHashes.length >= 50,
    },
    verifiedUsers,
    uniqueWalletAddresses: verifiedWallets,
    successfulTransactionHashes: successfulHashes,
    verificationRecords,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.error(`Wrote verified evidence to ${outputPath}`);
}

main().catch((error) => {
  console.error(`Evidence verification failed: ${error.message}`);
  process.exitCode = 1;
});
