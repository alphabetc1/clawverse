/**
 * DingTalk Channel Plugin for OpenClaw
 * 
 * This implements the ChannelPlugin interface to integrate DingTalk
 * with OpenClaw's channel system.
 */

import type {
  ResolvedDingTalkAccount,
  DingTalkAccountConfig,
  DingTalkWebhook,
} from "./types.js";
import { DingTalkAccountConfigSchema, DingTalkWebhookSchema } from "./types.js";
import { sendDingTalkText, sendDingTalkMarkdown, extractMessageText, wasBotMentioned } from "./api.js";
import { SessionStore, parseCommand, getHelpText, formatError } from "@clawverse/bridge-common";

// Default account ID
const DEFAULT_ACCOUNT_ID = "default";

// Session store for conversation history
const sessions = new SessionStore({ maxHistoryTurns: 10 });

/**
 * DingTalk channel metadata
 */
export const dingtalkMeta = {
  id: "dingtalk" as const,
  label: "DingTalk",
  selectionLabel: "DingTalk (钉钉)",
  blurb: "Connect to DingTalk enterprise robot",
  docsPath: "/channels/dingtalk",
};

/**
 * DingTalk channel capabilities
 */
export const dingtalkCapabilities = {
  chatTypes: ["direct", "group"] as const,
  polls: false,
  reactions: false,
  threads: false,
  media: false,
  markdown: true,
};

/**
 * Resolve DingTalk account from config
 */
export function resolveDingTalkAccount(params: {
  cfg: { channels?: { dingtalk?: DingTalkAccountConfig & { accounts?: Record<string, DingTalkAccountConfig> } } };
  accountId?: string | null;
}): ResolvedDingTalkAccount {
  const { cfg, accountId } = params;
  const resolvedId = accountId?.trim() || DEFAULT_ACCOUNT_ID;
  
  const baseConfig = cfg.channels?.dingtalk;
  const accountConfig = resolvedId !== DEFAULT_ACCOUNT_ID
    ? baseConfig?.accounts?.[resolvedId]
    : baseConfig;
  
  // Try env fallback for token
  const envToken = process.env.DINGTALK_OUTGOING_TOKEN;
  const token = accountConfig?.outgoingToken?.trim() || envToken || "";
  
  const config = DingTalkAccountConfigSchema.parse({
    ...accountConfig,
    outgoingToken: token,
  });
  
  return {
    accountId: resolvedId,
    enabled: config.enabled,
    name: config.name,
    outgoingToken: token,
    tokenSource: accountConfig?.outgoingToken ? "config" : "env",
    config,
  };
}

/**
 * List all configured DingTalk account IDs
 */
export function listDingTalkAccountIds(cfg: {
  channels?: { dingtalk?: { accounts?: Record<string, unknown> } };
}): string[] {
  const accounts = cfg.channels?.dingtalk?.accounts;
  if (!accounts) return [DEFAULT_ACCOUNT_ID];
  return [DEFAULT_ACCOUNT_ID, ...Object.keys(accounts)];
}

/**
 * Process incoming DingTalk webhook message
 */
export async function processDingTalkMessage(
  webhook: DingTalkWebhook,
  options: {
    account: ResolvedDingTalkAccount;
    onMessage: (params: {
      text: string;
      history: Array<{ role: "user" | "assistant"; content: string }>;
      senderId: string;
      conversationId: string;
    }) => Promise<string>;
  },
): Promise<{ handled: boolean; error?: string }> {
  const { account, onMessage } = options;
  
  // Verify token
  // Note: In production, verify signature from headers
  
  // Extract message
  const text = extractMessageText(webhook);
  if (!text) {
    return { handled: false, error: "No text content" };
  }
  
  const senderId = webhook.senderId || "unknown";
  const conversationId = webhook.conversationId || senderId;
  const sessionWebhook = webhook.sessionWebhook;
  
  if (!sessionWebhook) {
    return { handled: false, error: "No session webhook" };
  }
  
  // Check group policy
  const isGroup = webhook.conversationType === "2";
  if (isGroup) {
    if (account.config.requireMention && !wasBotMentioned(webhook)) {
      return { handled: false }; // Silently ignore non-mentions in group
    }
    
    if (account.config.groupPolicy === "allowlist") {
      const allowed = account.config.allowedGroups || [];
      if (allowed.length > 0 && !allowed.includes(conversationId)) {
        return { handled: false }; // Group not in allowlist
      }
    }
  }
  
  // Check DM policy
  if (!isGroup && account.config.dm?.policy === "allowlist") {
    const allowed = account.config.dm.allowFrom || [];
    if (allowed.length > 0 && !allowed.includes(senderId)) {
      await sendDingTalkText(sessionWebhook, "⚠️ You are not authorized to chat with this bot.");
      return { handled: true };
    }
  }
  
  // Handle commands
  const command = parseCommand(text);
  if (command) {
    const response = await handleCommand(command.command, command.args, conversationId, senderId);
    await sendDingTalkText(sessionWebhook, response);
    return { handled: true };
  }
  
  // Get session and history
  const session = sessions.getOrCreate(conversationId, senderId);
  
  try {
    // Call AI handler
    const response = await onMessage({
      text,
      history: session.history as Array<{ role: "user" | "assistant"; content: string }>,
      senderId,
      conversationId,
    });
    
    // Update history
    sessions.addHistory(conversationId, senderId, [
      { role: "user", content: text },
      { role: "assistant", content: response },
    ]);
    
    // Send response
    await sendDingTalkText(sessionWebhook, response);
    return { handled: true };
  } catch (err) {
    const errorMsg = formatError(err);
    await sendDingTalkText(sessionWebhook, errorMsg);
    return { handled: true, error: String(err) };
  }
}

/**
 * Handle bot commands
 */
async function handleCommand(
  command: string,
  args: string[],
  conversationId: string,
  userId: string,
): Promise<string> {
  switch (command) {
    case "new":
      sessions.delete(conversationId, userId);
      return "✅ Started new conversation.";
    
    case "clear":
      sessions.clearHistory(conversationId, userId);
      return "✅ Conversation history cleared.";
    
    case "help":
      return getHelpText("DingTalk");
    
    default:
      return `Unknown command: /${command}\nType /help for available commands.`;
  }
}

/**
 * The DingTalk channel plugin (OpenClaw-compatible interface)
 * 
 * Note: This is a simplified version. For full OpenClaw integration,
 * you would implement all the adapters from ChannelPlugin interface.
 */
export const dingtalkPlugin = {
  id: "dingtalk" as const,
  meta: dingtalkMeta,
  capabilities: dingtalkCapabilities,
  
  config: {
    listAccountIds: listDingTalkAccountIds,
    resolveAccount: resolveDingTalkAccount,
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    isConfigured: (account: ResolvedDingTalkAccount) => Boolean(account.outgoingToken),
    describeAccount: (account: ResolvedDingTalkAccount) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.outgoingToken),
      tokenSource: account.tokenSource,
    }),
  },
  
  outbound: {
    deliveryMode: "direct" as const,
    textChunkLimit: 2000,
    sendText: async (ctx: { to: string; text: string; cfg: unknown }) => {
      // In DingTalk, we typically respond via session webhook
      // Direct sending requires additional API setup
      return { channel: "dingtalk", success: false, error: "Direct send not supported; use session webhook" };
    },
  },
  
  // Webhook handler for standalone mode
  handleWebhook: processDingTalkMessage,
};
