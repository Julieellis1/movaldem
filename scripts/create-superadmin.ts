import { auth } from "@/modules/auth/auth.config";
import { db } from "@/db/client";
import { users, userRoles, roles } from "@/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  const name = process.env.SUPERADMIN_NAME ?? "Super Admin";
  if (!email || !password) throw new Error("Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD");
  const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (existing.length) { console.log("Super admin already exists"); return; }
  // Create through better-auth so the credential hash lands in `account` correctly.
  const res = await auth.api.signUpEmail({
    body: { email: email.toLowerCase(), password, name },
  });
  await db.update(users)
    .set({ email_verified_at: new Date(), status: "active" })
    .where(eq(users.id, res.user.id));
  const [superRole] = await db.select().from(roles).where(eq(roles.key, "super_admin"));
  await db.insert(userRoles).values({ user_id: res.user.id, role_id: superRole.id });
  console.log(`Created super admin ${email}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
