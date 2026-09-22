/**
 * CDS Hooks feedback (spec 2.0, "Feedback"): the CDS Client reports what a
 * clinician did with a card -- accepted a suggestion, or overrode the card,
 * optionally with a coded reason. This is how override / acceptance rates
 * (alert-fatigue and false-alarm signals) are measured after deployment; a
 * decision-support tool with no such loop cannot be monitored.
 *
 * Verified against https://cds-hooks.hl7.org/2.0/: the request is an object
 * with a `feedback` array; each item has `card` (the card.uuid, required),
 * `outcome` ("accepted" | "overridden", required), `outcomeTimestamp`
 * (ISO 8601 in UTC, required), `acceptedSuggestions` (array of `{ id }`,
 * required when accepted) and optional `overrideReason` ({ reason: Coding,
 * userComment }). The spec does not prescribe response codes; this service
 * returns 200 for accepted feedback and 400 for a malformed request.
 *
 * PRIVACY (SAFETY_CASE.md H8): `userComment` is free text a clinician may
 * type patient details into, so it is counted but NEVER stored. Records hold
 * only structured, non-identifying fields (the random card uuid, outcome,
 * suggestion ids, override-reason code, timestamps). In-memory and bounded.
 */

/** A Coding whose `display` is guaranteed present -- CDS Hooks requires it
 * on every override reason (a MUST), which FHIR's own Coding does not. */
export interface OverrideReasonCoding {
  system: string;
  code: string;
  display: string;
}

/** A project-local code system for override reasons (no external
 * terminology exists for these; a URN avoids inventing a web domain). */
export const OVERRIDE_REASON_SYSTEM = "urn:oah-river-watch:cds-override-reason";

const REASONS: { code: string; display: string }[] = [
  { code: "not-relevant-to-patient", display: "Not relevant to this patient" },
  { code: "already-aware", display: "Already aware of this exposure risk" },
  { code: "signal-doubted", display: "Signal unconfirmed or not trusted" },
  { code: "other", display: "Other" },
];

/** Fresh copies each call so a caller can never mutate the shared list.
 * The spec requires `display` on every override reason (MUST). */
export function overrideReasons(): OverrideReasonCoding[] {
  return REASONS.map((r) => ({ system: OVERRIDE_REASON_SYSTEM, code: r.code, display: r.display }));
}

export type FeedbackOutcome = "accepted" | "overridden";

export interface FeedbackRecord {
  serviceId: string;
  card: string;
  outcome: FeedbackOutcome;
  acceptedSuggestionIds: string[];
  overrideReasonCode: string | null;
  /** True if the client sent a free-text comment (which is discarded). */
  hadComment: boolean;
  outcomeTimestamp: string;
  receivedAt: string;
}

const MAX_RECORDS = 1_000;
const MAX_ITEMS_PER_REQUEST = 100;
const records: FeedbackRecord[] = [];

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Parsed = { ok: true; record: Omit<FeedbackRecord, "serviceId" | "receivedAt"> } | { ok: false; error: string };

