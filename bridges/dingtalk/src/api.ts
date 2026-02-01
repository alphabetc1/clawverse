import type { DingTalkReply, DingTalkWebhook } from "./types.js";
import { splitMessage } from "@clawverse/bridge-common";

const MAX_MESSAGE_LENGTH = 2000;

/**
 * Send reply to DingTalk via session webhook
 */
export async function sendDingTalkReply(
  sessionWebhook: string,
  reply: DingTalkReply,
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(sessionWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reply),
    });
    
    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${text}` };
    }
    
    const data = await response.json() as { errcode?: number; errmsg?: string };
    if (data.errcode && data.errcode !== 0) {
      return { success: false, error: data.errmsg || `Error code: ${data.errcode}` };
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Send text message, splitting if necessary
 */
export async function sendDingTalkText(
  sessionWebhook: string,
  text: string,
  options?: { atUserIds?: string[] },
): Promise<{ success: boolean; error?: string }> {
  const chunks = splitMessage(text, MAX_MESSAGE_LENGTH);
  
  for (const chunk of chunks) {
    const content = options?.atUserIds?.length
      ? `${options.atUserIds.map(id => `@${id}`).join(" ")} ${chunk}`
      : chunk;
    
    const result = await sendDingTalkReply(sessionWebhook, {
      msgtype: "text",
      text: { content },
    });
    
    if (!result.success) {
      return result;
    }
  }
  
  return { success: true };
}

/**
 * Send markdown message
 */
export async function sendDingTalkMarkdown(
  sessionWebhook: string,
  title: string,
  text: string,
): Promise<{ success: boolean; error?: string }> {
  const chunks = splitMessage(text, MAX_MESSAGE_LENGTH);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunkTitle = chunks.length > 1 ? `${title} (${i + 1}/${chunks.length})` : title;
    const result = await sendDingTalkReply(sessionWebhook, {
      msgtype: "markdown",
      markdown: { title: chunkTitle, text: chunks[i] },
    });
    
    if (!result.success) {
      return result;
    }
  }
  
  return { success: true };
}

/**
 * Verify DingTalk webhook signature (for security)
 */
export function verifyDingTalkToken(
  receivedToken: string,
  expectedToken: string,
): boolean {
  // Simple token comparison for outgoing webhook
  return receivedToken === expectedToken;
}

/**
 * Extract text content from DingTalk webhook
 */
export function extractMessageText(webhook: DingTalkWebhook): string {
  if (webhook.msgtype === "text" && webhook.text?.content) {
    // Remove @mentions from text
    return webhook.text.content.replace(/@\S+\s*/g, "").trim();
  }
  return "";
}

/**
 * Check if bot was mentioned in group chat
 */
export function wasBotMentioned(webhook: DingTalkWebhook): boolean {
  return webhook.isInAtList === true;
}
