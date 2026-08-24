import { configuredProviders } from "@/lib/anchors/providers/registry";
import { searchQuotes } from "@/lib/anchors/service";
import { parseRouteRequest } from "@/lib/anchors/validation";
import { noStoreJson } from "@/lib/server/responses";

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return noStoreJson({ error: "Request body must be valid JSON" }, 400);
  }

  const parsed = parseRouteRequest(input);
  if (!parsed.success) {
    return noStoreJson(
      {
        error: "Invalid route request",
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  }

  try {
    return noStoreJson(await searchQuotes(parsed.data, configuredProviders()));
  } catch (error) {
    console.error("quote_search_failed", error);
    return noStoreJson({ error: "Route search is temporarily unavailable" }, 503);
  }
}
