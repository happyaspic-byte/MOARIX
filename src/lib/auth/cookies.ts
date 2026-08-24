import { cookies } from "next/headers";
import { secureCookies, sessionCookieName } from "./current";

export async function writeSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function deleteSessionCookie() {
  const store = await cookies();
  store.delete(sessionCookieName());
  store.delete("__Host-moarix_session");
  store.delete("moarix_session");
}
