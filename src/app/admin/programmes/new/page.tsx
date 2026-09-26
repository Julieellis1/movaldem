import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { ProgrammeForm } from "@/components/admin/programme-form";

export default async function NewProgrammePage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "programmes.create");
  const canPublish = permissions.has("programmes.publish") || permissions.has("*");

  return (
    <ProgrammeForm
      basePath="/admin/programmes"
      showPublishControls={canPublish}
    />
  );
}
