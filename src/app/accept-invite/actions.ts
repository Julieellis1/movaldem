"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptStaffInvite } from "@/modules/auth/auth.service";
import { registerSchema } from "@/modules/auth/schemas";
import { RateLimitError } from "@/lib/ratelimit";

export async function acceptInviteAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!token) redirect("/accept-invite?error=invalid");
  // Reuse the registration password policy so invites cannot set weaker
  // credentials than a self-service signup (SEC-01).
  const parsed = registerSchema.shape.password.safeParse(password);
  if (!parsed.success) {
    redirect(`/accept-invite?error=password&token=${encodeURIComponent(token)}`);
  }
  if (password !== confirmPassword) {
    redirect(`/accept-invite?error=match&token=${encodeURIComponent(token)}`);
  }

  try {
    await acceptStaffInvite(token, password);
  } catch (err) {
    if (err instanceof RateLimitError) {
      redirect(`/accept-invite?error=rate&token=${encodeURIComponent(token)}`);
    }
    redirect(`/accept-invite?error=invalid&token=${encodeURIComponent(token)}`);
  }
  revalidatePath("/admin/users/staff");
  redirect("/login?invite=accepted");
}
