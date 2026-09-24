import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { roles, userRoles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { setSetting } from "@/modules/platform/settings/settings.service";
import { auditLog } from "@/modules/platform/audit/audit.service";
import {
  coerceSettingValue,
  findSettingField,
  isSecretUnchanged,
  SETTINGS_FIELDS,
} from "@/modules/platform/settings/settings.fields";

type ChangeInput = { key: string; value: unknown; isSecret?: boolean };

// Writes are server-owned: the client only proposes keys that exist in the
// settings registry, and permission is re-checked here (PERM-01/SEC-11).
export async function POST(req: Request) {
  const { user, permissions } = await getCurrentSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    requirePermission(permissions, "settings.update");
  } catch (err) {
    if ((err as { status?: number }).status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    throw err;
  }

  const contentType = req.headers.get("content-type") ?? "";
  const isFormPost = !contentType.includes("application/json");
  const respond = (status: number, message: string) => {
    if (!isFormPost) {
      return NextResponse.json({ error: message }, { status });
    }
    const params = new URLSearchParams();
    params.set("error", message);
    return NextResponse.redirect(new URL(`/admin/settings?${params.toString()}`, req.url), {
      status: 303,
    });
  };

  let incoming: ChangeInput[];
  if (!isFormPost) {
    const json = (await req.json().catch(() => null)) as { changes?: ChangeInput[] } | null;
    if (!json || !Array.isArray(json.changes)) {
      return respond(400, "Invalid request body");
    }
    incoming = json.changes;
  } else {
    const form = await req.formData().catch(() => null);
    if (!form) {
      return respond(400, "Invalid request body");
    }
    incoming = SETTINGS_FIELDS.map((f) => ({
      key: f.key,
      // An unchecked checkbox is absent from the payload, so it maps to false.
      value: f.type === "boolean" ? (form.has(f.key) ? "true" : "false") : String(form.get(f.key) ?? ""),
    }));
  }

  const roleRows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, user.id));
  // super_admin is a role key, not a "*" permission: the seeder expands "*"
  // into every concrete permission, so `can(perms, "*")` is never true.
  const isSuperAdmin = roleRows.some((r) => r.key === "super_admin");

  const applied: Array<{ key: string; value: unknown }> = [];
  for (const change of incoming) {
    const field = findSettingField(change.key);
    // Unknown keys are never written, even for an authenticated admin.
    if (!field) continue;
    // Write-only: an empty or masked submit means "unchanged", so it must be
    // skipped before the permission gate — an admin leaving a secret blank is
    // not trying to write one.
    if (field.isSecret && isSecretUnchanged(change.value)) continue;
    // SMTP/storage credentials stay super_admin-only (SEC-11).
    if (field.isSecret && !isSuperAdmin) {
      return respond(403, `Saving ${field.key} requires the super_admin role`);
    }
    applied.push({ key: field.key, value: coerceSettingValue(field, change.value) });
  }

  if (!applied.length) {
    if (!isFormPost) return NextResponse.json({ ok: true, applied: 0 });
    return NextResponse.redirect(new URL("/admin/settings?saved=1", req.url), { status: 303 });
  }

  for (const { key, value } of applied) {
    const field = findSettingField(key);
    if (!field) continue;
    await setSetting(db, key, value, { isSecret: !!field.isSecret, updatedBy: user.id });
  }

  // One append-only row per save. Secret values are redacted here and again by
  // auditLog's redactSecrets pass, so the plaintext never reaches the log.
  const changes: Record<string, unknown> = {};
  for (const { key, value } of applied) {
    const field = findSettingField(key);
    if (!field) continue;
    changes[key] = field.isSecret ? "[REDACTED]" : value;
  }
  await auditLog(db, {
    actor_user_id: user.id,
    actor_role: roleRows.map((r) => r.key).join(",") || null,
    action: "settings.update",
    entity_type: "settings",
    changes,
    ip: req.headers.get("x-forwarded-for"),
    user_agent: req.headers.get("user-agent"),
  });

  if (!isFormPost) {
    return NextResponse.json({ ok: true, applied: applied.length });
  }
  return NextResponse.redirect(new URL("/admin/settings?saved=1", req.url), { status: 303 });
}
