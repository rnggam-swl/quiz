import "server-only";

import { randomBytes } from "node:crypto";

import {
  createRemoteJWKSet,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
  importPKCS8,
  jwtVerify,
  SignJWT,
  type JWK,
} from "jose";

import { b64url } from "@/lib/signed-token";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";

import { AGS_SCORE_SCOPE, scoreBody, scoresUrl } from "./claims";

// The network side of LTI 1.3 (P8-08, docs/07-embed.md#lti-13): the tool's own key, OIDC
// state, id_token verification, and the AGS calls that put a grade in the LMS gradebook.
// Service role only: every caller is a route that verified what it's acting on.

export type Platform = Tables<"lti_platforms">;

const STATE_TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 10_000;

// ─── The tool's key ──────────────────────────────────────────────────────────

type ToolKey = { kid: string; privateKey: CryptoKey };
let toolKeyPromise: Promise<ToolKey> | null = null;

async function loadOrCreateKey(): Promise<ToolKey> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("lti_keys")
    .select("kid, private_pem")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { kid: existing.kid, privateKey: await importPKCS8(existing.private_pem, "RS256") };
  }
  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    modulusLength: 2048,
    extractable: true,
  });
  const kid = b64url(randomBytes(12));
  const jwk = await exportJWK(publicKey);
  const { error } = await admin.from("lti_keys").insert({
    kid,
    public_jwk: { ...jwk, kid, alg: "RS256", use: "sig" },
    private_pem: await exportPKCS8(privateKey),
  });
  if (error) throw new Error(`lti_keys: ${error.message}`);
  // Two first launches at once each make a key; both are published, so either works.
  return { kid, privateKey };
}

/** The tool's RSA key, made on first use and kept for the process. */
export function toolKey(): Promise<ToolKey> {
  toolKeyPromise ??= loadOrCreateKey().catch((e) => {
    toolKeyPromise = null;
    throw e;
  });
  return toolKeyPromise;
}

/** Public keys for /api/lti/jwks. */
export async function publicJwks(): Promise<{ keys: JWK[] }> {
  await toolKey();
  const { data } = await createAdminClient().from("lti_keys").select("public_jwk");
  return { keys: (data ?? []).map((r) => r.public_jwk as JWK) };
}

