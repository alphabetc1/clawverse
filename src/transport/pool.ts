/**
 * Transport connection pool manager
 */

import type { NodeConfig } from "../config/types.js";
import type { Transport, TransportEventHandler, TransportEvent } from "./types.js";
import { createLocalTransport } from "./local.js";
import { createSshTransport } from "./ssh.js";
import { createUrlTransport } from "./url.js";

export interface TransportPoolOptions {
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect delay in ms */
  reconnectDelayMs?: number;
  /** Max reconnect attempts */
  maxReconnectAttempts?: number;
}

const DEFAULT_OPTIONS: Required<TransportPoolOptions> = {
  autoReconnect: true,
  reconnectDelayMs: 5000,
  maxReconnectAttempts: 10,
};

/**
 * Create a transport for a node configuration
 */
export function createTransportForNode(node: NodeConfig): Transport {
  const conn = node.connection;
  
  switch (conn.type) {
    case "local":
      return createLocalTransport({
        nodeId: node.id,
        port: conn.port,
      });
      
    case "ssh":
      return createSshTransport({
        nodeId: node.id,
        host: conn.host,
        port: conn.port,
        user: conn.user,
        keyPath: conn.keyPath,
      });
      
    case "url":
      return createUrlTransport({
        nodeId: node.id,
        url: conn.url,
        token: conn.token,
        password: conn.password,
        tlsFingerprint: conn.tlsFingerprint,
      });
      
    default:
      throw new Error(`Unknown connection type for node ${node.id}`);
  }
}

/**
 * Transport pool for managing multiple node connections
 */
export class TransportPool {
  private transports: Map<string, Transport> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private options: Required<TransportPoolOptions>;
  private handlers: Set<TransportEventHandler> = new Set();

  constructor(options: TransportPoolOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Add a node to the pool
   */
  async addNode(node: NodeConfig): Promise<void> {
    if (this.transports.has(node.id)) {
      throw new Error(`Node ${node.id} already in pool`);
    }

    const transport = createTransportForNode(node);
    this.setupTransportEvents(transport);
    this.transports.set(node.id, transport);
  }

  /**
   * Remove a node from the pool
   */
  async removeNode(nodeId: string): Promise<void> {
    const transport = this.transports.get(nodeId);
    if (!transport) return;

    await transport.disconnect();
    this.transports.delete(nodeId);
    this.reconnectAttempts.delete(nodeId);
  }

  /**
   * Connect to a specific node
   */
  async connect(nodeId: string): Promise<void> {
    const transport = this.transports.get(nodeId);
    if (!transport) {
      throw new Error(`Node ${nodeId} not found in pool`);
    }

    this.reconnectAttempts.set(nodeId, 0);
    await transport.connect();
  }

  /**
   * Disconnect from a specific node
   */
  async disconnect(nodeId: string): Promise<void> {
    const transport = this.transports.get(nodeId);
    if (transport) {
      await transport.disconnect();
    }
  }

  /**
   * Connect to all nodes
   */
  async connectAll(): Promise<Map<string, Error | null>> {
    const results = new Map<string, Error | null>();
    
    await Promise.all(
      Array.from(this.transports.keys()).map(async (nodeId) => {
        try {
          await this.connect(nodeId);
          results.set(nodeId, null);
        } catch (err) {
          results.set(nodeId, err instanceof Error ? err : new Error(String(err)));
        }
      })
    );

    return results;
  }

  /**
   * Disconnect from all nodes
   */
  async disconnectAll(): Promise<void> {
    await Promise.all(
      Array.from(this.transports.keys()).map((nodeId) => this.disconnect(nodeId))
    );
  }

  /**
   * Get a transport by node ID
   */
  get(nodeId: string): Transport | undefined {
    return this.transports.get(nodeId);
  }

  /**
   * Check if a node is connected
   */
  isConnected(nodeId: string): boolean {
    const transport = this.transports.get(nodeId);
    return transport?.status === "connected";
  }

  /**
   * Get all node IDs
   */
  getNodeIds(): string[] {
    return Array.from(this.transports.keys());
  }

  /**
   * Get status of all nodes
   */
  getStatus(): Map<string, { status: string; error?: string }> {
    const status = new Map<string, { status: string; error?: string }>();
    
    for (const [nodeId, transport] of this.transports) {
      status.set(nodeId, { status: transport.status });
    }
    
    return status;
  }

  /**
   * Subscribe to pool events
   */
  on(handler: TransportEventHandler): void {
    this.handlers.add(handler);
  }

  /**
   * Unsubscribe from pool events
   */
  off(handler: TransportEventHandler): void {
    this.handlers.delete(handler);
  }

  private emit(nodeId: string, event: TransportEvent): void {
    const poolEvent: TransportEvent = {
      ...event,
      data: { nodeId, ...(event.data as object || {}) },
    };
    
    for (const handler of this.handlers) {
      try {
        handler(poolEvent);
      } catch (err) {
        console.error("Pool event handler error:", err);
      }
    }
  }

  private setupTransportEvents(transport: Transport): void {
    transport.on((event) => {
      this.emit(transport.nodeId, event);

      // Handle auto-reconnect
      if (
        this.options.autoReconnect && 
        event.type === "disconnected"
      ) {
        this.scheduleReconnect(transport.nodeId);
      }
    });
  }

  private scheduleReconnect(nodeId: string): void {
    const attempts = this.reconnectAttempts.get(nodeId) ?? 0;
    
    if (attempts >= this.options.maxReconnectAttempts) {
      console.error(`Max reconnect attempts reached for node ${nodeId}`);
      return;
    }

    this.reconnectAttempts.set(nodeId, attempts + 1);

    const delay = this.options.reconnectDelayMs * Math.pow(1.5, attempts);
    
    setTimeout(async () => {
      try {
        await this.connect(nodeId);
        this.reconnectAttempts.set(nodeId, 0);
      } catch (err) {
        console.error(`Reconnect failed for node ${nodeId}:`, err);
      }
    }, delay);
  }
}
