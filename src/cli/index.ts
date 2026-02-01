#!/usr/bin/env node
/**
 * Clawverse CLI entry point
 */

import { Command } from "commander";
import { nodeCommand } from "./commands/node.js";
import { topologyCommand } from "./commands/topology.js";
import { sendCommand } from "./commands/send.js";
import { statusCommand } from "./commands/status.js";
import { daemonCommand } from "./commands/daemon.js";
import { contextCommand } from "./commands/context.js";
import { routingCommand } from "./commands/routing.js";

const program = new Command();

program
  .name("clawverse")
  .description("Multi-OpenClaw instance manager for distributed AI assistant coordination")
  .version("0.1.0");

// Register commands
program.addCommand(nodeCommand);
program.addCommand(topologyCommand);
program.addCommand(routingCommand);
program.addCommand(sendCommand);
program.addCommand(statusCommand);
program.addCommand(daemonCommand);
program.addCommand(contextCommand);

// Parse and execute
program.parseAsync().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
