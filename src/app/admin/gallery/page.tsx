import Link from "next/link";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { listAlbums } from "@/modules/content/gallery.service";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { NewAlbumButton } from "@/components/admin/gallery-admin";

// Server-owned permission gate before any row renders (PERM-01).
export default async function AdminGalleryPage() {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "gallery.read");
  const canCreate = permissions.has("gallery.create") || permissions.has("*");

  const albums = await listAlbums();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Gallery</h1>
        {canCreate && <NewAlbumButton />}
      </div>
      {albums.length === 0 ? (
        <EmptyState title="No albums yet" description={canCreate ? "Use “New album” to create the first one." : ""} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {albums.map((a) => (
            <li key={a.id} className="rounded-2xl border border-border bg-surface-card p-4">
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/admin/gallery/${a.id}`}
                  className="font-medium text-text-primary hover:underline"
                >
                  {a.title}
                </Link>
                <Badge variant="secondary">{a.status}</Badge>
              </div>
              {a.album_date && (
                <p className="mt-1 text-sm text-text-tertiary">{a.album_date}</p>
              )}
              {a.description && (
                <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{a.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
