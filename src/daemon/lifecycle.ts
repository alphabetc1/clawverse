/**
 * Daemon lifecycle management
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import type { ClawverseConfig } from "../config/types.js";
import { CLAWVERSE_HOME } from "../config/loader.js";

const PID_FILE = "daemon.pid";

/**
 * Get the PID file path
 */
function getPidPath(): string {
  return path.join(CLAWVERSE_HOME, PID_FILE);
}

/**
 * Check if a port is in use
 */
async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Check if daemon is running
 */
export async function isDaemonRunning(port: number): Promise<boolean> {
  // First check PID file
  const pid = await getDaemonPid();
  if (!pid) return false;
  
  // Check if process is alive
  try {
    process.kill(pid, 0);
  } catch {
    // Process not running, clean up stale PID file
    await fs.promises.unlink(getPidPath()).catch(() => {});
    return false;
  }
  
  // Check if port is in use
  return isPortInUse(port);
}

/**
 * Get daemon PID from file
 */
export async function getDaemonPid(): Promise<number | null> {
  try {
    const content = await fs.promises.readFile(getPidPath(), "utf-8");
    const pid = parseInt(content.trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/**
 * Start the daemon as a background process
 */
export async function startDaemon(config: ClawverseConfig): Promise<number> {
  // Ensure CLAWVERSE_HOME exists
  await fs.promises.mkdir(CLAWVERSE_HOME, { recursive: true });
  
  // Check if already running
  if (await isDaemonRunning(config.daemon.port)) {
    const pid = await getDaemonPid();
    throw new Error(`Daemon already running (PID: ${pid})`);
  }
  
  // Find the entry point - use the same script that's running
  const entryPoint = process.argv[1];
  const nodeExe = process.execPath;
  
  // Create log file paths
  const outLog = path.join(CLAWVERSE_HOME, "daemon.out.log");
  const errLog = path.join(CLAWVERSE_HOME, "daemon.err.log");
  
  // Open log files
  const out = fs.openSync(outLog, "a");
  const err = fs.openSync(errLog, "a");
  
  // Spawn detached process
  const child = spawn(
    nodeExe,
    [entryPoint, "daemon", "start", "--foreground"],
    {
      detached: true,
      stdio: ["ignore", out, err],
      env: {
        ...process.env,
        CLAWVERSE_DAEMON: "1",
      },
    }
  );
  
  // Write PID file
  await fs.promises.writeFile(getPidPath(), String(child.pid), { mode: 0o600 });
  
  // Detach child
  child.unref();
  
  // Wait a bit and check if it started successfully
  await new Promise((resolve) => setTimeout(resolve, 1000));
  
  if (!(await isDaemonRunning(config.daemon.port))) {
    // Read error log
    const errContent = await fs.promises.readFile(errLog, "utf-8").catch(() => "");
    throw new Error(`Daemon failed to start: ${errContent.slice(-500)}`);
  }
  
  return child.pid!;
}

/**
 * Stop the daemon
 */
export async function stopDaemon(): Promise<void> {
  const pid = await getDaemonPid();
  if (!pid) {
    return;
  }
  
  // Send SIGTERM
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    // Process might already be dead
    await fs.promises.unlink(getPidPath()).catch(() => {});
    return;
  }
  
  // Wait for process to exit
  for (let i = 0; i < 50; i++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      process.kill(pid, 0);
    } catch {
      // Process has exited
      await fs.promises.unlink(getPidPath()).catch(() => {});
      return;
    }
  }
  
  // Force kill if still running
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Ignore
  }
  
  await fs.promises.unlink(getPidPath()).catch(() => {});
}

/**
 * Restart the daemon
 */
export async function restartDaemon(config: ClawverseConfig): Promise<number> {
  await stopDaemon();
  return startDaemon(config);
}
