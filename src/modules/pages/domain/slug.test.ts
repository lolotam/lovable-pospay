import { expect, it } from "vitest";
import { validSlug, normalizeSlug } from "./slug";
it.each([
  "admin",
  "app",
  "pos",
  "me",
  "api",
  "s",
  "sign-in",
  "invite",
  "pospay",
  "www",
  "ab",
  "a".repeat(41),
  "Glow",
  "-glow",
  "glow-",
])("rejects %s", (slug) => expect(validSlug(slug)).toBe(false));
it("normalizes a valid public slug", () => {
  expect(normalizeSlug(" Glow-Salon ")).toBe("glow-salon");
  expect(validSlug("glow-salon")).toBe(true);
});
