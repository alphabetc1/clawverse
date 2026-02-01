/**
 * SSH transport - connects to gateway via SSH tunnel
 */

import { spawn, type ChildProcess } from "node:child_process";
import WebSocket from "ws";
import { BaseTransport } from "./base.js";
import type { SshTransportOptions } from "./types.js";

const DEFAULT_GATEWAY_PORT = 18789;

export class SshTransport extends BaseTransport {
  readonly nodeId: string;
  private host: string;
  private port: number;
  private user?: string;
  private keyPath?: string;
  private gatewayPort: number;
  private sshProcess: ChildProcess | null = null;
  private localPort: number;

  constructor(options: SshTransportOptions) {
    super();
    this.nodeId = options.nodeId;
    this.host = options.host;
    this.port = options.port ?? 22;
    this.user = options.user;
    this.keyPath = options.keyPath;
    this.gatewayPort = options.gatewayPort ?? DEFAULT_GATEWAY_PORT;
    // Use a dynamic local port to avoid conflicts
    this.localPort = 18800 + Math.floor(Math.random() * 100);
  }

  async connect(): Promise<void> {
    // Start SSH tunnel
    await this.startTunnel();

    // Connect via the tunnel
    const url = `ws://127.0.0.1:${this.localPort}`;
    const ws = new WebSocket(url);
    await this.setupWebSocket(ws);
  }

  async disconnect(): Promise<void> {
    await super.disconnect();
    this.stopTunnel();
  }

  private async startTunnel(): Promise<void> {
    return new Promise((resolve, reject) => {
      const args: string[] = [
        "-N",  // No remote command
        "-L", `${this.localPort}:127.0.0.1:${this.gatewayPort}`,  // Port forward
        "-o", "StrictHostKeyChecking=accept-new",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=10",
      ];

      if (this.keyPath) {
        args.push("-i", this.keyPath);
      }

      if (this.port !== 22) {
        args.push("-p", String(this.port));
      }

      const target = this.user ? `${this.user}@${this.host}` : this.host;
      args.push(target);

      this.sshProcess = spawn("ssh", args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stderr = "";
      
      this.sshProcess.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      this.sshProcess.on("error", (err) => {
        reject(new Error(`SSH tunnel failed to start: ${err.message}`));
      });

      this.sshProcess.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`SSH tunnel exited with code ${code}: ${stderr}`));
        }
      });

      // Wait a bit for the tunnel to establish
      setTimeout(() => {
        if (this.sshProcess && !this.sshProcess.killed) {
          resolve();
        }
      }, 1000);
    });
  }

  private stopTunnel(): void {
    if (this.sshProcess && !this.sshProcess.killed) {
      this.sshProcess.kill();
      this.sshProcess = null;
    }
  }
}

/**
 * Create an SSH transport
 */
export function createSshTransport(options: SshTransportOptions): SshTransport {
  return new SshTransport(options);
}
