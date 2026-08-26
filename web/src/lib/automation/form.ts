import "server-only";

import { StrKey } from "@stellar/stellar-sdk";

const FORM_BASE =
  "https://docs.google.com/forms/d/e/1FAIpQLSeNHHe_QcJmlhnnj_fTjv4RRXndCRJ6IvsktKvCffpfuKzZeg";
const FORM_VIEW_URL = `${FORM_BASE}/viewform?hl=en`;
const FORM_RESPONSE_URL = `${FORM_BASE}/formResponse?hl=en`;
const TIMEOUT_MS = 10_000;
const MAX_HTML_LENGTH = 2_000_000;

const FIELDS = {
  full_name: 677817133,
  email: 1360355329,
  wallet: 1496830545,
  rating: 237896937,
  feedback: 864101569,
} as const;

export interface FormProfile {
  full_name: string;
  email: string;
  feedback: string | null;
}

export class FormPreflightError extends Error {
  constructor() {
    super("The feedback form is unavailable or its verified schema has changed.");
    this.name = "FormPreflightError";
  }
}

/** Google Forms has no idempotency key: never automatically retry this error. */
export class FormSubmissionUnknownError extends Error {
  constructor() {
    super("Feedback submission could not be confirmed; reconcile it before any retry.");
    this.name = "FormSubmissionUnknownError";
  }
}

function isExpectedUrl(actual: string, expected: string): boolean {
  try {
    const actualUrl = new URL(actual);
    const expectedUrl = new URL(expected);
    return (
      actualUrl.origin === expectedUrl.origin &&
      actualUrl.pathname === expectedUrl.pathname &&
      !actualUrl.username &&
      !actualUrl.password
    );
  } catch {
    return false;
  }
}

async function readHtml(response: Response, expectedUrl: string): Promise<string> {
  if (
    response.status !== 200 ||
    response.redirected ||
    !isExpectedUrl(response.url, expectedUrl) ||
    !response.headers.get("content-type")?.includes("text/html")
  ) {
    throw new Error("Unexpected form response.");
  }

  const html = await response.text();
  if (html.length > MAX_HTML_LENGTH) throw new Error("Unexpected form response.");
  return html;
}

function publicFormData(html: string): unknown {
  const assignment = /\bFB_PUBLIC_LOAD_DATA_\s*=\s*\[/.exec(html);
  if (!assignment) throw new FormPreflightError();

  const start = assignment.index + assignment[0].lastIndexOf("[");
  let depth = 0;
  let quoted = false;
  let escaped = false;

  // Parse data, never execute the Google page's scripts. Brackets and semicolons
  // inside a question's text must not truncate the JSON assignment.
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, index + 1));
    }
  }
  throw new FormPreflightError();
}

function verifySchema(data: unknown): void {
  const questions = Array.isArray(data) && Array.isArray(data[1]) ? data[1][1] : null;
  if (!Array.isArray(questions) || questions.length !== Object.keys(FIELDS).length) {
    throw new FormPreflightError();
  }

  const expected = new Map<number, { type: number; required: number }>([
    [FIELDS.full_name, { type: 1, required: 1 }],
    [FIELDS.email, { type: 1, required: 1 }],
    [FIELDS.wallet, { type: 1, required: 1 }],
    [FIELDS.rating, { type: 2, required: 1 }],
    [FIELDS.feedback, { type: 1, required: 0 }],
  ]);

  for (const question of questions) {
    if (!Array.isArray(question) || !Array.isArray(question[4]) || question[4].length !== 1) {
      throw new FormPreflightError();
    }
    const entry: unknown = question[4][0];
    if (!Array.isArray(entry)) throw new FormPreflightError();
    const id: unknown = entry[0];
    const definition = typeof id === "number" ? expected.get(id) : undefined;
    if (!definition || question[3] !== definition.type || entry[2] !== definition.required) {
      throw new FormPreflightError();
    }
    if (id === FIELDS.rating) {
      const options: unknown = entry[1];
      if (
        !Array.isArray(options) ||
        options.length !== 4 ||
        options.some((option, index) => !Array.isArray(option) || option[0] !== ["4", "3", "2", "1"][index])
      ) {
        throw new FormPreflightError();
      }
    } else if (entry[1] !== null) {
      throw new FormPreflightError();
    }
    expected.delete(id as number);
  }
  if (expected.size !== 0) throw new FormPreflightError();
}

/** Safe to retry: no response is submitted by this read-only schema check. */
export async function preflightForm(fetcher: typeof fetch = fetch): Promise<void> {
  try {
    const response = await fetcher(FORM_VIEW_URL, {
      method: "GET",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    verifySchema(publicFormData(await readHtml(response, FORM_VIEW_URL)));
  } catch {
    // Never propagate third-party HTML, network URLs, or profile contents.
    throw new FormPreflightError();
  }
}

function validateSubmission(profile: FormProfile, wallet: string): void {
  if (
    typeof profile.full_name !== "string" ||
    profile.full_name.trim().length === 0 ||
    profile.full_name.length > 1_000 ||
    typeof profile.email !== "string" ||
    profile.email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) ||
    (profile.feedback !== null &&
      (typeof profile.feedback !== "string" || profile.feedback.length > 20_000)) ||
    !StrKey.isValidEd25519PublicKey(wallet)
  ) {
    throw new TypeError("Invalid feedback submission input.");
  }
}

/**
 * The caller must durably mark SENDING before calling and FORM_SUBMITTED only
 * after resolution. If the process dies or this rejects after POST, do not send
 * again without human reconciliation of the form's responses.
 */
export async function submitForm(
  profile: FormProfile,
  wallet: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  validateSubmission(profile, wallet);
  const body = new URLSearchParams({
    [`entry.${FIELDS.full_name}`]: profile.full_name,
    [`entry.${FIELDS.email}`]: profile.email,
    [`entry.${FIELDS.wallet}`]: wallet,
    [`entry.${FIELDS.rating}`]: "4",
  });
  if (profile.feedback !== null) body.set(`entry.${FIELDS.feedback}`, profile.feedback);

  try {
    const response = await fetcher(FORM_RESPONSE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = await readHtml(response, FORM_RESPONSE_URL);
    const visibleText = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
      .replace(/<!--[^]*?-->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");
    if (
      !visibleText.includes("Your response has been recorded") ||
      /<form\b[^>]*\baction\s*=\s*["'][^"']*\/formResponse(?:[?"'])/i.test(html)
    ) {
      throw new FormSubmissionUnknownError();
    }
  } catch {
    throw new FormSubmissionUnknownError();
  }
}
