import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  authTokens,
  notifications,
  permissions,
  rolePermissions,
  roles,
  userRoles,
  users,
} from "@/db/schema";

type UserStatus = (typeof users)["$inferSelect"]["status"];
import { env } from "@/lib/env";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { enqueueNotification } from "@/modules/platform/notifications/notifications.service";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type MemberRow = {
  id: string;
  full_name: string;
  email: string;
  status: UserStatus;
  email_verified: boolean;
  created_at: Date;
};

// Members are plain congregants: they exist in `users` regardless of roles, so
// this lists everyone. Staff-specific views use listStaff().
export async function listMembers(opts: {
  search?: string;
  status?: UserStatus | "all";
  verified?: boolean;
  page?: number;
  limit?: number;
} = {}): Promise<{ rows: MemberRow[]; total: number }> {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(500, opts.limit ?? 100);
  const conditions = [];

  if (opts.search) {
    const term = `%${opts.search.toLowerCase()}%`;
    conditions.push(or(ilike(sql`lower(${users.email})`, term), ilike(users.full_name, term)));
  }
  if (opts.status && opts.status !== "all") {
    conditions.push(eq(users.status, opts.status));
  }
  if (opts.verified !== undefined) {
    conditions.push(eq(users.email_verified, opts.verified));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: users.id,
        full_name: users.full_name,
        email: users.email,
        status: users.status,
        email_verified: users.email_verified,
        created_at: users.created_at,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.created_at))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ c: count() }).from(users).where(where),
  ]);

  return { rows, total: total?.c ?? 0 };
}

// Attempts/transaction counts arrive in later phases; the profile page renders
// them as zero so the layout is stable today (USR-02).
export async function getMember(id: string) {
  const [row] = await db
    .select({
      id: users.id,
      full_name: users.full_name,
      email: users.email,
      phone: users.phone,
      church: users.church,
      age_range: users.age_range,
      gender: users.gender,
      status: users.status,
      email_verified: users.email_verified,
      email_verified_at: users.email_verified_at,
      consent_at: users.consent_at,
      last_login_at: users.last_login_at,
      created_at: users.created_at,
    })
    .from(users)
    .where(eq(users.id, id));
  if (!row) return null;
  return { ...row, quiz_attempts: 0, transactions_total: 0 };
}

export type StaffRow = {
  id: string;
  full_name: string;
  email: string;
  status: UserStatus;
  email_verified: boolean;
  roles: { key: string; name: string }[];
};

// Staff = any user holding a role other than the plain `member` role.
export async function listStaff(): Promise<StaffRow[]> {
  const rows = await db
    .select({
      id: users.id,
      full_name: users.full_name,
      email: users.email,
      status: users.status,
      email_verified: users.email_verified,
      roleKey: roles.key,
      roleName: roles.name,
    })
    .from(userRoles)
    .innerJoin(users, eq(users.id, userRoles.user_id))
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(ne(roles.key, "member"))
    .orderBy(desc(userRoles.assigned_at));

  const byUser = new Map<string, StaffRow>();
  for (const r of rows) {
    const existing = byUser.get(r.id);
    if (existing) {
      existing.roles.push({ key: r.roleKey, name: r.roleName });
    } else {
      byUser.set(r.id, {
        id: r.id,
        full_name: r.full_name,
        email: r.email,
        status: r.status,
        email_verified: r.email_verified,
        roles: [{ key: r.roleKey, name: r.roleName }],
      });
    }
  }
  return [...byUser.values()];
}

export type RoleWithPermissions = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: string[];
};

export async function listRolesWithPermissions(): Promise<RoleWithPermissions[]> {
  const rows = await db
    .select({
      id: roles.id,
      key: roles.key,
      name: roles.name,
      description: roles.description,
      is_system: roles.is_system,
      permissionKey: permissions.key,
    })
    .from(roles)
    .leftJoin(rolePermissions, eq(rolePermissions.role_id, roles.id))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permission_id))
    .orderBy(roles.name);

  const byRole = new Map<string, RoleWithPermissions>();
  for (const r of rows) {
    const existing = byRole.get(r.id);
    if (existing) {
      if (r.permissionKey) existing.permissions.push(r.permissionKey);
    } else {
      byRole.set(r.id, {
        id: r.id,
        key: r.key,
        name: r.name,
        description: r.description,
        is_system: r.is_system,
        permissions: r.permissionKey ? [r.permissionKey] : [],
      });
    }
  }
  return [...byRole.values()];
}

// Creates a hashed staff-invite token, queues the delivery email and writes the
// audit row in one transaction so an invite never exists unrecorded (USR-03).
export async function inviteStaff(input: {
  email: string;
  roleKey: string;
  actorId: string | null;
}): Promise<void> {
  const email = input.email.toLowerCase().trim();
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.key, input.roleKey));
  if (!role) throw new Error(`Unknown role: ${input.roleKey}`);

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const inviteUrl = `${env().APP_URL}/accept-invite?token=${rawToken}`;

  await db.transaction(async (tx) => {
    const [token] = await tx
      .insert(authTokens)
      .values({
        identifier: email,
        type: "staff_invite",
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + INVITE_TTL_MS),
      })
      .returning({ id: authTokens.id });

    await enqueueNotification(tx, {
      type: "staff_invite",
      recipient: email,
      payload: { url: inviteUrl, role: input.roleKey },
    });

    await auditLog(tx, {
      actor_user_id: input.actorId,
      action: "staff.invite",
      entity_type: "auth_tokens",
      entity_id: token.id,
      changes: { email, role: input.roleKey },
    });
  });
}

export type DashboardStats = {
  totalMembers: number;
  verifiedMembers: number;
  unverifiedMembers: number;
  staffCount: number;
  failedNotifications: number;
  recent: MemberRow[];
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const [[total], [verified], [failed], recent, staff] = await Promise.all([
    db.select({ c: count() }).from(users),
    db.select({ c: count() }).from(users).where(eq(users.email_verified, true)),
    db.select({ c: count() }).from(notifications).where(eq(notifications.status, "failed")),
    db
      .select({
        id: users.id,
        full_name: users.full_name,
        email: users.email,
        status: users.status,
        email_verified: users.email_verified,
        created_at: users.created_at,
      })
      .from(users)
      .orderBy(desc(users.created_at))
      .limit(5),
    listStaff(),
  ]);

  const totalMembers = total?.c ?? 0;
  const verifiedMembers = verified?.c ?? 0;
  return {
    totalMembers,
    verifiedMembers,
    unverifiedMembers: Math.max(0, totalMembers - verifiedMembers),
    staffCount: staff.length,
    failedNotifications: failed?.c ?? 0,
    recent,
  };
}

// PERM-02: removing a super_admin role is rejected when the actor is the last
// active super admin and this is their only super_admin role — otherwise the
// system would be lockable out of its own administration.
export async function assertCanRevokeSuperAdmin(userId: string, roleKey: string): Promise<void> {
  if (roleKey !== "super_admin") return;
  const [target] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.id, userId));
  if (!target || target.status !== "active") return;

  const superAdminRoleIds = await db
    .select({ roleId: userRoles.role_id })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(and(eq(userRoles.user_id, userId), eq(roles.key, "super_admin")));

  if (superAdminRoleIds.length === 0) return;

  const otherActiveSuperAdmins = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.user_id, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(
      and(
        eq(roles.key, "super_admin"),
        eq(users.status, "active"),
        ne(users.id, userId),
      ),
    );

  if (otherActiveSuperAdmins.length === 0) {
    throw new Error("Cannot remove the last active super admin");
  }
}
