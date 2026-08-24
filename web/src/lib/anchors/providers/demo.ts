import { createHash } from "node:crypto";

import type {
  AnchorProvider,
  PayoutMethod,
  RawProviderQuote,
  RouteRequest,
  SourceAsset,
} from "../types";

type DemoProfile = {
  id: string;
  name: string;
  rates: Record<SourceAsset, number>;
  fees: Record<SourceAsset, number>;
  payoutMinutes: Record<PayoutMethod, number>;
};

const PROFILES: DemoProfile[] = [
  {
    id: "bayani-demo",
    name: "Bayani Route",
    rates: { XLM: 56.92, TEST_USDC: 58.18 },
    fees: { XLM: 0.12, TEST_USDC: 0.25 },
    payoutMinutes: { BANK: 4, GCASH: 2 },
  },
  {
    id: "harbor-demo",
    name: "Harbor Bridge",
    rates: { XLM: 57.14, TEST_USDC: 58.08 },
    fees: { XLM: 0.35, TEST_USDC: 0.12 },
    payoutMinutes: { BANK: 7, GCASH: 5 },
  },
  {
    id: "sampaguita-demo",
    name: "Sampaguita Pay",
    rates: { XLM: 56.78, TEST_USDC: 58.31 },
    fees: { XLM: 0.08, TEST_USDC: 0.4 },
    payoutMinutes: { BANK: 3, GCASH: 4 },
  },
];

const quoteId = (profile: DemoProfile, request: RouteRequest, expiresAt: Date) =>
  `demo_${createHash("sha256")
    .update(
      `${profile.id}:${request.amount}:${request.sourceAsset}:${request.payoutMethod}:${expiresAt.toISOString()}`,
    )
    .digest("hex")
    .slice(0, 20)}`;

class DemoProvider implements AnchorProvider {
  readonly id: string;
  readonly name: string;

  constructor(private readonly profile: DemoProfile) {
    this.id = profile.id;
    this.name = profile.name;
  }

  async getQuote(
    request: RouteRequest,
    signal: AbortSignal,
  ): Promise<RawProviderQuote> {
    if (signal.aborted) throw new DOMException("Quote request aborted", "AbortError");
    await new Promise((resolve) => setTimeout(resolve, 40));
    if (signal.aborted) throw new DOMException("Quote request aborted", "AbortError");

    const amount = Number(request.amount);
    const fee = this.profile.fees[request.sourceAsset];
    const rate = this.profile.rates[request.sourceAsset];
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    return {
      anchorId: this.id,
      anchorName: this.name,
      quoteId: quoteId(this.profile, request, expiresAt),
      sourceAsset: request.sourceAsset,
      sourceAmount: amount,
      destinationCurrency: request.destinationCurrency,
      destinationAmount: Math.max(0, amount - fee) * rate,
      exchangeRate: rate,
      fee,
      payoutMethod: request.payoutMethod,
      estimatedMinutes: this.profile.payoutMinutes[request.payoutMethod],
      expiresAt: expiresAt.toISOString(),
      available: amount > fee,
      isDemo: true,
    };
  }
}

export const demoProviders: AnchorProvider[] = PROFILES.map(
  (profile) => new DemoProvider(profile),
);

