import { getCurrentSession } from "@/lib/auth/current";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await getCurrentSession();
  redirect(session ? "/dashboard" : "/login");
}
