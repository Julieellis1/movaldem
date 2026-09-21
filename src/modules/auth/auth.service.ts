import { auth } from "./auth.config";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { registerSchema } from "./schemas";

// Server-owned registration: validates consent/phone/password, creates the
// user + credential account through better-auth (which also queues the
// verification email via the auth.config callback), records consent and audit.
export async function registerMember(input: {
  full_name: string; email: string; phone?: string; password: string;
  church?: string; age_range?: string; gender?: string; consent: boolean;
}, ctx: { ip?: string | null; userAgent?: string | null; headers?: Headers } = {}) {
  const parsed = registerSchema.parse(input); // throws on consent / phone / password mismatch
  const email = parsed.email.toLowerCase().trim();
  const res = await auth.api.signUpEmail({
    body: {
      email, password: parsed.password, name: parsed.full_name,
      phone: parsed.phone, church: parsed.church, age_range: parsed.age_range, gender: parsed.gender,
    },
    headers: ctx.headers, // sets the session cookie when called from a route handler
  });
  const user = res.user;
  await db.update(users)
    .set({ consent_at: new Date(), status: "active" })
    .where(eq(users.id, user.id));
  await auditLog(db, {
    actor_user_id: user.id, action: "user.register", entity_type: "users", entity_id: user.id,
    ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return { user, session: res.session };
}

// Email verification itself is handled by better-auth:
//   - token generation + validation live in the `verification` table
//   - email delivery is the auth.config `sendVerificationEmail` callback,
//     which enqueues our react-email template through the notifications outbox
// The public page (Task 19) only reads the ?error= / success state from the
// better-auth redirect; there is no hand-rolled verify endpoint.
