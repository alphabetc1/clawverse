import { z } from "zod";

/**
 * Feishu event callback schema
 */
export const FeishuEventSchema = z.object({
  schema: z.string().optional(),
  header: z.object({
    event_id: z.string(),
    event_type: z.string(),
    create_time: z.string(),
    token: z.string(),
    app_id: z.string(),
    tenant_key: z.string(),
  }).optional(),
  event: z.object({
    sender: z.object({
      sender_id: z.object({
        union_id: z.string().optional(),
        user_id: z.string().optional(),
        open_id: z.string().optional(),
      }).optional(),
      sender_type: z.string().optional(),
      tenant_key: z.string().optional(),
    }).optional(),
    message: z.object({
      message_id: z.string(),
      root_id: z.string().optional(),
      parent_id: z.string().optional(),
      create_time: z.string(),
      chat_id: z.string(),
      chat_type: z.string(), // p2p, group
      message_type: z.string(), // text, image, etc.
      content: z.string(), // JSON string
      mentions: z.array(z.object({
        key: z.string(),
        id: z.object({ user_id: z.string().optional(), open_id: z.string().optional() }),
        name: z.string(),
        tenant_key: z.string().optional(),
      })).optional(),
    }).optional(),
  }).optional(),
  // URL verification challenge
  challenge: z.string().optional(),
  type: z.string().optional(),
});

export type FeishuEvent = z.infer<typeof FeishuEventSchema>;

/**
 * Feishu account configuration
 */
export const FeishuAccountConfigSchema = z.object({
  enabled: z.boolean().default(true),
  name: z.string().optional(),
  appId: z.string().describe("Feishu App ID"),
  appSecret: z.string().describe("Feishu App Secret"),
  verificationToken: z.string().optional(),
  encryptKey: z.string().optional(),
  dm: z.object({
    policy: z.enum(["open", "allowlist", "pairing"]).default("open"),
    allowFrom: z.array(z.string()).default([]),
  }).optional(),
  groupPolicy: z.enum(["open", "allowlist"]).default("open"),
  requireMention: z.boolean().default(true),
});

export type FeishuAccountConfig = z.infer<typeof FeishuAccountConfigSchema>;

/**
 * Resolved Feishu account
 */
export interface ResolvedFeishuAccount {
  accountId: string;
  enabled: boolean;
  name?: string;
  appId: string;
  appSecret: string;
  tokenSource: "config" | "env";
  config: FeishuAccountConfig;
}

/**
 * Feishu API message content
 */
export interface FeishuTextContent {
  text: string;
}

export interface FeishuMarkdownContent {
  content: string;
}
