#!/usr/bin/env node
/**
 * Feishu Bridge - Standalone HTTP Server
 */

import express from "express";
import { resolveFeishuAccount, processFeishuMessage } from "./channel.js";
import { FeishuEventSchema } from "./types.js";

const PORT = parseInt(process.env.PORT || "3002", 10);
const OPENCLAW_API_URL = process.env.OPENCLAW_API_URL || process.env.CLAWVERSE_HUB_URL;
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN || process.env.CLAWVERSE_TOKEN;
const MODEL = process.env.MODEL || "gpt-4o";

if (!OPENCLAW_API_URL) {
  console.error("Error: OPENCLAW_API_URL or CLAWVERSE_HUB_URL required");
  process.exit(1);
}

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "healthy", bridge: "feishu" });
});

app.post("/webhook", async (req, res) => {
  try {
    const parsed = FeishuEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    
    const event = parsed.data;
    
    // URL verification
    if (event.challenge) {
      res.json({ challenge: event.challenge });
      return;
    }
    
    const eventType = event.header?.event_type;
    if (eventType !== "im.message.receive_v1") {
      res.json({ code: 0 });
      return;
    }
    
    console.log(`[Feishu] Message received`);
    
    const account = resolveFeishuAccount({ cfg: {}, accountId: null });
    
    await processFeishuMessage(event, {
      account,
      onMessage: async ({ text, history }) => {
        const messages = [
          ...history.map(h => ({ role: h.role, content: h.content })),
          { role: "user" as const, content: text },
        ];
        
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Channel": "feishu",
        };
        if (OPENCLAW_TOKEN) {
          headers["Authorization"] = `Bearer ${OPENCLAW_TOKEN}`;
        }
        
        const response = await fetch(OPENCLAW_API_URL!, {
          method: "POST",
          headers,
          body: JSON.stringify({ model: MODEL, messages, message: text }),
        });
        
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        
        const data = await response.json() as any;
        return data.content || data.choices?.[0]?.message?.content || "No response";
      },
    });
    
    res.json({ code: 0 });
  } catch (err) {
    console.error("[Feishu] Error:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Feishu Bridge running on port ${PORT}`);
});
