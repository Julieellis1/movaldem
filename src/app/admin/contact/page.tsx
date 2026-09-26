import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { listContactMessages } from "@/modules/content/contact.service";
import { ContactInbox } from "@/components/admin/contact-inbox";

// PRD 08 §4 contact inbox. Visible to admin/super_admin only —
// content_manager holds no contact_messages.* keys, so this gate excludes them.
export default async function AdminContactPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "contact_messages.read");
  const can = (key: string) => permissions.has(key) || permissions.has("*");

  const [rows, unreadRows] = await Promise.all([
    listContactMessages(),
    listContactMessages({ status: "new" }),
  ]);

  return (
    <ContactInbox
      initialRows={rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        subject: r.subject,
        message: r.message,
        status: r.status,
        created_at: r.created_at.toISOString(),
      }))}
      initialUnread={unreadRows.length}
      canUpdate={can("contact_messages.update")}
      canDelete={can("contact_messages.delete")}
    />
  );
}
