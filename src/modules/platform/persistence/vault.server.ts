// AES-256-GCM for platform secrets. Key: PLATFORM_SECRETS_KEY (base64, 32 bytes).
let key: Promise<CryptoKey> | undefined;
function getKey() {
  const raw = process.env["PLATFORM_SECRETS_KEY"];
  if (!raw) throw new Error("PLATFORM_SECRETS_KEY_MISSING");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new Error("PLATFORM_SECRETS_KEY_INVALID");
  key ??= crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
  return key;
}
export async function seal(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await getKey(),
    new TextEncoder().encode(plain),
  );
  return `${Buffer.from(iv).toString("base64")}.${Buffer.from(data).toString("base64")}`;
}
export async function open(sealed: string): Promise<string> {
  const [iv, data] = sealed.split(".");
  if (!iv || !data) throw new Error("SECRET_CORRUPT");
  const out = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(iv, "base64") },
    await getKey(),
    Buffer.from(data, "base64"),
  );
  return new TextDecoder().decode(out);
}
