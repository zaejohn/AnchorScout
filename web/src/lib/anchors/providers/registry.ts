import "server-only";

import type { AnchorProvider } from "../types";
import { CoinsPhMarketProvider } from "./coins-ph";
import { MoneyGramTestnetProvider } from "./moneygram";
import { Sep38IndicativeProvider } from "./sep38";

export function configuredProviders(): AnchorProvider[] {
  const providers: AnchorProvider[] = [
    new CoinsPhMarketProvider(),
    new MoneyGramTestnetProvider(),
  ];
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
