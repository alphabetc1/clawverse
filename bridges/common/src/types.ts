import { z } from "zod";

/**
 * Bridge mode: standalone (HTTP server) or plugin (OpenClaw integration)
 */
export type BridgeMode = "standalone" | "plugin";

/**
 * Common bridge configuration schema
 */
export const BridgeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  name: z.string().optional(),
  // Target for messages - either ClawVerse Hub or direct OpenClaw
  target: z.object({
    type: z.enum(["clawverse", "openclaw"]).default("openclaw"),
    url: z.string().optional(),
    token: z.string().optional(),
  }).default({}),
  // Session management
  session: z.object({
    maxHistoryTurns: z.number().default(10),
    expireDays: z.number().default(7),
    dbPath: z.string().optional(),
  }).default({}),
  // Model settings
  model: z.string().default("gpt-4o"),
});

export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;

/**
 * Inbound message from external channel
 */
export interface InboundMessage {
  id: string;
  channel: string;
  sender: {
    id: string;
    name?: string;
    avatar?: string;
  };
  conversation?: {
    id: string;
    type: "direct" | "group";
    name?: string;
  };
  content: {
    type: "text" | "image" | "audio" | "file";
    text?: string;
    mediaUrl?: string;
  };
  replyTo?: string;
  timestamp: number;
  raw?: unknown;
}

/**
 * Outbound message to external channel
 */
export interface OutboundMessage {
  to: string;
  text: string;
  mediaUrl?: string;
  replyTo?: string;
  format?: "text" | "markdown";
}

/**
 * Message delivery result
 */
export interface DeliveryResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Session history entry
 */
export interface HistoryEntry {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
}

/**
 * Bridge session state
 */
export interface BridgeSession {
  id: string;
  conversationId: string;
  userId: string;
  history: HistoryEntry[];
  createdAt: number;
  lastActiveAt: number;
  metadata?: Record<string, unknown>;
}