async function signWithToolKey(claims: Record<string, unknown>, ttlS: number): Promise<string> {
  const { kid, privateKey } = await toolKey();
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid, typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${ttlS}s`)
    .sign(privateKey);
}

// ─── Platforms and login state ───────────────────────────────────────────────

/** The registered platform for an issuer (and client, when the LMS says which). */
export async function findPlatform(issuer: string, clientId: string | null) {
  let query = createAdminClient().from("lti_platforms").select("*").eq("issuer", issuer);
  if (clientId) query = query.eq("client_id", clientId);
  const { data } = await query.limit(2);
  // Without a client_id we can only pick when the issuer is registered once.
  return data?.length === 1 ? data[0]! : null;
}

export async function createLoginState(platformId: string) {
  const state = b64url(randomBytes(24));
  const nonce = b64url(randomBytes(24));
  const { error } = await createAdminClient()
    .from("lti_states")
    .insert({ state, nonce, platform_id: platformId });
  if (error) throw new Error(`lti_states: ${error.message}`);
  return { state, nonce };
}

/** Takes the state back (once). Null when unknown, used or older than ten minutes. */
export async function consumeLoginState(state: string, now = Date.now()) {
  if (!/^[\w-]{20,64}$/.test(state)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("lti_states")
    .delete()
    .eq("state", state)
    .select("nonce, created_at, platform_id")
    .maybeSingle();
  if (!data || now - Date.parse(data.created_at) > STATE_TTL_MS) return null;
  const { data: platform } = await admin
    .from("lti_platforms")
    .select("*")
    .eq("id", data.platform_id)
    .maybeSingle();
  return platform ? { nonce: data.nonce, platform } : null;
}

// ─── The launch ──────────────────────────────────────────────────────────────

const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function platformKeys(url: string) {
  let jwks = jwksByUrl.get(url);
  if (!jwks) {
    if (jwksByUrl.size > 100) jwksByUrl.clear();
    jwks = createRemoteJWKSet(new URL(url), { timeoutDuration: 5_000, cooldownDuration: 30_000 });
    jwksByUrl.set(url, jwks);
  }
  return jwks;
}

/**
 * Checks the platform's id_token: signed with one of its keys (RS256 only), for this
 * client, fresh, and carrying the nonce we gave it. Returns the claims, or null.
 */
export async function verifyIdToken(
  idToken: string,
  platform: Pick<Platform, "issuer" | "client_id" | "jwks_url">,
  nonce: string,
): Promise<Record<string, unknown> | null> {
  if (idToken.length > 20_000) return null;
  try {
    const { payload } = await jwtVerify(idToken, platformKeys(platform.jwks_url), {
      issuer: platform.issuer,
      audience: platform.client_id,
      algorithms: ["RS256"],
      maxTokenAge: "10m",
      clockTolerance: 60,
    });
    if (payload.nonce !== nonce) return null;
    // Several audiences: the token must say it's for us (OIDC core 3.1.3.7).
    if (
      Array.isArray(payload.aud) &&
      payload.aud.length > 1 &&
      payload.azp !== platform.client_id
    ) {
      return null;
    }
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The signed deep-linking response the browser posts back to the LMS. */
export function signDeepLinkResponse(claims: Record<string, unknown>): Promise<string> {
  return signWithToolKey(claims, 300);
}

// ─── Grades (AGS) ────────────────────────────────────────────────────────────

const tokens = new Map<string, { token: string; expiresAt: number }>();

async function agsToken(platform: Platform): Promise<string> {
  const cached = tokens.get(platform.id);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  // Client credentials with a signed assertion (IMS Security Framework 4.1).
  const assertion = await signWithToolKey(
    {
      iss: platform.client_id,
      sub: platform.client_id,
      aud: platform.auth_token_url,
      jti: b64url(randomBytes(16)),
    },
    300,
  );
  const response = await fetch(platform.auth_token_url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
      scope: AGS_SCORE_SCOPE,
    }),
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;
  if (!response.ok || !body?.access_token) {
    throw new Error(`token endpoint ${response.status}`);
  }
  const ttlS = Math.max(60, Math.min(body.expires_in ?? 3600, 3600)) - 30;
  if (tokens.size > 100) tokens.clear();
  tokens.set(platform.id, { token: body.access_token, expiresAt: Date.now() + ttlS * 1000 });
  return body.access_token;
}

/**
 * Sends a submitted attempt's score to the gradebook of the LMS the learner came from.
 * Does nothing for learners who didn't come through LTI, or links without a grade column.
 * Never throws: a failed passback is logged, the attempt itself is already saved.
 */
export async function sendLtiGrade(attemptId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: attempt } = await admin
      .from("attempts")
      .select(
        "score, max_score, submitted_at, participants!inner(external_id), sessions!inner(quiz_id)",
      )
      .eq("id", attemptId)
      .maybeSingle();
    const externalId = attempt?.participants.external_id;
    if (!attempt?.submitted_at || !externalId?.startsWith("lti:")) return;

    const { data: launch } = await admin
      .from("lti_launches")
      .select("lti_user_id, lineitem, lti_platforms!inner(*)")
      .eq("external_id", externalId)
      .eq("quiz_id", attempt.sessions.quiz_id)
      .not("lineitem", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!launch?.lineitem) return;
    const platform = launch.lti_platforms as Platform;

    const max = Number(attempt.max_score ?? 0);
    const body = scoreBody({
      userId: launch.lti_user_id,
      ratio: max > 0 ? Number(attempt.score ?? 0) / max : 0,
      timestamp: attempt.submitted_at,
    });
    const response = await fetch(scoresUrl(launch.lineitem), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await agsToken(platform)}`,
        "Content-Type": "application/vnd.ims.lis.v1.score+json",
      },
      body: JSON.stringify(body),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      if (response.status === 401) tokens.delete(platform.id);
      console.warn(`LTI grade passback for ${attemptId}: HTTP ${response.status}`);
    }
  } catch (e) {
    console.warn(`LTI grade passback for ${attemptId} failed:`, (e as Error).message);
  }
}
