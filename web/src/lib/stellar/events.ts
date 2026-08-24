export function buildEventRequest(params: {
  cursor?: string | null;
  requestedStartLedger?: number;
  latestLedger: number;
  contractIds: string[];
}) {
  const common = {
    filters: [{ type: "contract", contractIds: params.contractIds }],
    limit: 100,
  };
  if (params.cursor) return { ...common, cursor: params.cursor };
  const requested = params.requestedStartLedger;
  const startLedger =
    Number.isInteger(requested) && Number(requested) > 0
      ? Math.min(Number(requested), params.latestLedger)
      : Math.max(1, params.latestLedger - 100);
  return { ...common, startLedger };
}
