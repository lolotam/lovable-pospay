import { z } from "zod";
import { CONNECTORS } from "./domain/providers";

const ids = CONNECTORS.map((c) => c.id) as [string, ...string[]];
const accountIds = CONNECTORS.filter((c) => c.kind === "account").map((c) => c.id) as [
  string,
  ...string[],
];
const keyIds = CONNECTORS.filter((c) => c.kind === "api_key").map((c) => c.id) as [
  string,
  ...string[],
];

export const providerSchema = z.object({ provider: z.enum(ids) });
export const accountProviderSchema = z.object({ provider: z.enum(accountIds) });
export const loginIdSchema = z.object({ loginId: z.string().uuid() });
export const apiKeySchema = z.object({
  provider: z.enum(keyIds),
  value: z.string().trim().min(8).max(4096),
});
export const defaultAiSchema = z.object({
  provider: z.enum(ids),
  model: z.string().min(1).max(100),
});

export interface ConnectorsStatusDto {
  connected: { provider: string; kind: string; updatedAt: string; email: string | null }[];
  defaultProvider: string | null;
  defaultModel: string | null;
}
export interface LoginStartDto {
  loginId: string;
  userCode: string | null;
  verificationUrl: string;
  expiresInSec: number;
}
export type LoginPollDto =
  { status: "pending" | "complete" } | { status: "failed"; message: string };
