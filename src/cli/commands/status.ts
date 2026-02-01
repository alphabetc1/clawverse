/**
 * Status command
 */

import { Command } from "commander";
import * as clack from "@clack/prompts";
import { loadConfig, getNode } from "../../config/index.js";
import { createDaemonClient } from "../../daemon/client.js";

export const statusCommand = new Command("status")
  .description("Show status of all nodes")
  .option("--json", "Output as JSON")
  .option("--probe", "Probe each node for live status")
  .action(async (options) => {
    const config = loadConfig();

    if (config.nodes.length === 0) {
      clack.log.info("No nodes configured. Use 'clawverse node add' to add one.");
      return;
    }

    if (options.probe) {
      const spinner = clack.spinner();
      spinner.start("Connecting to daemon...");

      try {
        const client = await createDaemonClient(config.daemon.port);
        const status = await client.getStatus();
        spinner.stop("Status retrieved");

        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
          client.close();
          return;
        }

        clack.intro("Node Status (live)");

        for (const nodeState of status.nodes) {
          const node = getNode(config, nodeState.id);
          const name = node?.name ?? nodeState.id;
          
          let statusIcon: string;
          switch (nodeState.status) {
            case "connected":
              statusIcon = "✓";
              break;
            case "connecting":
              statusIcon = "○";
              break;
            case "disconnected":
              statusIcon = "✗";
              break;
            case "error":
              statusIcon = "!";
              break;
            default:
              statusIcon = "?";
          }

          const lastSeen = nodeState.lastSeen 
            ? new Date(nodeState.lastSeen).toLocaleString() 
            : "never";
          
          const errorInfo = nodeState.error ? ` - ${nodeState.error}` : "";
          const versionInfo = nodeState.gatewayVersion ? ` (v${nodeState.gatewayVersion})` : "";

          clack.log.info(`${statusIcon} ${name} (${nodeState.id}): ${nodeState.status}${versionInfo}${errorInfo}`);
          
          if (nodeState.agentIds && nodeState.agentIds.length > 0) {
            clack.log.info(`    Agents: ${nodeState.agentIds.join(", ")}`);
          }
          
          clack.log.info(`    Last seen: ${lastSeen}`);
        }

        clack.outro(`${status.nodes.length} node(s)`);
        client.close();
      } catch (err) {
        spinner.stop("Failed to connect to daemon");
        clack.log.error(
          "Daemon not running. Start it with 'clawverse daemon start' or use status without --probe for config-only view."
        );
        
        if (options.json) {
          console.log(JSON.stringify({ error: "daemon not running", nodes: [] }, null, 2));
        }
        process.exit(1);
      }
    } else {
      // Config-only view
      if (options.json) {
        console.log(JSON.stringify({
          nodes: config.nodes.map((n) => ({
            id: n.id,
            name: n.name,
            connection: n.connection,
            enabled: n.enabled !== false,
          })),
          topology: config.topology,
        }, null, 2));
        return;
      }

      clack.intro("Node Configuration");

      for (const node of config.nodes) {
        const conn = node.connection;
        let connInfo: string;
        
        switch (conn.type) {
          case "local":
            connInfo = `local:${conn.port ?? 18789}`;
            break;
          case "ssh":
            connInfo = `ssh://${conn.user ? conn.user + "@" : ""}${conn.host}:${conn.port ?? 18789}`;
            break;
          case "url":
            connInfo = conn.url;
            break;
        }

        const enabledIcon = node.enabled !== false ? "○" : "-";
        clack.log.info(`${enabledIcon} ${node.name} (${node.id})`);
        clack.log.info(`    Connection: ${connInfo}`);
      }

      // Show topology info
      if (config.topology.relations.length > 0) {
        console.log("\nTopology:");
        for (const rel of config.topology.relations) {
          console.log(`  ${rel.parent} -> [${rel.children.join(", ")}] (${rel.mode})`);
        }
      }

      clack.outro(`${config.nodes.length} node(s) configured. Use --probe for live status.`);
    }
  });