function parseItem(item: unknown): Parsed {
  if (!isObject(item)) return { ok: false, error: "must be an object" };
  const { card, outcome, outcomeTimestamp, acceptedSuggestions, overrideReason } = item;

  if (typeof card !== "string" || card.length === 0 || card.length > 128) {
    return { ok: false, error: "`card` (the card uuid) is required: a non-empty string of at most 128 characters" };
  }
  if (outcome !== "accepted" && outcome !== "overridden") {
    return { ok: false, error: '`outcome` is required and must be "accepted" or "overridden"' };
  }
  if (
    typeof outcomeTimestamp !== "string" ||
    !UTC_TIMESTAMP.test(outcomeTimestamp) ||
    Number.isNaN(Date.parse(outcomeTimestamp))
  ) {
    return { ok: false, error: "`outcomeTimestamp` is required: an ISO 8601 date-time in UTC (ending in Z)" };
  }

  let acceptedSuggestionIds: string[] = [];
  if (outcome === "accepted") {
    if (!Array.isArray(acceptedSuggestions) || acceptedSuggestions.length === 0) {
      return { ok: false, error: "`acceptedSuggestions` is required (non-empty) when the outcome is accepted" };
    }
    for (const s of acceptedSuggestions) {
      if (!isObject(s) || typeof s.id !== "string" || s.id.length === 0) {
        return { ok: false, error: "each accepted suggestion must be an object with a string `id` (the suggestion uuid)" };
      }
      acceptedSuggestionIds.push(s.id);
    }
  } else {
    acceptedSuggestionIds = [];
  }

  let overrideReasonCode: string | null = null;
  let hadComment = false;
  if (overrideReason !== undefined) {
    if (!isObject(overrideReason)) return { ok: false, error: "`overrideReason` must be an object" };
    const { reason, userComment } = overrideReason;
    if (reason !== undefined) {
      if (!isObject(reason) || typeof reason.code !== "string" || typeof reason.system !== "string") {
        return { ok: false, error: "`overrideReason.reason` must be a Coding with string `system` and `code`" };
      }
      overrideReasonCode = reason.code;
    }
    if (userComment !== undefined) {
      if (typeof userComment !== "string") return { ok: false, error: "`overrideReason.userComment` must be a string" };
      hadComment = userComment.length > 0;
    }
  }

  return { ok: true, record: { card, outcome, acceptedSuggestionIds, overrideReasonCode, hadComment, outcomeTimestamp } };
}

export type FeedbackResult = { ok: true; recorded: number } | { ok: false; error: string };

/** Validates the whole request first and records nothing unless every item
 * is valid (all-or-nothing, so a client can safely retry). */
export function recordFeedback(serviceId: string, body: unknown): FeedbackResult {
  if (!isObject(body) || !Array.isArray(body.feedback)) {
    return { ok: false, error: "The request body must be an object with a `feedback` array" };
  }
  if (body.feedback.length === 0 || body.feedback.length > MAX_ITEMS_PER_REQUEST) {
    return { ok: false, error: `\`feedback\` must contain between 1 and ${MAX_ITEMS_PER_REQUEST} items` };
  }
  const parsed: Omit<FeedbackRecord, "serviceId" | "receivedAt">[] = [];
  for (const [index, item] of body.feedback.entries()) {
    const result = parseItem(item);
    if (!result.ok) return { ok: false, error: `feedback[${index}]: ${result.error}` };
    parsed.push(result.record);
  }
  const receivedAt = new Date().toISOString();
  for (const record of parsed) {
    records.push({ serviceId, receivedAt, ...record });
    if (records.length > MAX_RECORDS) records.shift();
  }
  return { ok: true, recorded: parsed.length };
}

export interface FeedbackSummary {
  total: number;
  accepted: number;
  overridden: number;
  /** overridden / total, or null with no feedback yet. A high sustained
   * override rate is the alert-fatigue / false-alarm signal to act on. */
  overrideRate: number | null;
  overrideReasons: Record<string, number>;
}

export function feedbackSummary(): FeedbackSummary {
  const overrideReasons: Record<string, number> = {};
  let accepted = 0;
  let overridden = 0;
  for (const r of records) {
    if (r.outcome === "accepted") accepted += 1;
    else {
      overridden += 1;
      const code = r.overrideReasonCode ?? "none-given";
      overrideReasons[code] = (overrideReasons[code] ?? 0) + 1;
    }
  }
  const total = records.length;
  return { total, accepted, overridden, overrideRate: total === 0 ? null : overridden / total, overrideReasons };
}

export function resetFeedback(): void {
  records.length = 0;
}

/** For tests: proves what is (and is not) retained. */
export function feedbackRecords(): readonly FeedbackRecord[] {
  return records;
}
