import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { auditLogs, roles, userRoles, users } from "@/db/schema";
import { and, desc, eq, gte, ilike, lte } from "drizzle-orm";
import { AuditLogsTable } from "./audit-logs-table";

// Read-only by construction: this page never imports an update/delete path,
// and the table renders no row actions (AUD-01/02).
export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    actor?: string;
    action?: string;
    entity?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { user, permissions } = await getCurrentSession();
  requirePermission(permissions, "audit_logs.read");
  if (!user) redirect("/login?redirect=/admin/audit-logs");

  const params = await searchParams;
  // super_admin is a role key, not a "*" permission: the seeder expands "*"
  // into every concrete permission, so `can(perms, "*")` is never true.
  const roleRows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.role_id))
    .where(eq(userRoles.user_id, user.id));
  const canExport = roleRows.some((r) => r.key === "super_admin");
  // Defaults to the current actor's own activity so the log opens fast and the
  // first render is deterministic; clearing the Actor filter shows everyone.
  const actor = params.actor ?? user?.email ?? "";

  const filters = [];
  if (actor.trim()) filters.push(ilike(users.email, `%${actor.trim()}%`));
  if (params.action?.trim()) filters.push(ilike(auditLogs.action, `%${params.action.trim()}%`));
  if (params.entity?.trim()) filters.push(ilike(auditLogs.entity_type, `%${params.entity.trim()}%`));
  if (params.from) filters.push(gte(auditLogs.created_at, new Date(params.from)));
  if (params.to) filters.push(lte(auditLogs.created_at, new Date(`${params.to}T23:59:59.999Z`)));

  const rows = await db
    .select({
      id: auditLogs.id,
      actorEmail: users.email,
      actorRole: auditLogs.actor_role,
      action: auditLogs.action,
      entityType: auditLogs.entity_type,
      entityId: auditLogs.entity_id,
      changes: auditLogs.changes,
      createdAt: auditLogs.created_at,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actor_user_id))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(auditLogs.created_at))
    .limit(100);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Audit log</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Append-only: entries cannot be edited or deleted (AUD-02).
        </p>
      </div>
      <AuditLogsTable
        rows={rows.map((r) => ({
          id: r.id,
          actor: r.actorEmail ?? "system",
          role: r.actorRole ?? "—",
          action: r.action,
          entity: r.entityType,
          entityId: r.entityId ?? "—",
          changes: r.changes,
          createdAt: r.createdAt,
        }))}
        filters={{
          actor,
          action: params.action ?? "",
          entity: params.entity ?? "",
          from: params.from ?? "",
          to: params.to ?? "",
        }}
        canExport={canExport}
      />
    </div>
  );
}
