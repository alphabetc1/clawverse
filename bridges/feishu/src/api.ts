import { splitMessage } from "@clawverse/bridge-common";

const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";
const MAX_MESSAGE_LENGTH = 4000;

// Token cache
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get tenant access token
 */
export async function getTenantAccessToken(
  appId: string,
  appSecret: string,
): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  
  const response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  
  if (!response.ok) {
    throw new Error(`Failed to get token: ${response.status}`);
  }
  
  const data = await response.json() as {
    tenant_access_token: string;
    expire: number;
    code?: number;
    msg?: string;
  };
  
  if (data.code && data.code !== 0) {
    throw new Error(`Feishu API error: ${data.msg}`);
  }
  
  cachedToken = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire - 60) * 1000,
  };
  
  return cachedToken.token;
}

/**
 * Send message to Feishu
 */
export async function sendFeishuMessage(
  token: string,
  receiveId: string,
  receiveIdType: "open_id" | "user_id" | "chat_id",
  msgType: "text" | "interactive",
  content: unknown,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const response = await fetch(`${FEISHU_API_BASE}/im/v1/messages?receive_id_type=${receiveIdType}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: receiveId,
        msg_type: msgType,
        content: JSON.stringify(content),
      }),
    });
    
    const data = await response.json() as {
      code?: number;
      msg?: string;
      data?: { message_id?: string };
    };
    
    if (data.code && data.code !== 0) {
      return { success: false, error: data.msg };
    }
    
    return { success: true, messageId: data.data?.message_id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Reply to a message
 */
export async function replyFeishuMessage(
  token: string,
  messageId: string,
  msgType: "text" | "interactive",
  content: unknown,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${FEISHU_API_BASE}/im/v1/messages/${messageId}/reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        msg_type: msgType,
        content: JSON.stringify(content),
      }),
    });
    
    const data = await response.json() as { code?: number; msg?: string };
    
    if (data.code && data.code !== 0) {
      return { success: false, error: data.msg };
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Send text message, splitting if necessary
 */
export async function sendFeishuText(
  token: string,
  chatId: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  const chunks = splitMessage(text, MAX_MESSAGE_LENGTH);
  
  for (const chunk of chunks) {
    const result = await sendFeishuMessage(token, chatId, "chat_id", "text", { text: chunk });
    if (!result.success) {
      return result;
    }
  }
  
  return { success: true };
}

/**
 * Parse message content from Feishu event
 */
export function parseMessageContent(contentJson: string, messageType: string): string {
  try {
    const content = JSON.parse(contentJson);
    
    if (messageType === "text") {
      // Remove @mentions from text
      let text = content.text || "";
      // Feishu uses @_user_1 format for mentions
      text = text.replace(/@_user_\d+\s*/g, "").trim();
      return text;
    }
    
    // For other types, return a placeholder
    return `[${messageType}]`;
  } catch {
    return "";
  }
}

/**
 * Verify Feishu event signature
 */
export function verifyFeishuSignature(
  timestamp: string,
  nonce: string,
  encryptKey: string,
  body: string,
  signature: string,
): boolean {
  // Feishu uses SHA256(timestamp + nonce + encryptKey + body)
  // For now, return true if no encrypt key is set
  if (!encryptKey) return true;
  
  const crypto = require("crypto");
  const checkStr = timestamp + nonce + encryptKey + body;
  const calculated = crypto.createHash("sha256").update(checkStr).digest("hex");
  return calculated === signature;
}
