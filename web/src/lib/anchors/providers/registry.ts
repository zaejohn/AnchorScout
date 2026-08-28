import "server-only";

import type { AnchorProvider, SourceAsset } from "../types";
import {
  CoinsPhAuthenticatedProvider,
  CoinsPhMarketProvider,
  CoinsPhPreferredProvider,
} from "./coins-ph";
import { MoneyGramTestnetProvider } from "./moneygram";
import {
  isExplicitTestnetOnramperAssetId,
  OnramperProvider,
} from "./onramper";
import { Sep38IndicativeProvider } from "./sep38";

export function configuredProviders(
  options: { accountScopedCoinsAuthorized?: boolean } = {},
): AnchorProvider[] {
  const providers: AnchorProvider[] = [];
  const coinsKey = process.env.COINS_PH_API_KEY?.trim();
  const coinsSecret = process.env.COINS_PH_SECRET_KEY?.trim();
  const coinsFirmEnabled = process.env.COINS_PH_FIRM_QUOTES_ENABLED === "true";
  if (
    options.accountScopedCoinsAuthorized &&
    coinsFirmEnabled &&
    coinsKey &&
    coinsSecret
  ) {
    providers.push(
      new CoinsPhPreferredProvider(
        new CoinsPhAuthenticatedProvider(
          { apiKey: coinsKey, secretKey: coinsSecret },
          process.env.COINS_PH_BANK_SUBJECT?.trim() || undefined,
        ),
      ),
    );
  } else {
    providers.push(new CoinsPhMarketProvider());
  }
  providers.push(new MoneyGramTestnetProvider());

  const onramperKey = process.env.ONRAMPER_API_KEY?.trim();
  const onramperAssets: Partial<Record<SourceAsset, string>> = {
    XLM: process.env.ONRAMPER_XLM_TESTNET_ASSET_ID?.trim(),
    TEST_USDC: process.env.ONRAMPER_USDC_TESTNET_ASSET_ID?.trim(),
  };
  const hasSupportedOnramperAsset = (
    ["XLM", "TEST_USDC"] as const
  ).some((asset) =>
    isExplicitTestnetOnramperAssetId(asset, onramperAssets[asset]),
  );
  if (onramperKey && hasSupportedOnramperAsset) {
    providers.push(
      new OnramperProvider(
        onramperKey,
        process.env.ONRAMPER_ENVIRONMENT === "production"
          ? "production"
          : "staging",
        onramperAssets,
      ),
    );
  }
  const homeDomain = process.env.SEP38_ANCHOR_HOME_DOMAIN;
  if (homeDomain) {
    providers.push(
      new Sep38IndicativeProvider(
        "configured-sep38",
        process.env.SEP38_ANCHOR_NAME ?? "Configured SEP-38 Anchor",
        homeDomain,
      ),
    );
  }
  return providers;
}
