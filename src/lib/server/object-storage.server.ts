import { AwsClient } from "aws4fetch";
export interface StorageConfig {
  endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string;
}
export function objectStorage(config: StorageConfig) {
  const client = new AwsClient({ ...config, service: "s3" });
  const url = (key: string) => `${config.endpoint.replace(/\/$/, "")}/${encodeURIComponent(config.bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const request = async (key: string, init: RequestInit) => {
    const response = await client.fetch(url(key), init);
    if (!response.ok) throw new Error("STORAGE_FAILED");
    return response;
  };
  return {
    putObject: (key: string, body: Uint8Array, contentType: string) => request(key, { method: "PUT", body: new Blob([Uint8Array.from(body)]), headers: { "Content-Type": contentType } }),
    getObject: (key: string) => request(key, { method: "GET" }),
    deleteObject: (key: string) => request(key, { method: "DELETE" }),
  };
}
