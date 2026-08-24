export const SOURCE_ASSETS = ["XLM", "TEST_USDC"] as const;
export const DESTINATION_CURRENCIES = ["PHP"] as const;
export const PAYOUT_METHODS = ["BANK", "GCASH"] as const;

export type SourceAsset = (typeof SOURCE_ASSETS)[number];
export type DestinationCurrency = (typeof DESTINATION_CURRENCIES)[number];
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];
export type QuoteKind = "FIRM" | "INDICATIVE" | "MARKET_REFERENCE";
export type SettlementMode =
  | "PROVIDER_LIVE"
  | "PROVIDER_TEST"
  | "FIAT_SIMULATED"
  | "COMPARISON_ONLY";

export type QuoteStatus =
  | "LOADING"
  | "AVAILABLE"
  | "SELECTED"
  | "EXPIRED"
  | "UNAVAILABLE"
  | "FAILED";

export interface RouteRequest {
  amount: string;
  sourceAsset: SourceAsset;
  destinationCurrency: DestinationCurrency;
  payoutMethod: PayoutMethod;
}

export interface RawProviderQuote {
  anchorId: string;
  anchorName: string;
  quoteId: string;
  sourceAsset: string;
  sourceAmount: string | number;
  destinationCurrency: string;
  destinationAmount: string | number;
  exchangeRate: string | number;
  fee: string | number | null;
  feeCurrency: string | null;
  payoutMethod: string;
  estimatedMinutes: number | null;
  estimatedSettlement: string;
  expiresAt: string;
  available: boolean;
  quoteKind: QuoteKind;
  settlementMode: SettlementMode;
  rateSource: string;
  feeSource: string;
  availabilitySource: string;
  providerUrl: string;
  disclosures: string[];
}

export interface AnchorQuote {
  anchorId: string;
  anchorName: string;
  quoteId: string;
  sourceAsset: SourceAsset;
  sourceAmount: string;
  destinationCurrency: DestinationCurrency;
  destinationAmount: string;
  exchangeRate: string;
  fee: string | null;
  feeCurrency: string | null;
  payoutMethod: PayoutMethod;
  estimatedMinutes: number | null;
  estimatedSettlement: string;
  expiresAt: string;
  status: QuoteStatus;
  quoteKind: QuoteKind;
  settlementMode: SettlementMode;
  rateSource: string;
  feeSource: string;
  availabilitySource: string;
  providerUrl: string;
  disclosures: string[];
  comparisonComplete: boolean;
  rank?: number;
  best?: boolean;
}

export interface ProviderResult {
  providerId: string;
  providerName: string;
  status: "ok" | "failed" | "timed_out" | "unsupported";
  message?: string;
}

export interface QuoteSearchResult {
  quotes: AnchorQuote[];
  providers: ProviderResult[];
  searchedAt: string;
}

export interface AnchorProvider {
  id: string;
  name: string;
  supports?(request: RouteRequest): boolean;
  getQuote(request: RouteRequest, signal: AbortSignal): Promise<RawProviderQuote>;
}
