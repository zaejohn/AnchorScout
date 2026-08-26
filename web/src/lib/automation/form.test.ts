import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import {
  FormPreflightError,
  FormSubmissionUnknownError,
  preflightForm,
  submitForm,
} from "./form";

const BASE = "https://docs.google.com/forms/d/e/1FAIpQLSeNHHe_QcJmlhnnj_fTjv4RRXndCRJ6IvsktKvCffpfuKzZeg";
const wallet = Keypair.random().publicKey();
const profile = { full_name: "Synthetic Test User", email: "test@example.com", feedback: "Test feedback & details" };

function response(html: string, path: "viewform" | "formResponse", status = 200): Response {
  const result = new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
  Object.defineProperty(result, "url", { value: `${BASE}/${path}?hl=en` });
  return result;
}

function questions(): unknown[][] {
  return [
    [1, "Your name", null, 1, [[677817133, null, 1]]],
    [2, "Your email", null, 1, [[1360355329, null, 1]]],
    [3, "Your stellar wallet address", null, 1, [[1496830545, null, 1]]],
    [4, "Rating", null, 2, [[237896937, [["4"], ["3"], ["2"], ["1"]], 1]]],
    [5, "Feedback", null, 1, [[864101569, null, 0]]],
  ];
}

function formHtml(fields = questions()): string {
  return `<script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify([null, [null, fields]])};</script>`;
}

function confirmed(): Response {
  return response("<html><div>Your response has been recorded.</div></html>", "formResponse");
}

describe("feedback form preflight", () => {
  it("accepts the verified current schema without submitting", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(formHtml(), "viewform"));
    await expect(preflightForm(fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`${BASE}/viewform?hl=en`);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "GET", cache: "no-store", redirect: "error" });
  });

  it("parses data without evaluating scripts or truncating brackets in titles", async () => {
    const fields = questions();
    fields[0][1] = 'Name ]; [ with "quotes" and \\ escapes';
    await expect(preflightForm(vi.fn<typeof fetch>().mockResolvedValue(response(formHtml(fields), "viewform")))).resolves.toBeUndefined();
  });

  it.each([
    ["missing entry", (fields: unknown[][]) => fields.pop()],
    ["new required field", (fields: unknown[][]) => fields.push([6, "New required", null, 1, [[123, null, 1]]])],
    ["wrong field type", (fields: unknown[][]) => { fields[0][3] = 0; }],
    ["required feedback", (fields: unknown[][]) => { fields[4][4] = [[864101569, null, 1]]; }],
    ["wrong entry id", (fields: unknown[][]) => { fields[0][4] = [[123, null, 1]]; }],
    ["duplicate entry id", (fields: unknown[][]) => { fields[0][4] = [[1360355329, null, 1]]; }],
    ["rating options", (fields: unknown[][]) => { fields[3][4] = [[237896937, [["5"], ["4"], ["3"], ["2"]], 1]]; }],
  ])("fails closed for schema drift: %s", async (_description, change) => {
    const fields = questions();
    change(fields);
    await expect(preflightForm(vi.fn<typeof fetch>().mockResolvedValue(response(formHtml(fields), "viewform")))).rejects.toBeInstanceOf(FormPreflightError);
  });

  it("rejects unavailable forms and sanitizes network errors", async () => {
    await expect(preflightForm(vi.fn<typeof fetch>().mockResolvedValue(response("Form closed", "viewform")))).rejects.toBeInstanceOf(FormPreflightError);
    await expect(preflightForm(vi.fn<typeof fetch>().mockRejectedValue(new Error("sensitive upstream error")))).rejects.toThrow("The feedback form is unavailable or its verified schema has changed.");
  });
});

describe("feedback form submission", () => {
  it("posts exact field mappings and accepts only a positive confirmation", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(confirmed());
    await expect(submitForm(profile, wallet, fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe(`${BASE}/formResponse?hl=en`);
    expect(options).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
    expect(Object.fromEntries(options?.body as URLSearchParams)).toEqual({
      "entry.677817133": profile.full_name,
      "entry.1360355329": profile.email,
      "entry.1496830545": wallet,
      "entry.237896937": "4",
      "entry.864101569": profile.feedback,
    });
  });

  it("omits optional null feedback", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(confirmed());
    await submitForm({ ...profile, feedback: null }, wallet, fetcher);
    expect((fetcher.mock.calls[0][1]?.body as URLSearchParams).has("entry.864101569")).toBe(false);
  });

  it("rejects invalid input before making a network request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(submitForm(profile, "not-a-wallet", fetcher)).rejects.toBeInstanceOf(TypeError);
    await expect(submitForm({ ...profile, email: "not-an-email" }, wallet, fetcher)).rejects.toBeInstanceOf(TypeError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["ordinary 200", () => response("<html>Form still needs input</html>", "formResponse")],
    ["HTTP failure", () => response("Server error", "formResponse", 500)],
    ["confirmation inside script", () => response('<script>"Your response has been recorded"</script>', "formResponse")],
    ["form validation page", () => response(`<form action="${BASE}/formResponse"><div>Your response has been recorded</div></form>`, "formResponse")],
    ["unexpected URL", () => response("Your response has been recorded", "viewform")],
    ["redirect", () => { const result = confirmed(); Object.defineProperty(result, "redirected", { value: true }); return result; }],
  ])("treats %s as ambiguous and never retries", async (_description, result) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(result());
    await expect(submitForm(profile, wallet, fetcher)).rejects.toBeInstanceOf(FormSubmissionUnknownError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("treats network loss after POST as ambiguous without leaking upstream details", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error("body contains private profile data"));
    await expect(submitForm(profile, wallet, fetcher)).rejects.toThrow("Feedback submission could not be confirmed; reconcile it before any retry.");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
