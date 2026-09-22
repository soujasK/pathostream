import { createHmac, generateKeyPairSync, sign, type JsonWebKey, type KeyObject } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createCdsJwtVerifier } from "../src/cdsHooks/auth.js";
import { PATIENT_VIEW_SERVICE_ID } from "../src/cdsHooks/discovery.js";
import { createServer } from "../src/cdsHooks/server.js";

const NOW = 1_800_000_000; // fixed clock, seconds
const BASE = "https://cds.test";
const PV_URL = `${BASE}/cds-services/${PATIENT_VIEW_SERVICE_ID}`;

const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = generateKeyPairSync("ec", { namedCurve: "P-384" });
const rsaJwk: JsonWebKey = { ...rsa.publicKey.export({ format: "jwk" }), kid: "rsa-1" };
const ecJwk: JsonWebKey = { ...ec.publicKey.export({ format: "jwk" }), kid: "ec-1" };

const HASH: Record<string, string> = { RS256: "sha256", RS384: "sha384", ES256: "sha256", ES384: "sha384" };
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

let jtiCounter = 0;
function claims(overrides: Record<string, unknown> = {}) {
  return { iss: "https://ehr.test", aud: PV_URL, exp: NOW + 300, iat: NOW - 5, jti: `jti-${++jtiCounter}`, ...overrides };
}

function token(options: {
  alg: string;
  kid?: string | undefined;
  privateKey: KeyObject;
  payload?: Record<string, unknown>;
}): string {
  const header: Record<string, unknown> = { alg: options.alg, typ: "JWT" };
  if (options.kid !== undefined) header.kid = options.kid;
  const data = `${b64(header)}.${b64(options.payload ?? claims())}`;
  const hash = HASH[options.alg]!;
  const signature = options.alg.startsWith("ES")
    ? sign(hash, Buffer.from(data), { key: options.privateKey, dsaEncoding: "ieee-p1363" })
    : sign(hash, Buffer.from(data), options.privateKey);
  return `${data}.${signature.toString("base64url")}`;
}

const rs384 = (payload?: Record<string, unknown>) => token({ alg: "RS384", kid: "rsa-1", privateKey: rsa.privateKey, ...(payload ? { payload } : {}) });
const es384 = (payload?: Record<string, unknown>) => token({ alg: "ES384", kid: "ec-1", privateKey: ec.privateKey, ...(payload ? { payload } : {}) });

function verifier(extra: { trustedIssuers?: string[] } = {}) {
  return createCdsJwtVerifier({ keys: [rsaJwk, ecJwk], now: () => NOW, ...extra });
}

