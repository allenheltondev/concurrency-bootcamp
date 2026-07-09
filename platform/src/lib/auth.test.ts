/* Unit tests for the shared session contract (lib/auth.ts) with mocked
   fetch — the exact rsc:auth document shape, refresh behavior, error
   translation, and the pool's required sign-up attributes. */

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./config", () => ({
  getConfig: vi.fn(async () => ({ clientId: "client-1", region: "us-east-1", apiBase: "/api" }))
}));

import * as auth from "./auth";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const ok = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;
const bad = (body: unknown) => ({ ok: false, json: async () => body }) as unknown as Response;

const nowSec = () => Math.floor(Date.now() / 1000);
const storedSession = () => JSON.parse(localStorage.getItem("rsc:auth") ?? "null");
const seedSession = (session: Record<string, unknown>) =>
  localStorage.setItem("rsc:auth", JSON.stringify(session));
const lastRequest = (call = fetchMock.mock.calls.length - 1) => {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return { url, init, body: JSON.parse(String(init.body)) };
};

beforeEach(() => {
  fetchMock.mockReset();
  localStorage.clear();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("signIn", () => {
  it("writes the exact rsc:auth document the course pages read", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ AuthenticationResult: { IdToken: "id-1", RefreshToken: "rt-1", ExpiresIn: 3600 } })
    );
    const out = await auth.signIn("a@b.co", "Passw0rd!");
    expect(out).toEqual({ kind: "success" });

    const doc = storedSession();
    expect(Object.keys(doc).sort()).toEqual(["expiresAt", "idToken", "refreshToken"]);
    expect(doc.idToken).toBe("id-1");
    expect(doc.refreshToken).toBe("rt-1");
    expect(doc.expiresAt).toBeGreaterThanOrEqual(nowSec() + 3595);
    expect(doc.expiresAt).toBeLessThanOrEqual(nowSec() + 3605);

    const { url, init, body } = lastRequest();
    expect(url).toBe("https://cognito-idp.us-east-1.amazonaws.com/");
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/x-amz-json-1.1");
    expect(headers["x-amz-target"]).toBe("AWSCognitoIdentityProviderService.InitiateAuth");
    expect(body.AuthFlow).toBe("USER_PASSWORD_AUTH");
    expect(body.AuthParameters).toEqual({ USERNAME: "a@b.co", PASSWORD: "Passw0rd!" });
  });

  it("surfaces the NEW_PASSWORD_REQUIRED challenge as a discriminated union", async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ ChallengeName: "NEW_PASSWORD_REQUIRED", Session: "sess-1" })
    );
    const out = await auth.signIn("a@b.co", "Passw0rd!");
    expect(out).toEqual({ kind: "newPasswordRequired", session: "sess-1" });
    expect(storedSession()).toBeNull();
  });

  it("throws a typed error for unconfirmed users and fires a resend best-effort", async () => {
    fetchMock
      .mockResolvedValueOnce(bad({ __type: "UserNotConfirmedException" }))
      .mockResolvedValueOnce(ok({}));
    await expect(auth.signIn("a@b.co", "Passw0rd!")).rejects.toMatchObject({
      code: "UserNotConfirmedException"
    });
    const resend = lastRequest(1);
    const headers = resend.init.headers as Record<string, string>;
    expect(headers["x-amz-target"]).toBe(
      "AWSCognitoIdentityProviderService.ResendConfirmationCode"
    );
    expect(resend.body.Username).toBe("a@b.co");
  });

  it("translates wrong-password into the friendly message", async () => {
    fetchMock.mockResolvedValueOnce(
      bad({ __type: "com.amazonaws.cognito#NotAuthorizedException", message: "raw" })
    );
    await expect(auth.signIn("a@b.co", "WrongPass1")).rejects.toThrow(
      "Incorrect email or password."
    );
  });
});

describe("signUp", () => {
  it("sends the three attributes the shared pool requires", async () => {
    fetchMock.mockResolvedValueOnce(ok({}));
    await auth.signUp("  Allen ", "Helton", "a@b.co", "Passw0rd!");
    const { init, body } = lastRequest();
    const headers = init.headers as Record<string, string>;
    expect(headers["x-amz-target"]).toBe("AWSCognitoIdentityProviderService.SignUp");
    expect(body.Username).toBe("a@b.co");
    expect(body.Password).toBe("Passw0rd!");
    expect(body.UserAttributes).toEqual([
      { Name: "email", Value: "a@b.co" },
      { Name: "given_name", Value: "Allen" },
      { Name: "family_name", Value: "Helton" }
    ]);
  });
});

