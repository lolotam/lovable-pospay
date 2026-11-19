import { withUser } from "@/lib/server/db.server";
import { requireSession } from "@/lib/server/session.server";
import { objectStorage, type StorageConfig } from "@/lib/server/object-storage.server";
export async function serveAsset(id: string, config: StorageConfig): Promise<Response> {
  const published = await withUser("", async db => (await db.query("select * from public.public_asset($1)", [id])).rows[0]);
  let asset = published;
  if (!asset) {
    let userId: string;
    try { userId = (await requireSession()).user.id; }
    catch { return new Response(null, { status: 404 }); }
    asset = await withUser(userId, async db => (await db.query("select object_key,content_type from public.company_assets where id=$1", [id])).rows[0]);
  }
  if (!asset) return new Response(null, { status: 404 });
  try {
    const response = await objectStorage(config).getObject(asset.object_key);
    return new Response(response.body, { headers: {
      "Content-Type": asset.content_type,
      "Cache-Control": published ? "public, max-age=31536000, immutable" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Cookie",
    } });
  } catch { return new Response(null, { status: 404 }); }
}
