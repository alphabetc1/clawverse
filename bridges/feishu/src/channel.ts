/**
 * Feishu Channel Plugin for OpenClaw
 */

import type { ResolvedFeishuAccount, FeishuAccountConfig, FeishuEvent } from "./types.js";
import { FeishuAccountConfigSchema } from "./types.js";
import { getTenantAccessToken, sendFeishuText, replyFeishuMessage, parseMessageContent } from "./api.js";
import { SessionStore, parseCommand, getHelpText, formatError } from "@clawverse/bridge-common";

const DEFAULT_ACCOUNT_ID = "default";
const sessions = new SessionStore({ maxHistoryTurns: 10 });

export const feishuMeta = {
  id: "feishu" as const,
  label: "Feishu",
  selectionLabel: "Feishu (飞书/Lark)",
  blurb: "Connect to Feishu/Lark bot",
  docsPath: "/channels/feishu",
};

export const feishuCapabilities = {
  chatTypes: ["direct", "group"] as const,
  polls: false,
  reactions: true,
  threads: true,
  media: true,
  markdown: true,
};

export function resolveFeishuAccount(params: {
  cfg: { channels?: { feishu?: FeishuAccountConfig & { accounts?: Record<string, FeishuAccountConfig> } } };
  accountId?: string | null;
}): ResolvedFeishuAccount {
  const { cfg, accountId } = params;
  const resolvedId = accountId?.trim() || DEFAULT_ACCOUNT_ID;
  
  const baseConfig = cfg.channels?.feishu;
  const accountConfig = resolvedId !== DEFAULT_ACCOUNT_ID
    ? baseConfig?.accounts?.[resolvedId]
    : baseConfig;
  
  const envAppId = process.env.FEISHU_APP_ID || "";
  const envAppSecret = process.env.FEISHU_APP_SECRET || "";
  
  const appId = accountConfig?.appId?.trim() || envAppId;
  const appSecret = accountConfig?.appSecret?.trim() || envAppSecret;
  
  const config = FeishuAccountConfigSchema.parse({
    ...accountConfig,
    appId,
    appSecret,
  });
  
  return {
    accountId: resolvedId,
    enabled: config.enabled,
    name: config.name,
    appId,
    appSecret,
    tokenSource: accountConfig?.appId ? "config" : "env",
    config,
  };
}

export function listFeishuAccountIds(cfg: {
  channels?: { feishu?: { accounts?: Record<string, unknown> } };
}): string[] {
  const accounts = cfg.channels?.feishu?.accounts;
  if (!accounts) return [DEFAULT_ACCOUNT_ID];
  return [DEFAULT_ACCOUNT_ID, ...Object.keys(accounts)];
}

export async function processFeishuMessage(
  event: FeishuEvent,
  options: {
    account: ResolvedFeishuAccount;
    onMessage: (params: {
      text: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
      senderId: string;
      conversationId: string;
    }) => Promise<string>;
  },
): Promise<{ handled: boolean; error?: string }> {
  const { account, onMessage } = options;
  
  // Handle URL verification
  if (event.challenge) {
    return { handled: true }; // Challenge is handled at HTTP level
  }
  
  const message = event.event?.message;
  const sender = event.event?.sender;
  
  if (!message || !sender) {
    return { handled: false, error: "Missing message or sender" };
  }
  
  if (message.message_type !== "text") {
    return { handled: false }; // Only handle text for now
  }
  
  const text = parseMessageContent(message.content, message.message_type);
  if (!text) {
    return { handled: false, error: "No text content" };
  }
  
  const senderId = sender.sender_id?.open_id || sender.sender_id?.user_id || "unknown";
  const chatId = message.chat_id;
  const messageId = message.message_id;
  const isGroup = message.chat_type === "group";
  
  // Check mention in group
  if (isGroup && account.config.requireMention) {
    const hasMention = message.mentions && message.mentions.length > 0;
    if (!hasMention) {
      return { handled: false };
    }
  }
  
  // Get token
  let token: string;
  try {
    token = await getTenantAccessToken(account.appId, account.appSecret);
  } catch (err) {
    return { handled: false, error: `Auth failed: ${err}` };
  }
  
  // Handle commands
  const command = parseCommand(text);
  if (command) {
    const response = await handleCommand(command.command, chatId, senderId);
    await replyFeishuMessage(token, messageId, "text", { text: response });
    return { handled: true };
  }
  
  // Get session
  const session = sessions.getOrCreate(chatId, senderId);
  
  try {
    const response = await onMessage({
      text,
      history: session.history as Array<{ role: "user" | "assistant"; content: string }>,
      senderId,
      conversationId: chatId,
    });
    
    sessions.addHistory(chatId, senderId, [
      { role: "user", content: text },
      { role: "assistant", content: response },
    ]);
    
    await replyFeishuMessage(token, messageId, "text", { text: response });
    return { handled: true };
  } catch (err) {
    const errorMsg = formatError(err);
    await replyFeishuMessage(token, messageId, "text", { text: errorMsg });
    return { handled: true, error: String(err) };
  }
}

async function handleCommand(command: string, chatId: string, userId: string): Promise<string> {
  switch (command) {
    case "new":
      sessions.delete(chatId, userId);
      return "✅ Started new conversation.";
    case "clear":
      sessions.clearHistory(chatId, userId);
      return "✅ History cleared.";
    case "help":
      return getHelpText("Feishu");
    default:
      return `Unknown command: /${command}`;
  }
}

export const feishuPlugin = {
  id: "feishu" as const,
  meta: feishuMeta,
  capabilities: feishuCapabilities,
  
  config: {
    listAccountIds: listFeishuAccountIds,
    resolveAccount: resolveFeishuAccount,
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: (account: ResolvedFeishuAccount) => Boolean(account.appId && account.appSecret),
  },
  
  outbound: {
    deliveryMode: "direct" as const,
    textChunkLimit: 4000,
  },
  
  handleWebhook: processFeishuMessage,
};
