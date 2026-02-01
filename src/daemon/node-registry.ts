/**
 * Node registry - manages all configured nodes and their states
 */

import type { NodeConfig, NodeState } from "../config/types.js";
import type { Transport, TransportEvent } from "../transport/types.js";
import { TransportPool } from "../transport/pool.js";

export interface NodeRegistryOptions {
  /** Health check interval in ms */
  healthCheckIntervalMs?: number;
  /** Connection timeout in ms */
  connectionTimeoutMs?: number;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
}

const DEFAULT_OPTIONS: Required<NodeRegistryOptions> = {
  healthCheckIntervalMs: 30000,
  connectionTimeoutMs: 10000,
  autoReconnect: true,
};

type NodeStateChangeHandler = (nodeId: string, state: NodeState) => void;

/**
 * Node registry manages connections and state for all configured nodes
 */
export class NodeRegistry {
  private nodes: Map<string, NodeConfig> = new Map();
  private states: Map<string, NodeState> = new Map();
  private pool: TransportPool;
  private options: Required<NodeRegistryOptions>;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private stateChangeHandlers: Set<NodeStateChangeHandler> = new Set();

  constructor(options: NodeRegistryOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.pool = new TransportPool({
      autoReconnect: this.options.autoReconnect,
      reconnectDelayMs: 5000,
      maxReconnectAttempts: 10,
    });

    // Listen for pool events
    this.pool.on((event) => this.handlePoolEvent(event));
  }

  /**
   * Register a node
   */
  async register(node: NodeConfig): Promise<void> {
    if (this.nodes.has(node.id)) {
      throw new Error(`Node ${node.id} already registered`);
    }

    this.nodes.set(node.id, node);
    this.states.set(node.id, {
      id: node.id,
      status: "disconnected",
    });

    await this.pool.addNode(node);
  }

  /**
   * Unregister a node
   */
  async unregister(nodeId: string): Promise<void> {
    await this.pool.removeNode(nodeId);
    this.nodes.delete(nodeId);
    this.states.delete(nodeId);
  }

  /**
   * Register multiple nodes
   */
  async registerAll(nodes: NodeConfig[]): Promise<void> {
    for (const node of nodes) {
      if (node.enabled !== false) {
        await this.register(node);
      }
    }
  }

  /**
   * Connect to a node
   */
  async connect(nodeId: string): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    this.updateState(nodeId, { status: "connecting" });

    try {
      await this.pool.connect(nodeId);
      
      // Get gateway info
      const transport = this.pool.get(nodeId);
      const info = transport?.getGatewayInfo();
      
      this.updateState(nodeId, {
        status: "connected",
        lastSeen: Date.now(),
        gatewayVersion: info?.version,
        agentIds: info?.agentIds,
        error: undefined,
      });
    } catch (err) {
      this.updateState(nodeId, {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Disconnect from a node
   */
  async disconnect(nodeId: string): Promise<void> {
    await this.pool.disconnect(nodeId);
    this.updateState(nodeId, { status: "disconnected" });
  }

  /**
   * Connect to all nodes
   */
  async connectAll(): Promise<Map<string, Error | null>> {
    const results = new Map<string, Error | null>();
    
    for (const nodeId of this.nodes.keys()) {
      try {
        await this.connect(nodeId);
        results.set(nodeId, null);
      } catch (err) {
        results.set(nodeId, err instanceof Error ? err : new Error(String(err)));
      }
    }

    return results;
  }

  /**
   * Disconnect from all nodes
   */
  async disconnectAll(): Promise<void> {
    await this.pool.disconnectAll();
  }

  /**
   * Get transport for a node
   */
  getTransport(nodeId: string): Transport | undefined {
    return this.pool.get(nodeId);
  }

  /**
   * Get node configuration
   */
  getNode(nodeId: string): NodeConfig | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get node state
   */
  getState(nodeId: string): NodeState | undefined {
    return this.states.get(nodeId);
  }

  /**
   * Get all node states
   */
  getAllStates(): NodeState[] {
    return Array.from(this.states.values());
  }

  /**
   * Get all node IDs
   */
  getNodeIds(): string[] {
    return Array.from(this.nodes.keys());
  }

  /**
   * Check if node is connected
   */
  isConnected(nodeId: string): boolean {
    return this.pool.isConnected(nodeId);
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(handler: NodeStateChangeHandler): void {
    this.stateChangeHandlers.add(handler);
  }

  /**
   * Unsubscribe from state changes
   */
  offStateChange(handler: NodeStateChangeHandler): void {
    this.stateChangeHandlers.delete(handler);
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(
      () => this.runHealthChecks(),
      this.options.healthCheckIntervalMs
    );
  }

  /**
   * Stop periodic health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Run health checks on all nodes
   */
  async runHealthChecks(): Promise<void> {
    for (const nodeId of this.nodes.keys()) {
      if (!this.isConnected(nodeId)) continue;

      try {
        await this.pingNode(nodeId);
      } catch (err) {
        console.error(`Health check failed for node ${nodeId}:`, err);
      }
    }
  }

  /**
   * Ping a node
   */
  private async pingNode(nodeId: string): Promise<number> {
    const transport = this.pool.get(nodeId);
    if (!transport) {
      throw new Error(`Node ${nodeId} not found`);
    }

    const start = Date.now();
    
    // Use gateway health endpoint
    const response = await transport.call("health");
    
    if (response.error) {
      throw new Error(response.error.message);
    }

    const latency = Date.now() - start;
    
    this.updateState(nodeId, {
      lastSeen: Date.now(),
    });

    return latency;
  }

  /**
   * Update node state
   */
  private updateState(nodeId: string, partial: Partial<NodeState>): void {
    const current = this.states.get(nodeId);
    if (!current) return;

    const updated: NodeState = { ...current, ...partial };
    this.states.set(nodeId, updated);

    // Notify handlers
    for (const handler of this.stateChangeHandlers) {
      try {
        handler(nodeId, updated);
      } catch (err) {
        console.error("State change handler error:", err);
      }
    }
  }

  /**
   * Handle pool transport events
   */
  private handlePoolEvent(event: TransportEvent): void {
    const data = event.data as { nodeId?: string } | undefined;
    const nodeId = data?.nodeId;
    if (!nodeId) return;

    switch (event.type) {
      case "connected":
        this.updateState(nodeId, {
          status: "connected",
          lastSeen: Date.now(),
          error: undefined,
        });
        break;

      case "disconnected":
        this.updateState(nodeId, {
          status: "disconnected",
        });
        break;

      case "error":
        this.updateState(nodeId, {
          status: "error",
          error: event.error?.message,
        });
        break;
    }
  }

  /**
   * Cleanup resources
   */
  async close(): Promise<void> {
    this.stopHealthChecks();
    await this.disconnectAll();
    this.nodes.clear();
    this.states.clear();
    this.stateChangeHandlers.clear();
  }
}
