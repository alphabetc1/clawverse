/**
 * Clawverse configuration types
 */

// Connection configuration for different transport types
export type LocalConnection = {
  type: "local";
  port?: number;
};

export type SshConnection = {
  type: "ssh";
  host: string;
  port?: number;
  user?: string;
  keyPath?: string;
};

export type UrlConnection = {
  type: "url";
  url: string;
  token?: string;
  password?: string;
  tlsFingerprint?: string;
};

export type NodeConnection = LocalConnection | SshConnection | UrlConnection;

// Node configuration
export interface NodeConfig {
  /** Unique identifier for this node */
  id: string;
  /** Human-readable name */
  name: string;
  /** Connection settings */
  connection: NodeConnection;
  /** Optional capability declarations */
  capabilities?: string[];
  /** Whether this node is enabled */
  enabled?: boolean;
  /** Weight for weighted routing strategies (default: 1) */
  weight?: number;
}

// Topology relation modes
export type RelationMode = "control" | "delegate" | "message" | "all";

// Node relationship in topology
export interface NodeRelation {
  /** Parent node ID */
  parent: string;
  /** Child node IDs */
  children: string[];
  /** Relation mode determining allowed operations */
  mode: RelationMode;
}

// Topology mode
export type TopologyMode = "hierarchical" | "parallel" | "mixed";

// Topology configuration
export interface TopologyConfig {
  /** Topology mode: hierarchical (master-worker), parallel (peer), or mixed */
  mode?: TopologyMode;
  relations: NodeRelation[];
}

// ============================================================================
// Routing Configuration
// ============================================================================

// Routing strategies
export type RoutingStrategy = 
  | "round-robin"      // Rotate through targets in order
  | "weighted"         // Use node weights for selection probability
  | "random"           // Random selection
  | "least-connections" // Select node with fewest active connections
  | "first-available"; // Use first healthy target

// Route matching conditions
export interface RouteMatch {
  /** Match by channel (imessage, slack, telegram, etc.) */
  channel?: string;
  /** Match by required node capability */
  capability?: string;
  /** Match by session key pattern (supports * wildcard) */
  sessionPattern?: string;
  /** Match by source node ID */
  sourceNode?: string;
}

// Routing rule
export interface RoutingRule {
  /** Rule name for identification */
  name?: string;
  /** Conditions to match */
  match: RouteMatch;
  /** Single target node ID */
  target?: string;
  /** Multiple target node IDs (used with strategy) */
  targets?: string[];
  /** Strategy for selecting from multiple targets */
  strategy?: RoutingStrategy;
  /** Priority (higher = checked first, default: 0) */
  priority?: number;
}

// Default routing configuration
export interface DefaultRouting {
  /** Strategy for selecting target node */
  strategy: RoutingStrategy;
  /** Target node IDs to route to */
  targets: string[];
  /** Fallback node if all targets are unavailable */
  fallback?: string;
}

// Full routing configuration
export interface RoutingConfig {
  /** Default routing when no rules match */
  default?: DefaultRouting;
  /** Ordered routing rules */
  rules?: RoutingRule[];
}

// Context for route decision making
export interface RouteContext {
  /** Source node ID (if any) */
  sourceNode?: string;
  /** Channel (imessage, slack, etc.) */
  channel?: string;
  /** Session key */
  sessionKey?: string;
  /** Required capabilities */
  capabilities?: string[];
}

// Route decision result
export interface RouteDecision {
  /** Selected target node ID */
  target: string;
  /** Which rule matched (null if default) */
  matchedRule?: string;
  /** Strategy used */
  strategy: RoutingStrategy;
}

// Daemon configuration
export interface DaemonConfig {
  /** Port to listen on for WebSocket (default: 18800) */
  port: number;
  /** Port to listen on for HTTP API (default: 18801) */
  httpPort?: number;
  /** Bind mode */
  bind: "loopback" | "lan";
  /** Health check interval in ms */
  healthCheckIntervalMs?: number;
  /** Connection timeout in ms */
  connectionTimeoutMs?: number;
  /** Optional API token for HTTP authentication */
  apiToken?: string;
}

// Main configuration
export interface ClawverseConfig {
  daemon: DaemonConfig;
  nodes: NodeConfig[];
  topology: TopologyConfig;
  routing?: RoutingConfig;
}

// Default configuration values
export const DEFAULT_CONFIG: ClawverseConfig = {
  daemon: {
    port: 18800,
    httpPort: 18801,
    bind: "loopback",
    healthCheckIntervalMs: 30000,
    connectionTimeoutMs: 10000,
  },
  nodes: [],
  topology: {
    mode: "parallel",
    relations: [],
  },
  routing: {
    default: {
      strategy: "round-robin",
      targets: [],
    },
    rules: [],
  },
};

// Node status
export type NodeStatus = "connected" | "disconnected" | "connecting" | "error";

export interface NodeState {
  id: string;
  status: NodeStatus;
  lastSeen?: number;
  error?: string;
  gatewayVersion?: string;
  agentIds?: string[];
}
