import { headers } from "next/headers";
import { auth } from "@/modules/auth/auth.config";
import { loadPermissions } from "@/modules/auth/rbac.service";

export type ServerSession = {
  user: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>["user"] | null;
  session: NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>["session"] | null;
  permissions: Set<string>;
};

export async function getCurrentSession(): Promise<ServerSession> {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result?.user) {
    return { user: null, session: null, permissions: new Set() };
  }
  const permissions = await loadPermissions(result.user.id);
  return { user: result.user, session: result.session, permissions };
}