describe("getFreshIdToken", () => {
  it("returns the stored token without fetching while it's fresh", async () => {
    seedSession({ idToken: "id-1", refreshToken: "rt-1", expiresAt: nowSec() + 3600 });
    expect(await auth.getFreshIdToken()).toBe("id-1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes via REFRESH_TOKEN_AUTH when within 60s of expiry, keeping the refresh token", async () => {
    seedSession({ idToken: "id-old", refreshToken: "rt-1", expiresAt: nowSec() + 30 });
    fetchMock.mockResolvedValueOnce(
      ok({ AuthenticationResult: { IdToken: "id-new", ExpiresIn: 3600 } })
    );
    expect(await auth.getFreshIdToken()).toBe("id-new");
    const { body } = lastRequest();
    expect(body.AuthFlow).toBe("REFRESH_TOKEN_AUTH");
    expect(body.AuthParameters).toEqual({ REFRESH_TOKEN: "rt-1" });
    const doc = storedSession();
    expect(doc.idToken).toBe("id-new");
    expect(doc.refreshToken).toBe("rt-1"); // Cognito omits it on refresh; the previous one survives
  });

  it("clears the session on a definite auth failure", async () => {
    seedSession({ idToken: "id-old", refreshToken: "rt-1", expiresAt: nowSec() - 10 });
    fetchMock.mockResolvedValueOnce(bad({ __type: "NotAuthorizedException" }));
    expect(await auth.getFreshIdToken()).toBeNull();
    expect(storedSession()).toBeNull();
  });

  it("keeps the tokens on a network error", async () => {
    seedSession({ idToken: "id-old", refreshToken: "rt-1", expiresAt: nowSec() - 10 });
    fetchMock.mockRejectedValueOnce(new TypeError("network down"));
    expect(await auth.getFreshIdToken()).toBeNull();
    expect(storedSession()).toMatchObject({ idToken: "id-old", refreshToken: "rt-1" });
  });

  it("clears an expired session that has no refresh token", async () => {
    seedSession({ idToken: "id-old", expiresAt: nowSec() - 10 });
    expect(await auth.getFreshIdToken()).toBeNull();
    expect(storedSession()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("signOut", () => {
  it("drops rsc:auth (and nothing else), then revokes best-effort", async () => {
    seedSession({ idToken: "id-1", refreshToken: "rt-1", expiresAt: nowSec() + 3600 });
    localStorage.setItem("cbootcamp:solved", "{}");
    fetchMock.mockResolvedValueOnce(ok({}));
    await auth.signOut();
    expect(storedSession()).toBeNull();
    expect(localStorage.getItem("cbootcamp:solved")).toBe("{}");
    const { init, body } = lastRequest();
    const headers = init.headers as Record<string, string>;
    expect(headers["x-amz-target"]).toBe("AWSCognitoIdentityProviderService.RevokeToken");
    expect(body.Token).toBe("rt-1");
  });
});

describe("claims", () => {
  it("parses the base64url id token payload", () => {
    const payload = btoa(
      JSON.stringify({ email: "a@b.co", given_name: "Allen", family_name: "Helton", sub: "u-1" })
    );
    seedSession({ idToken: `h.${payload}.sig`, expiresAt: nowSec() + 3600 });
    expect(auth.claims()).toMatchObject({
      email: "a@b.co",
      given_name: "Allen",
      family_name: "Helton",
      sub: "u-1"
    });
  });

  it("returns {} when signed out or the token is garbage", () => {
    expect(auth.claims()).toEqual({});
    seedSession({ idToken: "not-a-jwt", expiresAt: nowSec() + 3600 });
    expect(auth.claims()).toEqual({});
  });
});

describe("errorMessage", () => {
  it("translates the Cognito error types to friendly copy", () => {
    const cases: Array<[string, string]> = [
      ["NotAuthorizedException", "Incorrect email or password."],
      ["UserNotFoundException", "Incorrect email or password."],
      ["UsernameExistsException", "An account with this email already exists."],
      ["InvalidPasswordException", "That password doesn't meet the requirements below."],
      ["CodeMismatchException", "That code isn't right — check it and try again."],
      ["ExpiredCodeException", "That code has expired — request a new one."],
      ["LimitExceededException", "Too many attempts — wait a few minutes and try again."],
      ["TooManyRequestsException", "Too many attempts — wait a moment and try again."]
    ];
    for (const [type, copy] of cases) {
      expect(auth.errorMessage({ __type: type })).toBe(copy);
      expect(auth.errorMessage({ __type: `com.amazonaws.pool#${type}` })).toBe(copy);
    }
  });

  it("falls back to the server message, then generic copy", () => {
    expect(auth.errorMessage({ __type: "SomethingElse", message: "server says" })).toBe(
      "server says"
    );
    expect(auth.errorMessage({})).toBe("Something went wrong — please try again.");
  });
});

describe("onAuthChange", () => {
  it("notifies subscribers on sign-in and sign-out, and unsubscribes cleanly", async () => {
    const listener = vi.fn();
    const off = auth.onAuthChange(listener);

    fetchMock.mockResolvedValueOnce(
      ok({ AuthenticationResult: { IdToken: "id-1", RefreshToken: "rt-1", ExpiresIn: 3600 } })
    );
    await auth.signIn("a@b.co", "Passw0rd!");
    expect(listener).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(ok({}));
    await auth.signOut();
    expect(listener).toHaveBeenCalledTimes(2);

    off();
    fetchMock.mockResolvedValueOnce(
      ok({ AuthenticationResult: { IdToken: "id-2", ExpiresIn: 3600 } })
    );
    await auth.signIn("a@b.co", "Passw0rd!");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("relays cross-tab storage events for the rsc:auth key", () => {
    const listener = vi.fn();
    const off = auth.onAuthChange(listener);
    window.dispatchEvent(new StorageEvent("storage", { key: "rsc:auth" }));
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent("storage", { key: "cbootcamp:solved" }));
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
});
