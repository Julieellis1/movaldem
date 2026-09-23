"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { restoreUser, suspendUser } from "@/modules/auth/auth.service";
import { inviteStaff } from "@/modules/platform/users/users.service";

async function actor() {
  const { user, permissions } = await getCurrentSession();
  return { user, permissions };
}

export async function suspendMember(formData: FormData) {
  const { user, permissions } = await actor();
  requirePermission(permissions, "members.suspend");
  const id = String(formData.get("id"));
  if (!id) throw new Error("Missing member id");
  await suspendUser(id, { actorId: user?.id ?? null, ip: null });
  revalidatePath("/admin/users");
}

export async function restoreMember(formData: FormData) {
  const { user, permissions } = await actor();
  requirePermission(permissions, "members.suspend");
  const id = String(formData.get("id"));
  if (!id) throw new Error("Missing member id");
  await restoreUser(id, { actorId: user?.id ?? "", ip: null });
  revalidatePath("/admin/users");
}

export async function inviteStaffAction(formData: FormData) {
  const { user, permissions } = await actor();
  requirePermission(permissions, "staff.invite");
  const email = String(formData.get("email") ?? "");
  const roleKey = String(formData.get("role") ?? "");
  if (!email || !roleKey) throw new Error("Email and role are required");
  await inviteStaff({ email, roleKey, actorId: user?.id ?? null });
  revalidatePath("/admin/users/staff");
}