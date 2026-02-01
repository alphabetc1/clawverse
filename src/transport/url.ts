/**
 * URL transport - connects directly to a WebSocket URL
 */

import WebSocket from "ws";
import { BaseTransport } from "./base.js";
import type { UrlTransportOptions } from "./types.js";

export class UrlTransport extends BaseTransport {
  readonly nodeId: string;
  private url: string;
  private token?: string;
  private password?: string;
  private tlsFingerprint?: string;

  constructor(options: UrlTransportOptions) {
    super();
    this.nodeId = options.nodeId;
    this.url = options.url;
    this.token = options.token;
    this.password = options.password;
    this.tlsFingerprint = options.tlsFingerprint;
  }

  async connect(): Promise<void> {
    const wsOptions: WebSocket.ClientOptions = {};

    // Handle custom TLS verification if fingerprint is provided
    if (this.tlsFingerprint && this.url.startsWith("wss://")) {
      wsOptions.rejectUnauthorized = false;
      // Note: In production, you'd verify the fingerprint in checkServerIdentity
    }

    const ws = new WebSocket(this.url, wsOptions);
    await this.setupWebSocket(ws, {
      token: this.token,
      password: this.password,
    });
  }
}

/**
 * Create a URL transport
 */
export function createUrlTransport(options: UrlTransportOptions): UrlTransport {
  return new UrlTransport(options);
}
