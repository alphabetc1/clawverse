import { z } from "zod";

/**
 * DingTalk webhook message format
 */
export const DingTalkWebhookSchema = z.object({
  msgtype: z.string(),
  text: z.object({ content: z.string() }).optional(),
  msgId: z.string().optional(),
  createAt: z.string().optional(),
  conversationType: z.enum(["1", "2"]).optional(), // 1=private, 2=group
  conversationId: z.string().optional(),
  conversationTitle: z.string().optional(),
  senderId: z.string().optional(),
  senderNick: z.string().optional(),
  senderCorpId: z.string().optional(),
  sessionWebhook: z.string().optional(),
  sessionWebhookExpiredTime: z.number().optional(),
  isAdmin: z.boolean().optional(),
  chatbotCorpId: z.string().optional(),
  chatbotUserId: z.string().optional(),
  isInAtList: z.boolean().optional(),
  atUsers: z.array(z.object({
    dingtalkId: z.string(),
    staffId: z.string().optional(),
  })).optional(),
});

export type DingTalkWebhook = z.infer<typeof DingTalkWebhookSchema>;

/**
 * DingTalk account configuration
 */
export const DingTalkAccountConfigSchema = z.object({
  enabled: z.boolean().default(true),
  name: z.string().optional(),
  outgoingToken: z.string().describe("DingTalk outgoing webhook token"),
  webhookUrl: z.string().optional().describe("Custom webhook URL for replies"),
  // DM policy
  dm: z.object({
    policy: z.enum(["open", "allowlist", "pairing"]).default("allowlist"),
    allowFrom: z.array(z.string()).default([]),
  }).optional(),
  // Group policy
  groupPolicy: z.enum(["open", "allowlist"]).default("allowlist"),
  allowedGroups: z.array(z.string()).default([]),
  requireMention: z.boolean().default(true),
});

export type DingTalkAccountConfig = z.infer<typeof DingTalkAccountConfigSchema>;

/**
 * Resolved DingTalk account
 */
export interface ResolvedDingTalkAccount {
  accountId: string;
  enabled: boolean;
  name?: string;
  outgoingToken: string;
  tokenSource: "config" | "env";
  config: DingTalkAccountConfig;
}

/**
 * DingTalk reply message format
 */
export interface DingTalkReply {
  msgtype: "text" | "markdown" | "actionCard";
  text?: { content: string };
  markdown?: { title: string; text: string };
  actionCard?: {
    title: string;
    text: string;
    singleTitle?: string;
    singleURL?: string;
  };
}
