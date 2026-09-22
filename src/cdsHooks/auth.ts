/**
 * CDS Hooks request authentication (spec 2.0, "Security and Safety").
 *
 * Verified against https://cds-hooks.hl7.org/2.0/: CDS Services SHOULD
 * require authentication if invoking the service poses any risk of exposing
 * sensitive data -- and this service receives a Patient resource (address)
 * in every patient-view request. The CDS Client signs a JWT with its private
 * key (JWS, RFC 7515) and sends it as a Bearer token; the payload MUST carry
 * `iss`, `aud` (the URL of the service endpoint being called), `exp`, `iat`
 * and `jti` (a unique nonce); JWTs SHALL NOT use the `none` algorithm or any
 * symmetric algorithm; ES384 and RS384 are the recommended algorithms.
 *
 * What this implements: signature + claim verification against keys
 * PRE-REGISTERED by `kid` (a JWKS the operator supplies), `jti` replay
 * rejection until expiry, an audience check, an asymmetric-only algorithm
 * allow-list, key-type/curve matching and a 2048-bit RSA floor.
 *
 * What it deliberately does NOT do: fetch keys from a `jku` URL in the token
 * header. Doing so means making an outbound request to an address chosen by
 * the caller (an SSRF vector) and needs its own trust policy; pre-registered
 * keys are the safe subset. Also not done: TLS termination, rate limiting,
 * and any OAuth flow -- deployment concerns outside this prototype.
 *
 * Off by default so the demo runs with no setup; enabled by configuring
 * trusted keys (see `loadCdsAuthFromEnv`). SAFETY_CASE.md hazard H3/H8.
 */

