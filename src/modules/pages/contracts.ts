import { z } from "zod";
import { RESERVED_SLUGS } from "./domain/slug";
const text = (max: number) => z.object({ ar: z.string().max(max), en: z.string().max(max) });
const base = { id: z.uuid(), hidden: z.boolean() };
export const pageBlockSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("hero"), title: text(80), subtitle: text(160) }),
  z.object({ ...base, type: z.literal("about"), body: text(1000) }),
  z.object({ ...base, type: z.literal("services"), showPrices: z.boolean() }),
  z.object({
    ...base,
    type: z.literal("branches"),
    items: z
      .array(
        z.object({
          name: text(80),
          address: text(200),
          hours: text(200),
          mapUrl: z.url().startsWith("https://").or(z.literal("")),
        }),
      )
      .max(10),
  }),
  z.object({
    ...base,
    type: z.literal("contact"),
    whatsapp: z
      .string()
      .regex(/^[0-9]{8,15}$/)
      .or(z.literal("")),
    phone: z
      .string()
      .regex(/^[0-9]{8,15}$/)
      .or(z.literal("")),
    instagram: z.string().regex(/^[A-Za-z0-9._]{0,30}$/),
  }),
  z.object({
    ...base,
    type: z.literal("gallery"),
    images: z.array(z.object({ assetId: z.uuid(), alt: text(200) })).max(6),
  }),
  z.object({ ...base, type: z.literal("cta"), label: text(40), message: text(200) }),
]);
export const pageDocumentSchema = z.object({
  logoAssetId: z.uuid().nullable().optional(),
  heroImageAssetId: z.uuid().nullable().optional(),
  blocks: z.array(pageBlockSchema).max(12),
});
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/)
  .refine((value) => !RESERVED_SLUGS.includes(value));
export type PageBlock = z.infer<typeof pageBlockSchema>;
export type PageDocument = z.infer<typeof pageDocumentSchema>;
export type LocalizedText = { ar: string; en: string };
export const publicPageSchema = z.object({
  companyName: z.string(),
  currency: z.string(),
  document: pageDocumentSchema,
  services: z.array(
    z.object({ id: z.uuid(), name: z.string(), priceMills: z.string().regex(/^\d+$/) }),
  ),
});
export type PublicPageDto = z.infer<typeof publicPageSchema>;
export const pageDraftSchema = z.object({
  slug: z.string(),
  document: pageDocumentSchema,
  version: z.number().int().nonnegative(),
  publishedAt: z.string().nullable(),
  companyName: z.string(),
  currency: z.string(),
  services: publicPageSchema.shape.services,
});
export type PageDraftDto = z.infer<typeof pageDraftSchema>;
export const savePageInput = z
  .object({
    slug: slugSchema,
    document: pageDocumentSchema,
    version: z.number().int().nonnegative(),
  })
  .strict();
export type SavePageInput = z.infer<typeof savePageInput>;
export const pageVersionInput = z.object({ version: z.number().int().positive() }).strict();
export const pageSlugInput = z.object({ slug: slugSchema }).strict();

export const assetIdInput = z.object({ id: z.uuid() }).strict();
export const assetAltSchema = text(200);
