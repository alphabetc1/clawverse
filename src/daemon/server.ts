/**
 * Clawverse daemon WebSocket server with HTTP API
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import { createServer as createHttpServer } from "node:http";
import express, { type Request, type Response, type NextFunction } from "express";
import { nanoid } from "nanoid";
import type { ClawverseConfig, NodeState, RouteContext, RoutingConfig } from "../config/types.js";
import { loadConfig } from "../config/loader.js";
import type { ClawverseMessage, ContextQueryPayload, ContextResponse } from "../protocol/messages.js";
import { isValidMessage } from "../protocol/messages.js";
import { NodeRegistry } from "./node-registry.js";
import { HealthMonitor } from "./health-monitor.js";
import { TopologyManager } from "../topology/manager.js";
import { ContextBroker } from "../context/broker.js";
import { Router } from "../routing/router.js";

export interface DaemonServerOptions {
  port: number;
  httpPort?: number;
  bind: "loopback" | "lan";
  verbose?: boolean;
  apiToken?: string;
}

interface ClientConnection {
  id: string;
  ws: WebSocket;
  connectedAt: number;
}

// RPC request structure
interface RpcRequest {
  id: string;
  method: string;
  params?: unknown;
}

// RPC response structure
interface RpcResponse {
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

// Agent request body for /api/agent
interface AgentRequestBody {
  message: string;
  sessionKey?: string;
  wait?: boolean;
  timeoutMs?: number;
}

/**
 * Clawverse daemon server
 */
export class DaemonServer {
  private wss: WebSocketServer | null = null;
  private httpServer: HttpServer | null = null;
  private clients: Map<string, ClientConnection> = new Map();
  private registry: NodeRegistry;
  private healthMonitor: HealthMonitor;
  private topology: TopologyManager;
  private contextBroker: ContextBroker;
  private router: Router;
  private config: ClawverseConfig;
  private options: DaemonServerOptions;
  private verbose: boolean;

  constructor(options: DaemonServerOptions) {
    this.options = options;
    this.verbose = options.verbose ?? false;
    this.config = loadConfig();

    this.registry = new NodeRegistry({
      healthCheckIntervalMs: this.config.daemon.healthCheckIntervalMs,
      connectionTimeoutMs: this.config.daemon.connectionTimeoutMs,
    });

    this.healthMonitor = new HealthMonitor(this.registry);
    this.topology = new TopologyManager(this.config);
    this.contextBroker = new ContextBroker(this.registry, this.topology);
    this.router = new Router({
      nodes: this.config.nodes,
      routing: this.config.routing ?? { default: { strategy: "round-robin", targets: [] } },
    });

    // Sync router health with registry
    this.registry.onStateChange((nodeId, state) => {
      this.router.setNodeHealth(nodeId, state.status === "connected");
    });
  }

  /**
   * Start the daemon server (WebSocket + HTTP API)
   */
  async start(): Promise<void> {
    const host = this.options.bind === "loopback" ? "127.0.0.1" : "0.0.0.0";
    
    // Start WebSocket server
    this.wss = new WebSocketServer({
      port: this.options.port,
      host,
    });

    this.wss.on("connection", (ws, req) => this.handleConnection(ws, req));
    this.wss.on("error", (err) => {
      console.error("WebSocket server error:", err);
    });

    // Start HTTP API server
    const httpPort = this.options.httpPort ?? this.config.daemon.httpPort ?? 18801;
    await this.startHttpServer(host, httpPort);

    // Register and connect to all nodes
    await this.registry.registerAll(this.config.nodes);
    
    this.log(`Connecting to ${this.config.nodes.length} nodes...`);
    const results = await this.registry.connectAll();
    
    for (const [nodeId, error] of results) {
      if (error) {
        this.log(`Failed to connect to ${nodeId}: ${error.message}`);
      } else {
        this.log(`Connected to ${nodeId}`);
      }
    }

    // Start health checks
    this.registry.startHealthChecks();

    this.log(`Daemon server listening on ${host}:${this.options.port} (WebSocket)`);
    this.log(`HTTP API listening on ${host}:${httpPort}`);
  }