import { createPublicKey, verify, type JsonWebKey, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import type { NextFunction, Request, Response } from "express";

interface AlgorithmSpec {
  hash: string;
  kty: "RSA" | "EC";
  crv?: string;
}

/** Asymmetric algorithms only. `none` and every HS* (symmetric) algorithm
 * are absent, and so rejected. */
const ALGORITHMS: Record<string, AlgorithmSpec> = {
  RS256: { hash: "sha256", kty: "RSA" },
  RS384: { hash: "sha384", kty: "RSA" },
  RS512: { hash: "sha512", kty: "RSA" },
  ES256: { hash: "sha256", kty: "EC", crv: "P-256" },
  ES384: { hash: "sha384", kty: "EC", crv: "P-384" },
  ES512: { hash: "sha512", kty: "EC", crv: "P-521" },
};

const MIN_RSA_BITS = 2048;
const CLOCK_SKEW_SECONDS = 30;

export interface CdsAuthConfig {
  /** Public keys (JWK, each with a unique `kid`) of the CDS Clients allowed to call this service. */
  keys: JsonWebKey[];
  /** Public base URL of this service, e.g. "https://cds.example.org". Used to
   * build the expected `aud` (baseUrl + request path). If omitted it is
   * derived from the request's protocol and Host header. */
  baseUrl?: string | undefined;
  /** If set, `iss` must be one of these. */
  trustedIssuers?: string[] | undefined;
  /** Seconds since the epoch; injectable for tests. */
  now?: (() => number) | undefined;
}

interface RegisteredKey {
  key: KeyObject;
  kty: "RSA" | "EC";
  crv: string | undefined;
}

export type VerifyResult = { ok: true; claims: Record<string, unknown> } | { ok: false; reason: string };

function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Registers the configured JWKs, refusing keys that are unusable or weak
 * at startup rather than at the first request. */
function registerKeys(keys: JsonWebKey[]): Map<string, RegisteredKey> {
  const registry = new Map<string, RegisteredKey>();
  for (const jwk of keys) {
    // JsonWebKey's fields are loosely typed; narrow each explicitly.
    const kid = typeof jwk.kid === "string" ? jwk.kid : "";
    const kty = jwk.kty;
    const crv = typeof jwk.crv === "string" ? jwk.crv : undefined;
    if (!kid) throw new Error("every trusted key needs a `kid`");
    if (registry.has(kid)) throw new Error(`duplicate trusted key id '${kid}'`);
    if (kty !== "RSA" && kty !== "EC") throw new Error(`key '${kid}': unsupported key type`);
    const key = createPublicKey({ key: jwk, format: "jwk" });
    if (kty === "RSA" && (key.asymmetricKeyDetails?.modulusLength ?? 0) < MIN_RSA_BITS) {
      throw new Error(`key '${kid}': RSA keys must be at least ${MIN_RSA_BITS} bits`);
    }
    registry.set(kid, { key, kty, crv });
  }
  return registry;
}

/** Remembers `jti` values until their token expires; a token id seen twice
 * within its lifetime is a replay. */
class ReplayCache {
  private readonly seen = new Map<string, number>();
  /** Returns false if `jti` was already used. */
  claim(jti: string, expiresAt: number, now: number): boolean {
    for (const [id, exp] of this.seen) if (exp + CLOCK_SKEW_SECONDS < now) this.seen.delete(id);
    if (this.seen.has(jti)) return false;
    this.seen.set(jti, expiresAt);
    return true;
  }
}

export function createCdsJwtVerifier(config: Pick<CdsAuthConfig, "keys" | "trustedIssuers" | "now">) {
  const registry = registerKeys(config.keys);
  const replay = new ReplayCache();
  const now = config.now ?? (() => Math.floor(Date.now() / 1000));

  return function verifyToken(token: string, expectedAudience: string): VerifyResult {
    const parts = token.split(".");
    if (parts.length !== 3) return { ok: false, reason: "malformed JWT" };
    const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

    const header = decodeSegment(headerPart);
    const claims = decodeSegment(payloadPart);
    if (!header || !claims) return { ok: false, reason: "malformed JWT" };

    // Algorithm allow-list FIRST: `none` and HS* never reach a key lookup.
    const alg = header.alg;
    const spec = typeof alg === "string" ? ALGORITHMS[alg] : undefined;
    if (!spec) return { ok: false, reason: "unsupported algorithm (asymmetric RS*/ES* only; none and symmetric are forbidden)" };

    const kid = header.kid;
    if (typeof kid !== "string") return { ok: false, reason: "missing key id (kid)" };
    const registered = registry.get(kid);
    if (!registered) return { ok: false, reason: "unknown key id" };
    if (registered.kty !== spec.kty || (spec.crv !== undefined && registered.crv !== spec.crv)) {
      return { ok: false, reason: "key type does not match the token algorithm" };
    }

    let signature: Buffer;
    try {
      signature = Buffer.from(signaturePart, "base64url");
    } catch {
      return { ok: false, reason: "malformed signature" };
    }
    const signedData = Buffer.from(`${headerPart}.${payloadPart}`);
    const valid =
      spec.kty === "EC"
        ? verify(spec.hash, signedData, { key: registered.key, dsaEncoding: "ieee-p1363" }, signature)
        : verify(spec.hash, signedData, registered.key, signature);
    if (!valid) return { ok: false, reason: "invalid signature" };

    // Claims (all REQUIRED by the spec).
    const t = now();
    const { iss, aud, exp, iat, jti } = claims;
    if (typeof iss !== "string" || iss.length === 0) return { ok: false, reason: "missing iss" };
    if (config.trustedIssuers && !config.trustedIssuers.includes(iss)) return { ok: false, reason: "untrusted issuer" };
    const audiences = typeof aud === "string" ? [aud] : Array.isArray(aud) ? aud : [];
    if (!audiences.includes(expectedAudience)) return { ok: false, reason: "audience mismatch" };
    if (typeof exp !== "number") return { ok: false, reason: "missing exp" };
    if (exp + CLOCK_SKEW_SECONDS <= t) return { ok: false, reason: "token expired" };
    if (typeof iat !== "number") return { ok: false, reason: "missing iat" };
    if (iat > t + CLOCK_SKEW_SECONDS) return { ok: false, reason: "iat is in the future" };
    if (typeof jti !== "string" || jti.length === 0 || jti.length > 256) return { ok: false, reason: "missing jti" };
    if (!replay.claim(jti, exp, t)) return { ok: false, reason: "token already used (jti replay)" };

    return { ok: true, claims };
  };
}

/** Express middleware: 401 unless the request carries a valid Bearer JWT. */
export function createCdsAuthMiddleware(config: CdsAuthConfig) {
  const verifyToken = createCdsJwtVerifier(config);
  const fixedBase = config.baseUrl?.replace(/\/+$/, "");

  return (req: Request, res: Response, next: NextFunction): void => {
    const deny = (reason: string) => {
      res.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
      res.status(401).json({ error: "invalid_token", error_description: reason });
    };
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return deny("missing Bearer token");

    const base = fixedBase ?? `${req.protocol}://${req.get("host") ?? ""}`;
    const path = req.originalUrl.split("?")[0] ?? "";
    const result = verifyToken(authorization.slice("Bearer ".length).trim(), `${base}${path}`);
    if (!result.ok) return deny(result.reason);
    next();
  };
}

/** Auth is enabled by pointing OAH_CDS_TRUSTED_JWKS at a JWKS file
 * (`{"keys":[...]}`); OAH_CDS_BASE_URL and OAH_CDS_TRUSTED_ISSUERS
 * (comma-separated) are optional. Returns undefined -- open demo mode --
 * when no JWKS is configured. */
export function loadCdsAuthFromEnv(env: NodeJS.ProcessEnv): CdsAuthConfig | undefined {
  const jwksPath = env.OAH_CDS_TRUSTED_JWKS;
  if (!jwksPath) return undefined;
  const parsed = JSON.parse(readFileSync(jwksPath, "utf8")) as { keys?: JsonWebKey[] };
  if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) {
    throw new Error(`${jwksPath} must contain a non-empty "keys" array`);
  }
  return {
    keys: parsed.keys,
    baseUrl: env.OAH_CDS_BASE_URL,
    trustedIssuers: env.OAH_CDS_TRUSTED_ISSUERS?.split(",").map((s) => s.trim()).filter(Boolean),
  };
}
