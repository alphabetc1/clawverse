/**
 * Context query command
 */

import { Command } from "commander";
import * as clack from "@clack/prompts";
import { loadConfig, getNode } from "../../config/index.js";
import { createDaemonClient } from "../../daemon/client.js";

export const contextCommand = new Command("context")
  .description("Query context from remote nodes");

// Query session history
contextCommand
  .command("history")
  .description("Get session history from a node")
  .option("--node <id>", "Node ID to query")
  .option("--session <key>", "Session key (default: main)")
  .option("--limit <n>", "Number of messages to fetch", parseInt)
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = loadConfig();

    let nodeId = options.node;

    if (!nodeId) {
      const nodeOptions = config.nodes
        .filter((n) => n.enabled !== false)
        .map((n) => ({ value: n.id, label: `${n.name} (${n.id})` }));

      if (nodeOptions.length === 0) {
        clack.log.error("No enabled nodes available");
        process.exit(1);
      }

      const result = await clack.select({
        message: "Select node to query",
        options: nodeOptions,
      });
      if (clack.isCancel(result)) {
        clack.cancel("Cancelled");
        process.exit(0);
      }
      nodeId = result as string;
    }

    if (!getNode(config, nodeId)) {
      clack.log.error(`Node "${nodeId}" not found`);
      process.exit(1);
    }

    const sessionKey = options.session ?? "main";
    const limit = options.limit ?? 10;

    const spinner = clack.spinner();
    spinner.start("Querying session history...");

    try {
      const client = await createDaemonClient(config.daemon.port);
      
      const history = await client.queryContext({
        nodeId,
        queryType: "session_history",
        sessionKey,
        limit,
      });

      spinner.stop("History retrieved");

      if (options.json) {
        console.log(JSON.stringify(history, null, 2));
      } else {
        const historyResponse = history as { messages?: Array<{ role: string; content: string }> };
        if (!historyResponse.messages || historyResponse.messages.length === 0) {
          clack.log.info("No messages in session history");
        } else {
          clack.intro(`Session history: ${nodeId}/${sessionKey}`);
          
          for (const msg of historyResponse.messages) {
            const role = msg.role === "user" ? "User" : "Assistant";
            const content = msg.content?.slice(0, 200) + (msg.content?.length > 200 ? "..." : "");
            console.log(`\n[${role}] ${content}`);
          }
          
          clack.outro(`${historyResponse.messages.length} message(s)`);
        }
      }

      client.close();
    } catch (err) {
      spinner.stop("Failed to query history");
      clack.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// List sessions
contextCommand
  .command("sessions")
  .description("List sessions on a node")
  .option("--node <id>", "Node ID to query")
  .option("--json", "Output as JSON")
  .action(async (options) => {
    const config = loadConfig();

    let nodeId = options.node;

    if (!nodeId) {
      const nodeOptions = config.nodes
        .filter((n) => n.enabled !== false)
        .map((n) => ({ value: n.id, label: `${n.name} (${n.id})` }));

      if (nodeOptions.length === 0) {
        clack.log.error("No enabled nodes available");
        process.exit(1);
      }

      const result = await clack.select({
        message: "Select node to query",
        options: nodeOptions,
      });
      if (clack.isCancel(result)) {
        clack.cancel("Cancelled");
        process.exit(0);
      }
      nodeId = result as string;
    }

    if (!getNode(config, nodeId)) {
      clack.log.error(`Node "${nodeId}" not found`);
      process.exit(1);
    }

    const spinner = clack.spinner();
    spinner.start("Listing sessions...");

    try {
      const client = await createDaemonClient(config.daemon.port);
      
      const sessions = await client.queryContext({
        nodeId,
        queryType: "session_list",
      });

      spinner.stop("Sessions retrieved");

      if (options.json) {
        console.log(JSON.stringify(sessions, null, 2));
      } else {
        const sessionsResponse = sessions as { sessions?: Array<{ sessionKey: string; label?: string; updatedAt?: number }> };
        if (!sessionsResponse.sessions || sessionsResponse.sessions.length === 0) {
          clack.log.info("No active sessions");
        } else {
          clack.intro(`Sessions on ${nodeId}`);
          
          for (const session of sessionsResponse.sessions) {
            const label = session.label ? ` (${session.label})` : "";
            const updated = session.updatedAt 
              ? new Date(session.updatedAt).toLocaleString() 
              : "unknown";
            console.log(`  • ${session.sessionKey}${label} - last updated: ${updated}`);
          }
          
          clack.outro(`${sessionsResponse.sessions.length} session(s)`);
        }
      }

      client.close();
    } catch (err) {
      spinner.stop("Failed to list sessions");
      clack.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });
