import { describe, expect, it } from "vitest";

import { assertSafeQuoteServer, isPublicAddress } from "./sep38";

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

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "100.64.0.1",
    "169.254.169.254",
    "192.0.2.1",
    "198.51.100.2",
    "203.0.113.3",
    "::1",
    "fc00::1",
    "fe80::1",
  ])("classifies non-public resolved address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it("allows a public resolved address", () => {
    expect(isPublicAddress("8.8.8.8")).toBe(true);
  });
});
