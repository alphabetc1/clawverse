/**
 * Local transport - connects to gateway on localhost
 */

import WebSocket from "ws";
import { BaseTransport } from "./base.js";
import type { LocalTransportOptions } from "./types.js";

const DEFAULT_GATEWAY_PORT = 18789;

export class LocalTransport extends BaseTransport {
  readonly nodeId: string;
  private port: number;

  constructor(options: LocalTransportOptions) {
    super();
    this.nodeId = options.nodeId;
    this.port = options.port ?? DEFAULT_GATEWAY_PORT;
  }

  async connect(): Promise<void> {
    const url = `ws://127.0.0.1:${this.port}`;
    const ws = new WebSocket(url);
    await this.setupWebSocket(ws);
  }
}

/**
 * Create a local transport
 */
export function createLocalTransport(options: LocalTransportOptions): LocalTransport {
  return new LocalTransport(options);
}