  /**
   * Start the HTTP API server
   */
  private async startHttpServer(host: string, port: number): Promise<void> {
    const app = express();
    app.use(express.json());

    // Optional API token authentication middleware
    const authMiddleware = (req: Request, res: Response, next: NextFunction): void => {
      const apiToken = this.options.apiToken ?? this.config.daemon.apiToken;
      if (apiToken) {
        const authHeader = req.headers.authorization;
        const providedToken = authHeader?.startsWith("Bearer ") 
          ? authHeader.slice(7) 
          : req.headers["x-api-token"];
        
        if (providedToken !== apiToken) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
      }
      next();
    };

    // Health check endpoint
    app.get("/api/health", (_req: Request, res: Response) => {
      res.json({ status: "ok", timestamp: Date.now() });
    });

    // Hub status endpoint
    app.get("/api/status", authMiddleware, (_req: Request, res: Response) => {
      const status = this.getStatus();
      res.json(status);
    });

    // List nodes endpoint
    app.get("/api/nodes", authMiddleware, (_req: Request, res: Response) => {
      const nodes = this.registry.getAllStates();
      res.json({ nodes });
    });

    // Get node details
    app.get("/api/nodes/:nodeId", authMiddleware, (req: Request, res: Response) => {
      const { nodeId } = req.params;
      const state = this.registry.getState(nodeId);
      if (!state) {
        res.status(404).json({ error: `Node ${nodeId} not found` });
        return;
      }
      res.json(state);
    });

    // Main agent endpoint - receives messages from channel bridges
    app.post("/api/agent", authMiddleware, async (req: Request, res: Response) => {
      try {
        const body = req.body as AgentRequestBody;
        const channel = req.headers["x-channel"] as string | undefined;
        const sessionKey = body.sessionKey ?? "main";
        const wait = body.wait ?? true;
        const timeoutMs = body.timeoutMs ?? 60000;

        if (!body.message) {
          res.status(400).json({ error: "Missing 'message' in request body" });
          return;
        }

        // Build route context from request
        const routeContext: RouteContext = {
          channel,
          sessionKey,
        };

        // Route to appropriate node
        const decision = this.router.route(routeContext);
        if (!decision) {
          res.status(503).json({ 
            error: "No available nodes to handle request",
            routeContext,
          });
          return;
        }

        const targetNodeId = decision.target;
        this.log(`Routing agent request via ${decision.strategy} to: ${targetNodeId}`);

        const transport = this.registry.getTransport(targetNodeId);
        if (!transport) {
          res.status(503).json({ 
            error: `Node ${targetNodeId} not connected`,
            target: targetNodeId,
          });
          return;
        }

        // Track connection for least-connections strategy
        this.router.incrementConnections(targetNodeId);

        try {
          // Call OpenClaw agent endpoint
          const response = await transport.call("agent", {
            message: body.message,
            sessionKey,
            wait,
            timeoutMs,
          });

          this.router.decrementConnections(targetNodeId);

          res.json({
            success: !response.error,
            result: response.result,
            error: response.error?.message,
            routedTo: targetNodeId,
            strategy: decision.strategy,
            matchedRule: decision.matchedRule,
          });
        } catch (err) {
          this.router.decrementConnections(targetNodeId);
          throw err;
        }
      } catch (err) {
        console.error("Agent request failed:", err);
        res.status(500).json({ 
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    // Routing test endpoint
    app.post("/api/routing/test", authMiddleware, (req: Request, res: Response) => {
      const context = req.body as RouteContext;
      const result = this.router.testRoute(context);
      res.json(result);
    });

    // Topology endpoint
    app.get("/api/topology", authMiddleware, (_req: Request, res: Response) => {
      res.json(this.topology.toTree());
    });

    // Routing configuration endpoint
    app.get("/api/routing", authMiddleware, (_req: Request, res: Response) => {
      res.json(this.router.getConfig());
    });

    // Reload configuration endpoint
    app.post("/api/reload", authMiddleware, async (_req: Request, res: Response) => {
      try {
        const result = await this.handleReload();
        res.json(result);
      } catch (err) {
        res.status(500).json({ 
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    return new Promise((resolve) => {
      this.httpServer = createHttpServer(app);
      this.httpServer.listen(port, host, () => {
        resolve();
      });
    });
  }

  /**
   * Stop the daemon server
   */
  async close(): Promise<void> {
    this.registry.stopHealthChecks();
    await this.registry.close();
    
    if (this.wss) {
      for (const client of this.clients.values()) {
        client.ws.close();
      }
      this.wss.close();
      this.wss = null;
    }
    
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer?.close(() => resolve());
      });
      this.httpServer = null;
    }
    
    this.clients.clear();
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    const clientId = nanoid();
    const client: ClientConnection = {
      id: clientId,
      ws,
      connectedAt: Date.now(),
    };
    
    this.clients.set(clientId, client);
    this.log(`Client connected: ${clientId}`);

    ws.on("message", (data) => {
      this.handleMessage(client, data.toString());
    });

    ws.on("close", () => {
      this.clients.delete(clientId);
      this.log(`Client disconnected: ${clientId}`);
    });

    ws.on("error", (err) => {
      console.error(`Client ${clientId} error:`, err);
    });
  }

  /**
   * Handle incoming message from client
   */
  private async handleMessage(client: ClientConnection, data: string): Promise<void> {
    try {
      const msg = JSON.parse(data);
      
      // Check if it's an RPC request
      if (msg.id && msg.method) {
        await this.handleRpcRequest(client, msg as RpcRequest);
        return;
      }
      
      // Check if it's a Clawverse message
      if (isValidMessage(msg)) {
        await this.handleClawverseMessage(client, msg);
        return;
      }

      this.sendError(client, "unknown", "Invalid message format");
    } catch (err) {
      console.error("Failed to handle message:", err);
      this.sendError(client, "unknown", "Failed to process message");
    }
  }

  /**
   * Handle RPC request from client
   */
  private async handleRpcRequest(client: ClientConnection, request: RpcRequest): Promise<void> {
    const { id, method, params } = request;

    try {
      let result: unknown;

      switch (method) {
        case "status":
          result = this.getStatus();
          break;

        case "send":
          result = await this.handleSend(params as { message: ClawverseMessage; timeout?: number });
          break;

        case "context.query":
          result = await this.handleContextQuery(params as ContextQueryPayload & { nodeId: string });
          break;

        case "health":
          result = this.healthMonitor.getSummary();
          break;

        case "topology":
          result = this.topology.toTree();
          break;

        case "routing":
          result = this.handleGetRouting();
          break;

        case "routing.test":
          result = this.handleRouteTest(params as RouteContext);
          break;

        case "routing.decide":
          result = this.handleRouteDecide(params as RouteContext);
          break;

        case "reload":
          result = await this.handleReload();
          break;

        default:
          this.sendResponse(client, id, undefined, { code: -32601, message: `Unknown method: ${method}` });
          return;
      }

      this.sendResponse(client, id, result);
    } catch (err) {
      this.sendResponse(client, id, undefined, {
        code: -32000,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Handle Clawverse message routing
   */
  private async handleClawverseMessage(_client: ClientConnection, message: ClawverseMessage): Promise<void> {
    // Check topology permissions
    const action = message.type === "control" ? "control" 
      : message.type === "delegate" ? "delegate" 
      : "message";
    
    const permission = this.topology.checkPermission(message.source, message.target, action);
    
    if (!permission.allowed) {
      this.log(`Permission denied: ${message.source} -> ${message.target} (${action}): ${permission.reason}`);
      // Send error back to client
      return;
    }

    // Route message to target node
    const transport = this.registry.getTransport(message.target);
    if (!transport) {
      this.log(`Target node not found: ${message.target}`);
      return;
    }

    try {
      await transport.send(message);
      this.log(`Routed message: ${message.source} -> ${message.target} (${message.type})`);
    } catch (err) {
      console.error(`Failed to route message to ${message.target}:`, err);
    }
  }

  /**
   * Handle send request with optional routing
   */
  private async handleSend(params: {
    message: ClawverseMessage;
    timeout?: number;
    routeContext?: RouteContext;
  }): Promise<{ success: boolean; response?: unknown; error?: string; routedTo?: string }> {
    const { message, timeout, routeContext } = params;

    if (!isValidMessage(message)) {
      return { success: false, error: "Invalid message format" };
    }

    // Determine target - use explicit target or route based on context
    let targetNodeId = message.target;

    if (!targetNodeId && routeContext) {
      const decision = this.router.route(routeContext);
      if (decision) {
        targetNodeId = decision.target;
        this.log(`Routed by ${decision.strategy}: ${targetNodeId}`);
      }
    }

    if (!targetNodeId) {
      return { success: false, error: "No target specified and no routing match" };
    }

    const transport = this.registry.getTransport(targetNodeId);
    if (!transport) {
      return { success: false, error: `Node ${targetNodeId} not connected` };
    }

    try {
      // Track connection for least-connections strategy
      this.router.incrementConnections(targetNodeId);

      // For delegate messages with timeout, wait for response
      if (message.type === "delegate" && timeout) {
        const response = await transport.call("agent", {
          message: (message.payload as { task?: string }).task,
          sessionKey: (message.payload as { sessionKey?: string }).sessionKey ?? "main",
          wait: true,
          timeoutMs: timeout,
        });

        this.router.decrementConnections(targetNodeId);

        return {
          success: !response.error,
          response: response.result,
          error: response.error?.message,
          routedTo: targetNodeId !== message.target ? targetNodeId : undefined,
        };
      }

      await transport.send(message);
      this.router.decrementConnections(targetNodeId);

      return {
        success: true,
        routedTo: targetNodeId !== message.target ? targetNodeId : undefined,
      };
    } catch (err) {
      this.router.decrementConnections(targetNodeId);
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Handle context query
   */
  private async handleContextQuery(params: ContextQueryPayload & { nodeId: string }): Promise<ContextResponse> {
    return this.contextBroker.query(params.nodeId, params);
  }

  /**
   * Handle config reload
   */
  private async handleReload(): Promise<{ success: boolean }> {
    this.config = loadConfig();
    this.topology.update(this.config);
    this.router.updateConfig(this.config.routing ?? { default: { strategy: "round-robin", targets: [] } });
    this.router.updateNodes(this.config.nodes);

    // Update node connections
    const currentNodes = new Set(this.registry.getNodeIds());
    const configNodes = new Set(this.config.nodes.map((n) => n.id));

    // Remove nodes that are no longer in config
    for (const nodeId of currentNodes) {
      if (!configNodes.has(nodeId)) {
        await this.registry.unregister(nodeId);
      }
    }

    // Add new nodes from config
    for (const node of this.config.nodes) {
      if (!currentNodes.has(node.id) && node.enabled !== false) {
        await this.registry.register(node);
        await this.registry.connect(node.id).catch(() => {});
      }
    }

    return { success: true };
  }

  /**
   * Get routing configuration
   */
  private handleGetRouting(): RoutingConfig {
    return this.router.getConfig();
  }

  /**
   * Test route decision (dry run)
   */
  private handleRouteTest(context: RouteContext): {
    decision: { target: string; matchedRule?: string; strategy: string } | null;
    matchedRules: string[];
    defaultUsed: boolean;
  } {
    return this.router.testRoute(context);
  }

  /**
   * Make a route decision
   */
  private handleRouteDecide(context: RouteContext): {
    target: string | null;
    strategy?: string;
    matchedRule?: string;
  } {
    const decision = this.router.route(context);
    if (!decision) {
      return { target: null };
    }
    return {
      target: decision.target,
      strategy: decision.strategy,
      matchedRule: decision.matchedRule,
    };
  }

  /**
   * Get status of all nodes
   */
  private getStatus(): { nodes: NodeState[] } {
    return { nodes: this.registry.getAllStates() };
  }

  /**
   * Send RPC response to client
   */
  private sendResponse(
    client: ClientConnection,
    id: string,
    result?: unknown,
    error?: { code: number; message: string }
  ): void {
    const response: RpcResponse = { id };
    if (error) {
      response.error = error;
    } else {
      response.result = result;
    }
    client.ws.send(JSON.stringify(response));
  }

  /**
   * Send error response
   */
  private sendError(client: ClientConnection, id: string, message: string): void {
    this.sendResponse(client, id, undefined, { code: -32000, message });
  }

  /**
   * Log message if verbose
   */
  private log(message: string): void {
    if (this.verbose) {
      console.log(`[clawverse] ${message}`);
    }
  }
}

/**
 * Create and start a daemon server
 */
export async function createDaemonServer(options: DaemonServerOptions): Promise<DaemonServer> {
  const server = new DaemonServer(options);
  await server.start();
  return server;
}
