import { NextResponse } from "next/server";

import { configuredProviders } from "@/lib/anchors/providers/registry";
import { searchQuotes } from "@/lib/anchors/service";
import { parseRouteRequest } from "@/lib/anchors/validation";

export async function POST(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = parseRouteRequest(input);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid route request",
        issues: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await searchQuotes(parsed.data, configuredProviders()),
    );
  } catch (error) {
    console.error("quote_search_failed", error);
    return NextResponse.json(
      { error: "Route search is temporarily unavailable" },
      { status: 503 },
    );
  }
}

