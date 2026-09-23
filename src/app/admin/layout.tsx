import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server-session";
import { AdminSidebar } from "@/components/shared/admin-sidebar";
import { AdminTopbar } from "@/components/shared/admin-topbar";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, permissions } = await getCurrentSession();
  if (!user) redirect("/login?redirect=/admin");

  return (
    <div className="flex min-h-screen bg-surface-base">
      <AdminSidebar permissions={[...permissions]} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar name={user.name} email={user.email} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
