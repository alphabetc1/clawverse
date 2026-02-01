import { z } from "zod";

// Node connection configuration
export const NodeConnectionSchema = z.object({
  url: z.string().url().describe("WebSocket URL for the OpenClaw gateway"),
  token: z.string().optional().describe("Authentication token"),
  password: z.string().optional().describe("Authentication password"),
  sshTarget: z.string().optional().describe("SSH target for tunnel (user@host)"),
  sshIdentity: z.string().optional().describe("SSH identity file path"),
  labels: z.array(z.string()).optional().describe("Node labels for routing"),
  capabilities: z.array(z.string()).optional().describe("Node capabilities"),
});

export type NodeConnection = z.infer<typeof NodeConnectionSchema>;

// Topology configuration
export const TopologySchema = z.object({
  type: z.enum(["flat", "tree"]).default("flat"),
  root: z.string().optional().describe("Root node ID for tree topology"),
  children: z.record(z.array(z.string())).optional().describe("Parent -> children mapping"),
});

export type Topology = z.infer<typeof TopologySchema>;

// Routing rule
export const RoutingRuleSchema = z.object({
  match: z.object({
    channel: z.string().optional(),
    label: z.string().optional(),
    tag: z.string().optional(),
    sender: z.string().optional(),
  }),
  target: z.string().describe("Target node ID"),
  priority: z.number().default(0),
});

export type RoutingRule = z.infer<typeof RoutingRuleSchema>;

// Routing configuration
export const RoutingConfigSchema = z.object({
  default: z.string().describe("Default target node ID"),
  rules: z.array(RoutingRuleSchema).default([]),
  escalation: z
    .object({
      enabled: z.boolean().default(true),
      triggers: z.array(z.string()).default(["ESCALATE", "UNABLE_TO_HANDLE"]),
    })
    .optional(),
});

export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;

// Sync configuration
export const SyncConfigSchema = z.object({
  enabled: z.boolean().default(true),
  interval: z.number().default(60).describe("Sync interval in seconds"),
  scope: z
    .object({
      memory: z.boolean().default(true),
      sessions: z.boolean().default(true),
      config: z.boolean().default(false),
      skills: z.boolean().default(true),
    })
    .default({}),
  conflictResolution: z.enum(["last-write-wins", "merge", "manual"]).default("last-write-wins"),
});

export type SyncConfig = z.infer<typeof SyncConfigSchema>;

// Channel bridge configuration
export const ChannelBridgeSchema = z.object({
  type: z.enum(["dingtalk", "feishu", "wecom", "webhook"]),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
});

export type ChannelBridge = z.infer<typeof ChannelBridgeSchema>;

// Hub server configuration
export const HubServerSchema = z.object({
  host: z.string().default("0.0.0.0"),
  port: z.number().default(18800),
  auth: z
    .object({
      enabled: z.boolean().default(true),
      token: z.string().optional(),
    })
    .optional(),
});

export type HubServer = z.infer<typeof HubServerSchema>;

// Main ClawVerse configuration
export const ClawVerseConfigSchema = z.object({
  nodes: z.record(NodeConnectionSchema).describe("OpenClaw node configurations"),
  topology: TopologySchema.default({ type: "flat" }),
  routing: RoutingConfigSchema,
  sync: SyncConfigSchema.default({}),
  bridges: z.array(ChannelBridgeSchema).default([]),
  server: HubServerSchema.default({}),
});

export type ClawVerseConfig = z.infer<typeof ClawVerseConfigSchema>;

// Runtime node state
export interface NodeState {
  id: string;
  connection: NodeConnection;
  status: "online" | "offline" | "degraded" | "connecting";
  lastHeartbeat: number;
  lastError?: string;
  metadata?: {
    version?: string;
    agentId?: string;
    channels?: string[];
  };
}

// Hub state
export interface HubState {
  nodes: Map<string, NodeState>;
  startedAt: number;
  config: ClawVerseConfig;
}
