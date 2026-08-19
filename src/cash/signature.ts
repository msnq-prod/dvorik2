import crypto from "node:crypto";

export function signInternalRequest(secret: string, timestamp: string, body: string) {
  return `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

export function verifyInternalRequest(secret: string, timestamp: string, body: string, signature: string, now = Date.now()) {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed) || Math.abs(now - parsed) > 5 * 60_000) return false;
  const expected = Buffer.from(signInternalRequest(secret, timestamp, body));
  const actual = Buffer.from(signature);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

