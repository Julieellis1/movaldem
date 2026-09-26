import { notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { getAlbumWithImages } from "@/modules/content/gallery.service";
import { AlbumEditor } from "@/components/admin/gallery-admin";

export default async function AdminAlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "gallery.read");
  const can = (key: string) => permissions.has(key) || permissions.has("*");

  try {
    const { album, images } = await getAlbumWithImages(id);
    return (
      <AlbumEditor
        initialAlbum={{
          id: album.id,
          title: album.title,
          slug: album.slug,
          description: album.description,
          cover_media_id: album.cover_media_id,
          event_id: album.event_id,
          album_date: album.album_date,
          status: album.status,
        }}
        initialImages={images.map((im) => ({
          id: im.id,
          album_id: im.album_id,
          media_id: im.media_id,
          caption: im.caption,
          alt_text: im.alt_text,
          sort_order: im.sort_order,
        }))}
        canUpdate={can("gallery.update")}
        canDelete={can("gallery.delete")}
      />
    );
  } catch {
    notFound();
  }
}
