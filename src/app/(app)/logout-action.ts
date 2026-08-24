"use server";

import { redirect } from "next/navigation";
import { deleteSessionCookie } from "@/lib/auth/cookies";
import { readSessionToken } from "@/lib/auth/current";
import { revokeSession } from "@/lib/auth/repository";

export async function logoutAction() {
  const token = await readSessionToken();
  if (token) await revokeSession(token);
  await deleteSessionCookie();
  redirect("/login");
}
