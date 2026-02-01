import { z } from "zod";

// Base message envelope
export const MessageEnvelopeSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.number(),
  source: z.object({
    channel: z.string(),
    sender: z.string(),
    conversationId: z.string().optional(),
    threadId: z.string().optional(),
  }),
  content: z.object({
    type: z.enum(["text", "image", "audio", "video", "file", "multimodal"]),
    text: z.string().optional(),
    attachments: z
      .array(
        z.object({
          type: z.string(),
          url: z.string().optional(),
          data: z.string().optional(),
          mimeType: z.string().optional(),
        })
      )
      .optional(),
  }),
  metadata: z.record(z.unknown()).optional(),
});

export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;

// Routing decision
export interface RoutingDecision {
  targetNode: string;
  rule?: string;
  fallback: boolean;
  escalatedFrom?: string;
}

// Agent request to OpenClaw
export interface AgentRequest {
  messageId: string;
  message: string;
  sessionKey?: string;
  model?: string;
  thinkingLevel?: string;
  attachments?: Array<{
    type: string;
    url?: string;
    data?: string;
  }>;
  metadata?: Record<string, unknown>;
}

// Agent response from OpenClaw
export interface AgentResponse {
  messageId: string;
  status: "success" | "error" | "escalate" | "timeout";
  content?: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, unknown>;
}

// WebSocket RPC message types
export type RpcMethod =
  | "hub.status"
  | "hub.nodes"
  | "hub.config"
  | "node.register"
  | "node.heartbeat"
  | "node.status"
  | "message.route"
  | "message.send"
  | "sync.pull"
  | "sync.push";

export interface RpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: RpcMethod;
  params?: Record<string, unknown>;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface RpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}
