import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/modules/auth/auth.config";
import { getHomeAudience, resolveHomeTarget } from "@/modules/auth/home-target";

// Session-aware landing (was: unconditional redirect to /login, which looped
// every staff sign-in straight back to the login page with a success toast).
// The Phase 3 marketing homepage replaces the member/guest targets.
export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  redirect(resolveHomeTarget(await getHomeAudience(session.user.id)));
}
