// WhatsApp OTP delivery (D-16). Provider not chosen yet: until WHATSAPP_API_URL and
// WHATSAPP_API_TOKEN are configured, codes are refused in production.
export async function sendWhatsAppOtp(phone: string, code: string): Promise<void> {
  const url = process.env["WHATSAPP_API_URL"];
  const token = process.env["WHATSAPP_API_TOKEN"];
  if (!url || !token) {
    if (process.env["NODE_ENV"] === "production")
      throw new Error("WhatsApp provider not configured");
    console.info(`[dev] WhatsApp OTP for ${phone.slice(-3).padStart(phone.length, "*")}: ${code}`);
    return;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: phone, template: "otp", code }),
  });
  if (!res.ok) throw new Error(`WhatsApp send failed: ${res.status}`);
}
