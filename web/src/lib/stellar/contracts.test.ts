import { describe, expect, it } from "vitest";

import { recentRouteWindow } from "./contracts";

describe("contract route history window", () => {
  it.each([
    [0, { cursor: 0, limit: 0 }],
    [1, { cursor: 0, limit: 1 }],
    [20, { cursor: 0, limit: 20 }],
    [21, { cursor: 1, limit: 20 }],
    [73, { cursor: 53, limit: 20 }],
  ])("loads the newest records for count %i", (count, expected) => {
    expect(recentRouteWindow(count)).toEqual(expected);
  });
});
