/**
 * Clawverse cross-node message protocol
 */

// Message types
export type MessageType = 
  | "control" 
  | "delegate" 
  | "message" 
  | "context_query" 
  | "context_response"
  | "ping"
  | "pong";

// Base message structure
export interface ClawverseMessage {
  /** Unique message ID */
  id: string;
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Message type */
  type: MessageType;
  /** Message payload */
  payload: unknown;
  /** Timestamp */
  timestamp: number;
  /** Optional correlation ID for request/response */
  correlationId?: string;
}

// Control payload for managing remote nodes
export interface ControlPayload {
  action: "restart" | "stop" | "config_update" | "status" | "health";
  params?: Record<string, unknown>;
}

// Control response
export interface ControlResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Delegate payload for task delegation
export interface DelegatePayload {
  /** Task description to send to the agent */
  task: string;
  /** Optional context to include */
  context?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Node ID to send response to */
  replyTo?: string;
  /** Target session key */
  sessionKey?: string;
  /** Thinking level override */
  thinkingLevel?: string;
}

// Delegate response
export interface DelegateResponse {
  success: boolean;
  response?: string;
  error?: string;
  runId?: string;
  duration?: number;
}

// Simple message payload
export interface MessagePayload {
  /** Message text */
  text: string;
  /** Target session key */
  sessionKey?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

// Context query payload
export interface ContextQueryPayload {
  queryType: "session_history" | "session_list" | "user_profile";
  sessionKey?: string;
  limit?: number;
  agentId?: string;
}

// Context response - session history
export interface SessionHistoryItem {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
  toolCalls?: unknown[];
}

export interface ContextHistoryResponse {
  messages: SessionHistoryItem[];
  sessionKey: string;
  totalMessages?: number;
}

// Context response - session list
export interface SessionListItem {
  sessionKey: string;
  label?: string;
  updatedAt?: number;
  channel?: string;
  messageCount?: number;
}

export interface ContextSessionsResponse {
  sessions: SessionListItem[];
}

// Context response union
export type ContextResponse = ContextHistoryResponse | ContextSessionsResponse;

// Ping/pong for health checks
export interface PingPayload {
  timestamp: number;
}

export interface PongPayload {
  timestamp: number;
  receivedAt: number;
  nodeVersion?: string;
  gatewayVersion?: string;
}

// Message validation
export function isValidMessage(msg: unknown): msg is ClawverseMessage {
  if (!msg || typeof msg !== "object") return false;
  
  const m = msg as Record<string, unknown>;
  
  if (typeof m.id !== "string" || !m.id) return false;
  if (typeof m.source !== "string" || !m.source) return false;
  if (typeof m.target !== "string" || !m.target) return false;
  if (typeof m.type !== "string") return false;
  if (typeof m.timestamp !== "number") return false;
  
  const validTypes: MessageType[] = [
    "control", "delegate", "message", 
    "context_query", "context_response",
    "ping", "pong"
  ];
  
  if (!validTypes.includes(m.type as MessageType)) return false;
  
  return true;
}

// Create message helpers
export function createMessage(
  source: string,
  target: string,
  type: MessageType,
  payload: unknown,
  correlationId?: string
): ClawverseMessage {
  return {
    id: crypto.randomUUID(),
    source,
    target,
    type,
    payload,
    timestamp: Date.now(),
    correlationId,
  };
}

export function createControlMessage(
  source: string,
  target: string,
  action: ControlPayload["action"],
  params?: Record<string, unknown>
): ClawverseMessage {
  return createMessage(source, target, "control", { action, params } as ControlPayload);
}

export function createDelegateMessage(
  source: string,
  target: string,
  task: string,
  options?: Partial<Omit<DelegatePayload, "task">>
): ClawverseMessage {
  return createMessage(source, target, "delegate", {
    task,
    ...options,
  } as DelegatePayload);
}

export function createContextQuery(
  source: string,
  target: string,
  queryType: ContextQueryPayload["queryType"],
  options?: Partial<Omit<ContextQueryPayload, "queryType">>
): ClawverseMessage {
  return createMessage(source, target, "context_query", {
    queryType,
    ...options,
  } as ContextQueryPayload);
}

export function createPing(source: string, target: string): ClawverseMessage {
  return createMessage(source, target, "ping", { timestamp: Date.now() } as PingPayload);
}

export function createPong(
  source: string,
  target: string,
  pingTimestamp: number,
  versions?: { nodeVersion?: string; gatewayVersion?: string }
): ClawverseMessage {
  return createMessage(source, target, "pong", {
    timestamp: pingTimestamp,
    receivedAt: Date.now(),
    ...versions,
  } as PongPayload);
}
