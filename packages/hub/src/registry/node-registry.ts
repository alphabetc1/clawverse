import { EventEmitter } from "node:events";
import { WebSocket } from "ws";
import type { NodeConnection, NodeState, ClawVerseConfig } from "../types/config.js";
import { createLogger } from "../logger.js";

const log = createLogger("registry");

export interface NodeRegistryEvents {
  "node:registered": (nodeId: string, state: NodeState) => void;
  "node:online": (nodeId: string) => void;
  "node:offline": (nodeId: string) => void;
  "node:degraded": (nodeId: string, error: string) => void;
  "node:heartbeat": (nodeId: string) => void;
}

export interface NodeRegistryOptions {
  heartbeatInterval?: number; // ms, default 30000
  heartbeatTimeout?: number; // ms, default 90000
  reconnectInterval?: number; // ms, default 5000
}

const DEFAULT_OPTIONS: Required<NodeRegistryOptions> = {
  heartbeatInterval: 30000,
  heartbeatTimeout: 90000,
  reconnectInterval: 5000,
};

export class NodeRegistry extends EventEmitter {
  private nodes: Map<string, NodeState> = new Map();
  private connections: Map<string, WebSocket> = new Map();
  private heartbeatTimers: Map<string, NodeJS.Timeout> = new Map();
  private reconnectTimers: Map<string, NodeJS.Timeout> = new Map();
  private options: Required<NodeRegistryOptions>;
  private running = false;

  constructor(options?: NodeRegistryOptions) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Initialize the registry with configured nodes
   */
  async initialize(config: ClawVerseConfig): Promise<void> {
    log.info("Initializing node registry...");
    this.running = true;

    for (const [nodeId, connection] of Object.entries(config.nodes)) {
      await this.registerNode(nodeId, connection);
    }

    log.info(`Initialized with ${this.nodes.size} nodes`);
  }

  /**
   * Register a new node
   */
  async registerNode(nodeId: string, connection: NodeConnection): Promise<NodeState> {
    if (this.nodes.has(nodeId)) {
      log.warn(`Node ${nodeId} already registered, updating...`);
      await this.unregisterNode(nodeId);
    }

    const state: NodeState = {
      id: nodeId,
      connection,
      status: "connecting",
      lastHeartbeat: Date.now(),
    };

    this.nodes.set(nodeId, state);
    log.info(`Registered node: ${nodeId} (${connection.url})`);

    // Attempt to connect
    await this.connectToNode(nodeId);

    this.emit("node:registered", nodeId, state);
    return state;
  }

  /**
   * Unregister a node
   */
  async unregisterNode(nodeId: string): Promise<void> {
    const state = this.nodes.get(nodeId);
    if (!state) return;

    // Clear timers
    const heartbeatTimer = this.heartbeatTimers.get(nodeId);
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      this.heartbeatTimers.delete(nodeId);
    }