describe("CDS Hooks JWT verification (spec: Security and Safety)", () => {
  it("accepts a valid RS384 token (a spec-recommended algorithm)", () => {
    expect(verifier()(rs384(), PV_URL).ok).toBe(true);
  });

  it("accepts a valid ES384 token (a spec-recommended algorithm)", () => {
    expect(verifier()(es384(), PV_URL).ok).toBe(true);
  });

  it("rejects the `none` algorithm (spec: SHALL NOT)", () => {
    const unsigned = `${b64({ alg: "none", kid: "rsa-1" })}.${b64(claims())}.`;
    const result = verifier()(unsigned, PV_URL);
    expect(result).toMatchObject({ ok: false });
    expect((result as { reason: string }).reason).toContain("unsupported algorithm");
  });

  it("rejects symmetric algorithms (spec: SHALL NOT), including the classic public-key-as-HMAC-secret confusion attack", () => {
    const publicPem = rsa.publicKey.export({ type: "spki", format: "pem" }).toString();
    const data = `${b64({ alg: "HS256", typ: "JWT", kid: "rsa-1" })}.${b64(claims())}`;
    const forged = `${data}.${createHmac("sha256", publicPem).update(data).digest("base64url")}`;
    const result = verifier()(forged, PV_URL);
    expect(result).toMatchObject({ ok: false });
    expect((result as { reason: string }).reason).toContain("unsupported algorithm");
  });

  it("rejects a tampered payload (signature no longer matches)", () => {
    const [h, , s] = rs384().split(".") as [string, string, string];
    const tampered = `${h}.${b64(claims({ iss: "https://evil.test" }))}.${s}`;
    expect(verifier()(tampered, PV_URL)).toMatchObject({ ok: false, reason: "invalid signature" });
  });

  it("rejects a token signed by a different key that claims a trusted kid", () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const forged = token({ alg: "RS384", kid: "rsa-1", privateKey: other.privateKey });
    expect(verifier()(forged, PV_URL)).toMatchObject({ ok: false, reason: "invalid signature" });
  });

  it("rejects an unknown kid and a missing kid", () => {
    expect(verifier()(token({ alg: "RS384", kid: "nope", privateKey: rsa.privateKey }), PV_URL)).toMatchObject({ ok: false, reason: "unknown key id" });
    expect(verifier()(token({ alg: "RS384", privateKey: rsa.privateKey }), PV_URL)).toMatchObject({ ok: false, reason: "missing key id (kid)" });
  });

  it("rejects a key/algorithm type mismatch (RSA key presented with an ES384 token)", () => {
    const mismatched = token({ alg: "ES384", kid: "rsa-1", privateKey: ec.privateKey });
    expect(verifier()(mismatched, PV_URL)).toMatchObject({ ok: false, reason: "key type does not match the token algorithm" });
  });

  it("rejects an expired token, and a token issued in the future", () => {
    expect(verifier()(rs384(claims({ exp: NOW - 3_600 })), PV_URL)).toMatchObject({ ok: false, reason: "token expired" });
    expect(verifier()(rs384(claims({ iat: NOW + 3_600 })), PV_URL)).toMatchObject({ ok: false, reason: "iat is in the future" });
  });

  it("rejects a token minted for a different service endpoint (audience)", () => {
    const wrong = rs384(claims({ aud: `${BASE}/cds-services/some-other-service` }));
    expect(verifier()(wrong, PV_URL)).toMatchObject({ ok: false, reason: "audience mismatch" });
  });

  it("requires every claim the spec makes REQUIRED: iss, aud, exp, iat, jti", () => {
    for (const missing of ["iss", "aud", "exp", "iat", "jti"] as const) {
      const payload: Record<string, unknown> = claims();
      delete payload[missing];
      expect(verifier()(rs384(payload), PV_URL).ok, `missing ${missing}`).toBe(false);
    }
  });

  it("rejects a replayed jti (a token id may be used once within its lifetime)", () => {
    const v = verifier();
    const t = rs384(claims({ jti: "fixed-jti" }));
    expect(v(t, PV_URL).ok).toBe(true);
    expect(v(t, PV_URL)).toMatchObject({ ok: false, reason: "token already used (jti replay)" });
  });

  it("enforces a trusted-issuer list when one is configured", () => {
    const v = verifier({ trustedIssuers: ["https://ehr.test"] });
    expect(v(rs384(), PV_URL).ok).toBe(true);
    expect(v(rs384(claims({ iss: "https://other.test" })), PV_URL)).toMatchObject({ ok: false, reason: "untrusted issuer" });
  });

  it("rejects malformed tokens", () => {
    for (const bad of ["", "abc", "a.b", "a.b.c.d", "!!.!!.!!"]) expect(verifier()(bad, PV_URL).ok).toBe(false);
  });

  it("refuses to load a weak (1024-bit) RSA key or a key without a kid", () => {
    const weak = generateKeyPairSync("rsa", { modulusLength: 1024 });
    const weakJwk: JsonWebKey = { ...weak.publicKey.export({ format: "jwk" }), kid: "weak" };
    expect(() => createCdsJwtVerifier({ keys: [weakJwk], now: () => NOW })).toThrow(/at least 2048/);
    const { kid: _kid, ...noKid } = rsaJwk;
    expect(() => createCdsJwtVerifier({ keys: [noKid], now: () => NOW })).toThrow(/kid/);
  });
});

describe("auth wired into the server", () => {
  const app = createServer({ cdsAuth: { keys: [rsaJwk, ecJwk], baseUrl: BASE, now: () => NOW } });
  const hook = { hookInstance: "x", hook: "patient-view", context: { userId: "u", patientId: "p" }, prefetch: {} };
  const path = `/cds-services/${PATIENT_VIEW_SERVICE_ID}`;

  it("keeps discovery open (a client must be able to find the services)", async () => {
    expect((await request(app).get("/cds-services")).status).toBe(200);
  });

  it("returns 401 with a WWW-Authenticate header when no token is sent", async () => {
    const res = await request(app).post(path).send(hook);
    expect(res.status).toBe(401);
    expect(res.headers["www-authenticate"]).toContain("invalid_token");
  });

  it("serves the hook with a valid token, and refuses the same token a second time", async () => {
    const t = rs384(claims({ jti: "server-jti" }));
    expect((await request(app).post(path).set("Authorization", `Bearer ${t}`).send(hook)).status).toBe(200);
    expect((await request(app).post(path).set("Authorization", `Bearer ${t}`).send(hook)).status).toBe(401);
  });

  it("guards the hook-name alias and the feedback endpoint too", async () => {
    expect((await request(app).post("/cds-services/patient-view").send(hook)).status).toBe(401);
    expect((await request(app).post(`${path}/feedback`).send({ feedback: [] })).status).toBe(401);
  });

  it("guards using the audience of the path actually called", async () => {
    // A token minted for the patient-view endpoint must not open the alias path.
    const t = rs384();
    expect((await request(app).post("/cds-services/patient-view").set("Authorization", `Bearer ${t}`).send(hook)).status).toBe(401);
  });

  it("is off (open demo mode) unless configured", async () => {
    const open = createServer({ cdsAuth: undefined });
    expect((await request(open).post(path).send(hook)).status).toBe(200);
  });
});
