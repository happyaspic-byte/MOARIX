import { cookies } from "next/headers";
import { sessionCookiePolicy } from "./current";

export async function writeSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  const policy = sessionCookiePolicy();
  store.set(policy.name, token, {
    httpOnly: true,
    secure: policy.secure,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function deleteSessionCookie() {
  const store = await cookies();
  store.delete("__Host-moarix_session");
  store.delete("moarix_session");
}