    const reconnectTimer = this.reconnectTimers.get(nodeId);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      this.reconnectTimers.delete(nodeId);
    }

    // Close WebSocket connection
    const ws = this.connections.get(nodeId);
    if (ws) {
      ws.close();
      this.connections.delete(nodeId);
    }

    this.nodes.delete(nodeId);
    log.info(`Unregistered node: ${nodeId}`);
  }

  /**
   * Connect to a node's OpenClaw gateway
   */
  private async connectToNode(nodeId: string): Promise<void> {
    const state = this.nodes.get(nodeId);
    if (!state) return;

    const { connection } = state;

    try {
      // Build WebSocket URL with auth if needed
      let wsUrl = connection.url;
      const headers: Record<string, string> = {};

      if (connection.token) {
        headers["Authorization"] = `Bearer ${connection.token}`;
      }

      const ws = new WebSocket(wsUrl, { headers });

      ws.on("open", () => {
        log.info(`Connected to node: ${nodeId}`);
        this.updateNodeStatus(nodeId, "online");
        this.startHeartbeat(nodeId);
        this.emit("node:online", nodeId);
      });

      ws.on("message", (data) => {
        this.handleMessage(nodeId, data.toString());
      });

      ws.on("close", () => {
        log.warn(`Disconnected from node: ${nodeId}`);
        this.updateNodeStatus(nodeId, "offline");
        this.emit("node:offline", nodeId);
        this.scheduleReconnect(nodeId);
      });

      ws.on("error", (error) => {
        log.error(`WebSocket error for node ${nodeId}:`, error.message);
        this.updateNodeStatus(nodeId, "degraded", error.message);
        this.emit("node:degraded", nodeId, error.message);
      });

      this.connections.set(nodeId, ws);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to connect to node ${nodeId}:`, errMsg);
      this.updateNodeStatus(nodeId, "offline", errMsg);
      this.scheduleReconnect(nodeId);
    }
  }

  /**
   * Handle incoming WebSocket message from a node
   */
  private handleMessage(nodeId: string, message: string): void {
    try {
      const data = JSON.parse(message);

      if (data.method === "heartbeat" || data.result?.type === "pong") {
        this.recordHeartbeat(nodeId);
      }

      // Handle other message types as needed
    } catch {
      // Non-JSON message, ignore
    }
  }

  /**
   * Start heartbeat monitoring for a node
   */
  private startHeartbeat(nodeId: string): void {
    // Clear existing timer
    const existing = this.heartbeatTimers.get(nodeId);
    if (existing) {
      clearInterval(existing);
    }

    const timer = setInterval(() => {
      this.sendHeartbeat(nodeId);
      this.checkHeartbeatTimeout(nodeId);
    }, this.options.heartbeatInterval);

    this.heartbeatTimers.set(nodeId, timer);

    // Send initial heartbeat
    this.sendHeartbeat(nodeId);
  }

  /**
   * Send heartbeat ping to a node
   */
  private sendHeartbeat(nodeId: string): void {
    const ws = this.connections.get(nodeId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const message = JSON.stringify({
      jsonrpc: "2.0",
      id: `heartbeat-${Date.now()}`,
      method: "health",
      params: {},
    });

    ws.send(message);
  }

  /**
   * Record heartbeat response from a node
   */
  private recordHeartbeat(nodeId: string): void {
    const state = this.nodes.get(nodeId);
    if (!state) return;

    state.lastHeartbeat = Date.now();
    if (state.status === "degraded") {
      this.updateNodeStatus(nodeId, "online");
    }

    this.emit("node:heartbeat", nodeId);
  }

  /**
   * Check if a node has timed out
   */
  private checkHeartbeatTimeout(nodeId: string): void {
    const state = this.nodes.get(nodeId);
    if (!state) return;

    const elapsed = Date.now() - state.lastHeartbeat;
    if (elapsed > this.options.heartbeatTimeout && state.status === "online") {
      log.warn(`Node ${nodeId} heartbeat timeout (${elapsed}ms)`);
      this.updateNodeStatus(nodeId, "degraded", "Heartbeat timeout");
      this.emit("node:degraded", nodeId, "Heartbeat timeout");
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(nodeId: string): void {
    if (!this.running) return;

    // Clear existing timer
    const existing = this.reconnectTimers.get(nodeId);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      log.info(`Attempting to reconnect to node: ${nodeId}`);
      this.connectToNode(nodeId);
    }, this.options.reconnectInterval);

    this.reconnectTimers.set(nodeId, timer);
  }

  /**
   * Update a node's status
   */
  private updateNodeStatus(
    nodeId: string,
    status: NodeState["status"],
    error?: string
  ): void {
    const state = this.nodes.get(nodeId);
    if (!state) return;

    state.status = status;
    if (error) {
      state.lastError = error;
    } else if (status === "online") {
      delete state.lastError;
    }
  }

  /**
   * Get a node's current state
   */
  getNode(nodeId: string): NodeState | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get all nodes
   */
  getAllNodes(): Map<string, NodeState> {
    return new Map(this.nodes);
  }

  /**
   * Get nodes by status
   */
  getNodesByStatus(status: NodeState["status"]): NodeState[] {
    return Array.from(this.nodes.values()).filter((n) => n.status === status);
  }

  /**
   * Get online node IDs
   */
  getOnlineNodeIds(): string[] {
    return this.getNodesByStatus("online").map((n) => n.id);
  }

  /**
   * Get WebSocket connection for a node
   */
  getConnection(nodeId: string): WebSocket | undefined {
    return this.connections.get(nodeId);
  }

  /**
   * Send a message to a specific node
   */
  async sendToNode(nodeId: string, message: unknown): Promise<void> {
    const ws = this.connections.get(nodeId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Node ${nodeId} is not connected`);
    }

    const payload = typeof message === "string" ? message : JSON.stringify(message);
    ws.send(payload);
  }

  /**
   * Call an RPC method on a node and wait for response
   */
  async callNode(
    nodeId: string,
    method: string,
    params?: Record<string, unknown>,
    timeout = 30000
  ): Promise<unknown> {
    const ws = this.connections.get(nodeId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Node ${nodeId} is not connected`);
    }

    const id = `${method}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        ws.off("message", handler);
        reject(new Error(`RPC call to ${nodeId} timed out`));
      }, timeout);

      const handler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === id) {
            clearTimeout(timeoutId);
            ws.off("message", handler);

            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              resolve(response.result);
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.on("message", handler);

      const request = {
        jsonrpc: "2.0",
        id,
        method,
        params: params || {},
      };

      ws.send(JSON.stringify(request));
    });
  }

  /**
   * Stop the registry and close all connections
   */
  async stop(): Promise<void> {
    log.info("Stopping node registry...");
    this.running = false;

    // Clear all timers
    for (const timer of this.heartbeatTimers.values()) {
      clearInterval(timer);
    }
    this.heartbeatTimers.clear();

    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    // Close all WebSocket connections
    for (const [nodeId, ws] of this.connections) {
      log.info(`Closing connection to node: ${nodeId}`);
      ws.close();
    }
    this.connections.clear();

    log.info("Node registry stopped");
  }
}

// Singleton instance
let registryInstance: NodeRegistry | null = null;

export function getRegistry(options?: NodeRegistryOptions): NodeRegistry {
  if (!registryInstance) {
    registryInstance = new NodeRegistry(options);
  }
  return registryInstance;
}
