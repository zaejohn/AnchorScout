import { describe, expect, it } from "vitest";

import { assertSafeQuoteServer } from "./sep38";

describe("SEP-38 server policy", () => {
  it("accepts the configured home origin and explicit HTTPS origins", () => {
    expect(
      assertSafeQuoteServer(
        "https://anchor.example",
        "https://anchor.example/sep38",
      ).origin,
    ).toBe("https://anchor.example");
    expect(
      assertSafeQuoteServer(
        "https://anchor.example",
        "https://quotes.example/sep38",
        "https://quotes.example",
      ).origin,
    ).toBe("https://quotes.example");
  });

  it.each([
    "http://anchor.example/sep38",
    "https://localhost/sep38",
    "https://127.0.0.1/sep38",
    "https://10.0.0.8/sep38",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/sep38",
  ])("rejects unsafe server %s", (url) => {
    expect(() => assertSafeQuoteServer("https://anchor.example", url)).toThrow();
  });

  it("rejects an unapproved third-party origin from remote TOML", () => {
    expect(() =>
      assertSafeQuoteServer(
        "https://anchor.example",
        "https://attacker.example/sep38",
      ),
    ).toThrow(/explicitly allowed/);
  });
});
