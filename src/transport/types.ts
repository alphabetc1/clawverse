/**
 * Transport layer types and interfaces
 */

import type { ClawverseMessage } from "../protocol/messages.js";

// Transport connection status
export type TransportStatus = "connecting" | "connected" | "disconnected" | "error";

// Transport event types
export type TransportEventType = 
  | "connected" 
  | "disconnected" 
  | "error" 
  | "message";

export interface TransportEvent {
  type: TransportEventType;
  data?: unknown;
  error?: Error;
}

export type TransportEventHandler = (event: TransportEvent) => void;

// Gateway RPC method response
export interface GatewayRpcResponse<T = unknown> {
  id: string;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// Gateway connection info
export interface GatewayInfo {
  version?: string;
  agentIds?: string[];
  nodeId?: string;
}

/**
 * Transport interface for connecting to OpenClaw gateways
 */
export interface Transport {
  /** Node ID this transport is for */
  readonly nodeId: string;
  
  /** Current connection status */
  readonly status: TransportStatus;
  
  /** Connect to the gateway */
  connect(): Promise<void>;
  
  /** Disconnect from the gateway */
  disconnect(): Promise<void>;
  
  /** Send a Clawverse message through this transport */
  send(message: ClawverseMessage): Promise<void>;
  
  /** Call a gateway RPC method directly */
  call<T = unknown>(method: string, params?: unknown): Promise<GatewayRpcResponse<T>>;
  
  /** Subscribe to transport events */
  on(handler: TransportEventHandler): void;
  
  /** Unsubscribe from transport events */
  off(handler: TransportEventHandler): void;
  
  /** Get gateway info after connection */
  getGatewayInfo(): GatewayInfo | null;
}

// Transport creation options
export interface LocalTransportOptions {
  nodeId: string;
  port?: number;
}

export interface SshTransportOptions {
  nodeId: string;
  host: string;
  port?: number;
  user?: string;
  keyPath?: string;
  gatewayPort?: number;
}

export interface UrlTransportOptions {
  nodeId: string;
  url: string;
  token?: string;
  password?: string;
  tlsFingerprint?: string;
}

export type TransportOptions = 
  | ({ type: "local" } & LocalTransportOptions)
  | ({ type: "ssh" } & SshTransportOptions)
  | ({ type: "url" } & UrlTransportOptions);
