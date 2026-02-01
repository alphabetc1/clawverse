/**
 * Daemon client for CLI communication
 */

import WebSocket from "ws";
import type { ClawverseMessage, ContextQueryPayload, ContextHistoryResponse, ContextSessionsResponse } from "../protocol/messages.js";
import type { NodeState } from "../config/types.js";

interface RpcRequest {
  id: string;
  method: string;
  params?: unknown;
}

interface RpcResponse {
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

interface PendingCall {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * Client for communicating with the Clawverse daemon
 */
export class DaemonClient {
  private ws: WebSocket | null = null;
  private pendingCalls: Map<string, PendingCall> = new Map();
  private rpcIdCounter = 0;
  private port: number;

  constructor(port: number) {
    this.port = port;
  }

  /**
   * Connect to the daemon
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `ws://127.0.0.1:${this.port}`;
      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
        this.ws?.close();
      }, 5000);

      this.ws.on("open", () => {
        clearTimeout(timeout);
        resolve();
      });

      this.ws.on("message", (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.ws.on("close", () => {
        for (const pending of this.pendingCalls.values()) {
          clearTimeout(pending.timeout);
          pending.reject(new Error("Connection closed"));
        }
        this.pendingCalls.clear();
      });
    });
  }

  /**
   * Close the connection
   */
  close(): void {
    this.ws?.close();
    this.ws = null;
  }

  /**
   * Get status of all nodes
   */
  async getStatus(): Promise<{ nodes: NodeState[] }> {
    return this.call("status") as Promise<{ nodes: NodeState[] }>;
  }

  /**
   * Send a message to another node
   */
  async sendMessage(
    message: ClawverseMessage,
    timeoutMs?: number
  ): Promise<{ success: boolean; response?: unknown; error?: string }> {
    return this.call("send", { message, timeout: timeoutMs }) as Promise<{
      success: boolean;
      response?: unknown;
      error?: string;
    }>;
  }

  /**
   * Query context from a node
   */
  async queryContext(params: ContextQueryPayload & { nodeId: string }): Promise<ContextHistoryResponse | ContextSessionsResponse> {
    return this.call("context.query", params) as Promise<ContextHistoryResponse | ContextSessionsResponse>;
  }

  /**
   * Get health summary
   */
  async getHealth(): Promise<{
    total: number;
    connected: number;
    disconnected: number;
    error: number;
    healthy: number;
  }> {
    return this.call("health") as Promise<{
      total: number;
      connected: number;
      disconnected: number;
      error: number;
      healthy: number;
    }>;
  }

  /**
   * Get topology tree
   */
  async getTopology(): Promise<unknown> {
    return this.call("topology");
  }

  /**
   * Reload configuration
   */
  async reload(): Promise<{ success: boolean }> {
    return this.call("reload") as Promise<{ success: boolean }>;
  }

  /**
   * Make an RPC call (public for custom methods)
   */
  async call(method: string, params?: unknown): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to daemon");
    }

    const id = `cli-${++this.rpcIdCounter}`;
    const request: RpcRequest = { id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCalls.delete(id);
        reject(new Error(`RPC call ${method} timed out`));
      }, 30000);

      this.pendingCalls.set(id, { resolve, reject, timeout });
      this.ws!.send(JSON.stringify(request));
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data) as RpcResponse;
      
      const pending = this.pendingCalls.get(msg.id);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pendingCalls.delete(msg.id);

      if (msg.error) {
        pending.reject(new Error(msg.error.message));
      } else {
        pending.resolve(msg.result);
      }
    } catch (err) {
      console.error("Failed to handle daemon message:", err);
    }
  }
}

/**
 * Create and connect a daemon client
 */
export async function createDaemonClient(port: number): Promise<DaemonClient> {
  const client = new DaemonClient(port);
  await client.connect();
  return client;
}
