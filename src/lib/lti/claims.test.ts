import { describe, expect, it } from "vitest";

import {
  AGS_SCORE_SCOPE,
  authRedirect,
  deepLinkClaims,
  externalIdFor,
  LTI,
  parseLaunch,
  scoreBody,
  scoresUrl,
} from "./claims";

const base = {
  sub: "user-42",
  given_name: "Budi",
  family_name: "Santoso",
  [LTI.messageType]: "LtiResourceLinkRequest",
  [LTI.version]: "1.3.0",
  [LTI.deploymentId]: "1",
  [LTI.resourceLink]: { id: "rl-7", title: "Kuis" },
  [LTI.custom]: { quiz: "kuis-hewan" },
  [LTI.roles]: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"],
  [LTI.ags]: {
    scope: [AGS_SCORE_SCOPE, "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem"],
    lineitem: "https://lms.sekolah.id/mod/lti/services.php/2/lineitems/9/lineitem?type_id=1",
  },
};

describe("parseLaunch", () => {
  it("reads a resource link launch with a gradebook column", () => {
    const result = parseLaunch(base);
    expect(result).toEqual({
      ok: true,
      launch: {
        messageType: "LtiResourceLinkRequest",
        deploymentId: "1",
        userId: "user-42",
        name: "Budi Santoso",
        resourceLinkId: "rl-7",
        quizSlug: "kuis-hewan",
        lineitem: base[LTI.ags].lineitem,
        deepLinkReturnUrl: null,
        deepLinkData: null,
        instructor: false,
      },
    });
  });

  it("sends no score without the score scope, and spots instructors", () => {
    const result = parseLaunch({
      ...base,
      [LTI.ags]: { scope: [], lineitem: "https://x.id/li" },
      [LTI.roles]: ["http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"],
    });
    expect(result.ok && result.launch).toMatchObject({ lineitem: null, instructor: true });
  });

  it("reads a deep linking request", () => {
    const result = parseLaunch({
      ...base,
      [LTI.messageType]: "LtiDeepLinkingRequest",
      [LTI.deepLinking]: { deep_link_return_url: "https://lms.sekolah.id/dl", data: "abc" },
    });
    expect(result.ok && result.launch).toMatchObject({
      messageType: "LtiDeepLinkingRequest",
      deepLinkReturnUrl: "https://lms.sekolah.id/dl",
      deepLinkData: "abc",
    });
  });

  it.each([
    { ...base, [LTI.version]: "1.1" },
    { ...base, [LTI.messageType]: "LtiSubmissionReviewRequest" },
    { ...base, [LTI.deploymentId]: undefined },
    { ...base, sub: "" },
  ])("refuses what isn't a usable LTI 1.3 launch", (claims) => {
    expect(parseLaunch(claims).ok).toBe(false);
  });

  it("falls back to ?quiz= in the target link", () => {
    const result = parseLaunch({
      ...base,
      [LTI.custom]: undefined,
      [LTI.targetLinkUri]: "https://quiz.id/api/lti/launch?quiz=kuis-buah",
    });
    expect(result.ok && result.launch.quizSlug).toBe("kuis-buah");
  });

  it("ignores a custom quiz that isn't a slug", () => {
    const result = parseLaunch({ ...base, [LTI.custom]: { quiz: "../admin" } });
    expect(result.ok && result.launch.quizSlug).toBeNull();
  });
});

describe("helpers", () => {
  it("builds the OIDC authorization redirect", () => {
    const url = new URL(
      authRedirect(
        { auth_login_url: "https://lms.sekolah.id/mod/lti/auth.php", client_id: "abc" },
        {
          redirectUri: "https://quiz.id/api/lti/launch",
          loginHint: "2",
          messageHint: "hint",
          state: "s",
          nonce: "n",
        },
      ),
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      scope: "openid",
      response_type: "id_token",
      response_mode: "form_post",
      prompt: "none",
      client_id: "abc",
      redirect_uri: "https://quiz.id/api/lti/launch",
      login_hint: "2",
      lti_message_hint: "hint",
      state: "s",
      nonce: "n",
    });
  });

  it("makes a deep link item that launches the chosen quiz with a 100-point column", () => {
    const claims = deepLinkClaims({
      clientId: "abc",
      issuer: "https://lms.sekolah.id",
      deploymentId: "1",
      data: "abc",
      launchUrl: "https://quiz.id/api/lti/launch",
      quiz: { slug: "kuis-hewan", title: "Kuis Hewan" },
    });
    expect(claims).toMatchObject({
      iss: "abc",
      aud: "https://lms.sekolah.id",
      [LTI.messageType]: "LtiDeepLinkingResponse",
      [LTI.dlData]: "abc",
      [LTI.dlContentItems]: [
        {
          type: "ltiResourceLink",
          url: "https://quiz.id/api/lti/launch",
          custom: { quiz: "kuis-hewan" },
          lineItem: { scoreMaximum: 100, label: "Kuis Hewan" },
        },
      ],
    });
  });

  it("scores in percent and posts next to the line item", () => {
    expect(scoreBody({ userId: "u", ratio: 2 / 3, timestamp: "t" })).toMatchObject({
      scoreGiven: 66.67,
      scoreMaximum: 100,
      activityProgress: "Completed",
      gradingProgress: "FullyGraded",
    });
    expect(scoresUrl(base[LTI.ags].lineitem)).toBe(
      "https://lms.sekolah.id/mod/lti/services.php/2/lineitems/9/lineitem/scores?type_id=1",
    );
    expect(scoresUrl("https://canvas.id/api/lti/courses/1/line_items/5/")).toBe(
      "https://canvas.id/api/lti/courses/1/line_items/5/scores",
    );
    expect(externalIdFor("12345678-aaaa", "user-42")).toBe("lti:12345678:user-42");
  });
});
