/**
 * Base transport class with common WebSocket handling
 */

import WebSocket from "ws";
import type { ClawverseMessage } from "../protocol/messages.js";
import type {
  Transport,
  TransportStatus,
  TransportEvent,
  TransportEventHandler,
  GatewayRpcResponse,
  GatewayInfo,
} from "./types.js";

// Gateway RPC request structure
interface RpcRequest {
  id: string;
  method: string;
  params?: unknown;
}

// Pending RPC call
interface PendingCall {
  resolve: (response: GatewayRpcResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export abstract class BaseTransport implements Transport {
  abstract readonly nodeId: string;
  
  protected ws: WebSocket | null = null;
  protected handlers: Set<TransportEventHandler> = new Set();
  protected pendingCalls: Map<string, PendingCall> = new Map();
  protected gatewayInfo: GatewayInfo | null = null;
  protected rpcIdCounter = 0;
  
  private _status: TransportStatus = "disconnected";

  get status(): TransportStatus {
    return this._status;
  }

  protected setStatus(status: TransportStatus): void {
    this._status = status;
  }

  abstract connect(): Promise<void>;

  async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus("disconnected");
    this.emit({ type: "disconnected" });
  }

  async send(message: ClawverseMessage): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Transport not connected");
    }

    // Send as a gateway agent message
    await this.call("agent", {
      message: this.formatMessageForGateway(message),
      sessionKey: this.extractSessionKey(message),
    });
  }

  async call<T = unknown>(method: string, params?: unknown): Promise<GatewayRpcResponse<T>> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Transport not connected");
    }

    const id = `clawverse-${++this.rpcIdCounter}`;
    const request: RpcRequest = { id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingCalls.delete(id);
        reject(new Error(`RPC call ${method} timed out`));
      }, 30000);

      this.pendingCalls.set(id, {
        resolve: resolve as (r: GatewayRpcResponse) => void,
        reject,
        timeout,
      });

      this.ws!.send(JSON.stringify(request));
    });
  }

  on(handler: TransportEventHandler): void {
    this.handlers.add(handler);
  }

  off(handler: TransportEventHandler): void {
    this.handlers.delete(handler);
  }

  getGatewayInfo(): GatewayInfo | null {
    return this.gatewayInfo;
  }

  protected emit(event: TransportEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (err) {
        console.error("Transport event handler error:", err);
      }
    }
  }

  protected setupWebSocket(ws: WebSocket, authParams?: { token?: string; password?: string }): Promise<void> {
    this.ws = ws;
    this.setStatus("connecting");

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
        ws.close();
      }, 10000);

      ws.on("open", async () => {
        try {
          // Wait for connect challenge
          const challengeHandler = (data: WebSocket.Data) => {
            const msg = JSON.parse(data.toString());
            if (msg.method === "connect.challenge") {
              ws.off("message", challengeHandler);
              this.handleConnectChallenge(ws, msg.params, authParams)
                .then(() => {
                  clearTimeout(timeout);
                  this.setStatus("connected");
                  this.emit({ type: "connected" });
                  resolve();
                })
                .catch(reject);
            }
          };
          ws.on("message", challengeHandler);
        } catch (err) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      ws.on("message", (data) => {
        this.handleMessage(data);
      });

      ws.on("error", (err) => {
        clearTimeout(timeout);
        this.setStatus("error");
        this.emit({ type: "error", error: err });
        reject(err);
      });

      ws.on("close", () => {
        this.setStatus("disconnected");
        this.emit({ type: "disconnected" });
        // Reject pending calls
        for (const [id, pending] of this.pendingCalls) {
          clearTimeout(pending.timeout);
          pending.reject(new Error("Connection closed"));
          this.pendingCalls.delete(id);
        }
      });
    });
  }

  private async handleConnectChallenge(
    ws: WebSocket,
    _params: { nonce?: string },
    authParams?: { token?: string; password?: string }
  ): Promise<void> {
    const connectRequest = {
      id: `clawverse-connect-${++this.rpcIdCounter}`,
      method: "connect",
      params: {
        client: {
          id: `clawverse:${this.nodeId}`,
          version: "0.1.0",
        },
        auth: authParams?.token 
          ? { token: authParams.token }
          : authParams?.password
            ? { password: authParams.password }
            : undefined,
      },
    };

    return new Promise((resolve, reject) => {
      const responseHandler = (data: WebSocket.Data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id === connectRequest.id) {
          ws.off("message", responseHandler);
          if (msg.error) {
            reject(new Error(`Connect failed: ${msg.error.message}`));
          } else {
            this.gatewayInfo = {
              version: msg.result?.gateway?.version,
              agentIds: msg.result?.agents?.map((a: { id: string }) => a.id),
            };
            // Setup main message handler
            ws.on("message", (data) => this.handleMessage(data));
            resolve();
          }
        }
      };
      ws.on("message", responseHandler);
      ws.send(JSON.stringify(connectRequest));
    });
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const msg = JSON.parse(data.toString());
      
      // Check if it's a response to a pending call
      if (msg.id && this.pendingCalls.has(msg.id)) {
        const pending = this.pendingCalls.get(msg.id)!;
        clearTimeout(pending.timeout);
        this.pendingCalls.delete(msg.id);
        pending.resolve(msg);
        return;
      }

      // Otherwise emit as incoming message
      this.emit({ type: "message", data: msg });
    } catch (err) {
      console.error("Failed to parse message:", err);
    }
  }

  private formatMessageForGateway(message: ClawverseMessage): string {
    // Format as text message for the gateway agent
    if (message.type === "message") {
      const payload = message.payload as { text?: string };
      return payload.text ?? JSON.stringify(message.payload);
    }
    if (message.type === "delegate") {
      const payload = message.payload as { task?: string };
      return payload.task ?? JSON.stringify(message.payload);
    }
    return JSON.stringify(message);
  }

  private extractSessionKey(message: ClawverseMessage): string {
    const payload = message.payload as { sessionKey?: string };
    return payload?.sessionKey ?? "main";
  }
}
