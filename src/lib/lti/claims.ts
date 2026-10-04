import { z } from "zod";

// LTI 1.3 message claims (P8-08, docs/07-embed.md#lti-13). Pure: parsing a verified
// id_token, and the shapes the tool sends back. The network parts are in ./server.ts.

export const LTI = {
  messageType: "https://purl.imsglobal.org/spec/lti/claim/message_type",
  version: "https://purl.imsglobal.org/spec/lti/claim/version",
  deploymentId: "https://purl.imsglobal.org/spec/lti/claim/deployment_id",
  targetLinkUri: "https://purl.imsglobal.org/spec/lti/claim/target_link_uri",
  resourceLink: "https://purl.imsglobal.org/spec/lti/claim/resource_link",
  custom: "https://purl.imsglobal.org/spec/lti/claim/custom",
  roles: "https://purl.imsglobal.org/spec/lti/claim/roles",
  ags: "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint",
  deepLinking: "https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings",
  dlData: "https://purl.imsglobal.org/spec/lti-dl/claim/data",
  dlContentItems: "https://purl.imsglobal.org/spec/lti-dl/claim/content_items",
} as const;

export const AGS_SCORE_SCOPE = "https://purl.imsglobal.org/spec/lti-ags/scope/score";

const launchSchema = z.object({
  sub: z.string().min(1).max(255),
  name: z.string().max(200).optional(),
  given_name: z.string().max(100).optional(),
  family_name: z.string().max(100).optional(),
  [LTI.messageType]: z.enum(["LtiResourceLinkRequest", "LtiDeepLinkingRequest"]),
  [LTI.version]: z.literal("1.3.0"),
  [LTI.deploymentId]: z.string().min(1).max(255),
  [LTI.targetLinkUri]: z.string().max(2000).optional(),
  [LTI.resourceLink]: z
    .object({ id: z.string().max(255) })
    .partial()
    .optional(),
  [LTI.custom]: z.record(z.string(), z.unknown()).optional(),
  [LTI.roles]: z.array(z.string()).optional(),
  [LTI.ags]: z
    .object({ scope: z.array(z.string()).optional(), lineitem: z.string().optional() })
    .optional(),
  [LTI.deepLinking]: z
    .object({ deep_link_return_url: z.string().url(), data: z.string().max(2000).optional() })
    .optional(),
});

export type Launch = {
  messageType: "LtiResourceLinkRequest" | "LtiDeepLinkingRequest";
  deploymentId: string;
  userId: string;
  name: string | null;
  resourceLinkId: string | null;
  /** custom.quiz: the quiz slug the link was made for (deep linking puts it there). */
  quizSlug: string | null;
  /** Where the learner's score goes, when the LMS allows sending one. */
  lineitem: string | null;
  deepLinkReturnUrl: string | null;
  deepLinkData: string | null;
  instructor: boolean;
};

function quizFromUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).searchParams.get("quiz");
  } catch {
    return null;
  }
}

/** The launch in a verified id_token, or why it isn't one we can use. */
export function parseLaunch(
  claims: unknown,
): { ok: true; launch: Launch } | { ok: false; error: string } {
  const parsed = launchSchema.safeParse(claims);
  if (!parsed.success) return { ok: false, error: "Pesan LTI tidak lengkap atau bukan LTI 1.3." };
  const c = parsed.data;
  const ags = c[LTI.ags];
  const canScore = !!ags?.lineitem && (ags.scope ?? []).includes(AGS_SCORE_SCOPE);
  const given = [c.given_name, c.family_name].filter(Boolean).join(" ");
  // Deep-linked items carry custom.quiz; a hand-made link can use ?quiz= in its URL.
  const quiz = c[LTI.custom]?.quiz ?? quizFromUrl(c[LTI.targetLinkUri]);
  return {
    ok: true,
    launch: {
      messageType: c[LTI.messageType],
      deploymentId: c[LTI.deploymentId],
      userId: c.sub,
      name: (c.name || given || "").trim().slice(0, 60) || null,
      resourceLinkId: c[LTI.resourceLink]?.id ?? null,
      quizSlug: typeof quiz === "string" && /^[a-z0-9-]{1,80}$/.test(quiz) ? quiz : null,
      lineitem: canScore ? ags!.lineitem! : null,
      deepLinkReturnUrl: c[LTI.deepLinking]?.deep_link_return_url ?? null,
      deepLinkData: c[LTI.deepLinking]?.data ?? null,
      instructor: (c[LTI.roles] ?? []).some((r) =>
        /#(Instructor|Administrator)$|ContentDeveloper/.test(r),
      ),
    },
  };
}

/** participants.external_id for an LMS user: stable per platform, within the 200-char limit. */
export function externalIdFor(platformId: string, userId: string): string {
  return `lti:${platformId.slice(0, 8)}:${userId}`.slice(0, 200);
}

/** Step 2 of the OIDC login: send the browser to the platform's authorization endpoint. */
export function authRedirect(
  platform: { auth_login_url: string; client_id: string },
  params: {
    redirectUri: string;
    loginHint: string;
    messageHint: string | null;
    state: string;
    nonce: string;
  },
): string {
  const url = new URL(platform.auth_login_url);
  url.searchParams.set("scope", "openid");
  url.searchParams.set("response_type", "id_token");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("prompt", "none");
  url.searchParams.set("client_id", platform.client_id);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("login_hint", params.loginHint);
  if (params.messageHint) url.searchParams.set("lti_message_hint", params.messageHint);
  url.searchParams.set("state", params.state);
  url.searchParams.set("nonce", params.nonce);
  return url.toString();
}

/** The claims of a deep-linking response: one resource link that plays `quiz`. */
export function deepLinkClaims(input: {
  clientId: string;
  issuer: string;
  deploymentId: string;
  data: string | null;
  launchUrl: string;
  quiz: { slug: string; title: string };
}): Record<string, unknown> {
  return {
    iss: input.clientId,
    aud: input.issuer,
    nonce: crypto.randomUUID(),
    [LTI.messageType]: "LtiDeepLinkingResponse",
    [LTI.version]: "1.3.0",
    [LTI.deploymentId]: input.deploymentId,
    ...(input.data && { [LTI.dlData]: input.data }),
    [LTI.dlContentItems]: [
      {
        type: "ltiResourceLink",
        title: input.quiz.title || "Quiz",
        url: input.launchUrl,
        custom: { quiz: input.quiz.slug },
        lineItem: { scoreMaximum: 100, label: input.quiz.title || "Quiz" },
      },
    ],
  };
}

/** An AGS score for an attempt (0–100). */
export function scoreBody(input: { userId: string; ratio: number; timestamp: string }) {
  return {
    userId: input.userId,
    scoreGiven: Math.round(Math.max(0, Math.min(1, input.ratio)) * 10_000) / 100,
    scoreMaximum: 100,
    activityProgress: "Completed",
    gradingProgress: "FullyGraded",
    timestamp: input.timestamp,
  };
}

/** `{lineitem}/scores`, keeping the line item's query string (Moodle has one). */
export function scoresUrl(lineitem: string): string {
  const url = new URL(lineitem);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/scores`;
  return url.toString();
}
