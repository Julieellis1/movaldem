import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server-session";
import { AdminShell } from "@/components/shared/admin-shell";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, permissions } = await getCurrentSession();
  if (!user) redirect("/login?redirect=/admin");

  return (
    <AdminShell permissions={[...permissions]} name={user.name} email={user.email}>
      {children}
    </AdminShell>
  );
}
