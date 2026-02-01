#!/usr/bin/env node
/**
 * DingTalk Bridge - Standalone HTTP Server
 * 
 * Run this to receive DingTalk webhooks and forward to OpenClaw/ClawVerse.
 */

import express from "express";
import { dingtalkPlugin, resolveDingTalkAccount, processDingTalkMessage } from "./channel.js";
import { DingTalkWebhookSchema } from "./types.js";

// Configuration from environment
const PORT = parseInt(process.env.PORT || "3001", 10);
const OPENCLAW_API_URL = process.env.OPENCLAW_API_URL || process.env.CLAWVERSE_HUB_URL;
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || process.env.CLAWVERSE_TOKEN;
const MODEL = process.env.MODEL || "gpt-4o";

if (!OPENCLAW_API_URL) {
  console.error("Error: OPENCLAW_API_URL or CLAWVERSE_HUB_URL required");
  process.exit(1);
}

const app = express();
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", bridge: "dingtalk" });
});

// DingTalk webhook endpoint
app.post("/webhook", async (req, res) => {
  try {
    const parsed = DingTalkWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn("Invalid webhook payload:", parsed.error);
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    
    const webhook = parsed.data;
    console.log(`[DingTalk] Message from ${webhook.senderNick || webhook.senderId}: ${webhook.text?.content?.slice(0, 50)}...`);
    
    // Resolve account (uses env token in standalone mode)
    const account = resolveDingTalkAccount({ cfg: {}, accountId: null });
    
    if (!account.outgoingToken) {
      console.error("DINGTALK_OUTGOING_TOKEN not configured");
      res.status(500).json({ error: "Token not configured" });
      return;
    }
    
    // Process message
    const result = await processDingTalkMessage(webhook, {
      account,
      onMessage: async ({ text, history }) => {
        // Call OpenClaw/ClawVerse API
        const messages = [
          ...history.map(h => ({ role: h.role, content: h.content })),
          { role: "user" as const, content: text },
        ];
        
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Channel": "dingtalk",
        };
        if (OPENCLAW_TOKEN) {
          headers["Authorization"] = `Bearer ${OPENCLAW_TOKEN}`;
        }
        
        const response = await fetch(OPENCLAW_API_URL!, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: MODEL,
            messages,
            message: text,
          }),
        });
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json() as {
          content?: string;
          choices?: Array<{ message?: { content?: string } }>;
        };
        
        return data.content || data.choices?.[0]?.message?.content || "No response";
      },
    });
    
    if (result.error) {
      console.error(`[DingTalk] Error: ${result.error}`);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error("[DingTalk] Webhook error:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`DingTalk Bridge running on port ${PORT}`);
  console.log(`  Target API: ${OPENCLAW_API_URL}`);
  console.log(`  Webhook URL: http://localhost:${PORT}/webhook`);
});
