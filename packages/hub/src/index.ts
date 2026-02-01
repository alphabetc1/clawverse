#!/usr/bin/env node
/**
 * ClawVerse Hub - Central control plane for multiple OpenClaw instances
 */

import { createServer } from "./server/index.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";

const log = createLogger("hub");

async function main() {
  log.info("Starting ClawVerse Hub...");

  // Load configuration
  const config = await loadConfig();
  log.info(`Loaded configuration with ${Object.keys(config.nodes).length} nodes`);

  // Create and start the server
  const server = await createServer(config);

  // Handle shutdown gracefully
  const shutdown = async () => {
    log.info("Shutting down ClawVerse Hub...");
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start the server
  await server.start();
  log.info(`ClawVerse Hub running on ${config.server.host}:${config.server.port}`);
}

main().catch((err) => {
  log.error("Failed to start ClawVerse Hub:", err);
  process.exit(1);
});

export * from "./types/index.js";
export { loadConfig } from "./config.js";
export { createServer } from "./server/index.js";
