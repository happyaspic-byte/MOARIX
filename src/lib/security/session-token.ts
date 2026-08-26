import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DEVELOPMENT_SECRET = "moarix-development-only-session-secret";

function getSecret() {
  const configuredSecret = process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === "production" && !configuredSecret) {
    throw new Error("SESSION_SECRET is required in production");
  }
  const secret = configuredSecret || DEVELOPMENT_SECRET;
  if (process.env.NODE_ENV === "production" && secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters in production");
  }
  return secret;
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHmac("sha256", getSecret()).update(token).digest("hex");
}

export function safeTokenHashEquals(left: string, right: string) {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
