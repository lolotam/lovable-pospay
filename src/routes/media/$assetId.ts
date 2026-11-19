import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
export const Route = createFileRoute("/media/$assetId")({
  server: { handlers: { GET: async ({ params }) => {
    if (!z.uuid().safeParse(params.assetId).success) return new Response(null, { status: 404 });
    const bucket = process.env["STORAGE_BUCKET"], endpoint = process.env["STORAGE_ENDPOINT"],
      accessKeyId = process.env["STORAGE_ACCESS_KEY_ID"], secretAccessKey = process.env["STORAGE_SECRET_ACCESS_KEY"];
    if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return new Response(null, { status: 404 });
    const { serveAsset } = await import("@/modules/pages/persistence/media.server");
    return serveAsset(params.assetId, { bucket, endpoint, accessKeyId, secretAccessKey, region: process.env["STORAGE_REGION"] ?? "auto" });
  } } },
});
