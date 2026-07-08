/* Placeholder route for the backend skeleton (phase 1). Sits behind the JWT
   authorizer like every real route will, so hitting it proves the whole
   chain: CloudFront /api/* behavior -> HTTP API -> authorizer -> Lambda.
   Returns the caller's identity so a token can be verified end to end. */
export const handler = async (event) => {
  const claims = event.requestContext?.authorizer?.jwt?.claims ?? {};
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true, sub: claims.sub ?? null })
  };
};
