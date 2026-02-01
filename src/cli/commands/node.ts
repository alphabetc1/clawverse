/**
 * Node management commands
 */

import { Command } from "commander";
import * as clack from "@clack/prompts";
import { loadConfig, addNode, removeNode, saveConfig, getNode } from "../../config/index.js";
import type { NodeConfig, NodeConnection } from "../../config/types.js";

export const nodeCommand = new Command("node")
  .description("Manage OpenClaw nodes");

// Add node
nodeCommand
  .command("add")
  .description("Add a new OpenClaw node")
  .option("--id <id>", "Node ID")
  .option("--name <name>", "Node display name")
  .option("--type <type>", "Connection type: local, ssh, url")
  .option("--host <host>", "SSH host")
  .option("--user <user>", "SSH user")
  .option("--port <port>", "Port number", parseInt)
  .option("--url <url>", "WebSocket URL")
  .option("--token <token>", "Authentication token")
  .action(async (options) => {
    clack.intro("Add OpenClaw node");

    let id = options.id;
    let name = options.name;
    let type = options.type;
    let connection: NodeConnection;

    // Interactive prompts if options not provided
    if (!id) {
      const result = await clack.text({
        message: "Node ID (unique identifier)",
        placeholder: "work-mac",
        validate: (v) => {
          if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(v)) {
            return "Must start with a letter and contain only letters, numbers, underscores, hyphens";
          }
          return undefined;
        },
      });
      if (clack.isCancel(result)) {
        clack.cancel("Cancelled");
        process.exit(0);
      }
      id = result;
    }

    if (!name) {
      const result = await clack.text({
        message: "Node name (display name)",
        placeholder: "Work MacBook",
        initialValue: id,
      });
      if (clack.isCancel(result)) {
        clack.cancel("Cancelled");
        process.exit(0);
      }
      name = result;
    }

    if (!type) {
      const result = await clack.select({
        message: "Connection type",
        options: [
          { value: "local", label: "Local", hint: "Same machine, different port" },
          { value: "ssh", label: "SSH", hint: "Connect via SSH tunnel" },
          { value: "url", label: "URL", hint: "Direct WebSocket URL" },
        ],
      });
      if (clack.isCancel(result)) {
        clack.cancel("Cancelled");
        process.exit(0);
      }
      type = result as string;
    }

    // Get connection details based on type
    switch (type) {
      case "local": {
        const port = options.port ?? await clack.text({
          message: "Gateway port",
          placeholder: "18789",
          initialValue: "18789",
          validate: (v) => {
            const n = parseInt(v);
            if (isNaN(n) || n < 1 || n > 65535) return "Invalid port";
            return undefined;
          },
        });
        if (clack.isCancel(port)) {
          clack.cancel("Cancelled");
          process.exit(0);
        }
        connection = { 
          type: "local", 
          port: typeof port === "string" ? parseInt(port) : port 
        };
        break;
      }

      case "ssh": {
        const host = options.host ?? await clack.text({
          message: "SSH host",
          placeholder: "192.168.1.100",
        });
        if (clack.isCancel(host)) {
          clack.cancel("Cancelled");
          process.exit(0);
        }

        const user = options.user ?? await clack.text({
          message: "SSH user (optional)",
          placeholder: process.env.USER ?? "user",
          initialValue: process.env.USER,
        });
        if (clack.isCancel(user)) {
          clack.cancel("Cancelled");
          process.exit(0);
        }

        const port = options.port ?? 18789;
        connection = { 
          type: "ssh", 
          host: host as string,
          user: user as string || undefined,
          port,
        };
        break;
      }

      case "url": {
        const url = options.url ?? await clack.text({
          message: "WebSocket URL",
          placeholder: "wss://gateway.example.com:18789",
          validate: (v) => {
            try {
              const parsed = new URL(v);
              if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
                return "URL must use ws:// or wss://";
              }
            } catch {
              return "Invalid URL";
            }
            return undefined;
          },
        });
        if (clack.isCancel(url)) {
          clack.cancel("Cancelled");
          process.exit(0);
        }

        const token = options.token ?? await clack.password({
          message: "Authentication token (optional)",
        });
        if (clack.isCancel(token)) {
          clack.cancel("Cancelled");
          process.exit(0);
        }

        connection = { 
          type: "url", 
          url: url as string,
          token: token as string || undefined,
        };
        break;
      }

      default:
        clack.log.error(`Unknown connection type: ${type}`);
        process.exit(1);
    }

    const nodeConfig: NodeConfig = {
      id,
      name,
      connection,
      enabled: true,
    };

    const spinner = clack.spinner();
    spinner.start("Adding node...");

    try {
      await addNode(nodeConfig);
      spinner.stop("Node added successfully");
      clack.outro(`Node "${id}" added`);
    } catch (err) {
      spinner.stop("Failed to add node");
      clack.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Remove node
nodeCommand
  .command("remove <id>")
  .description("Remove an OpenClaw node")
  .option("-f, --force", "Skip confirmation")
  .action(async (id, options) => {
    const config = loadConfig();
    const node = getNode(config, id);

    if (!node) {
      clack.log.error(`Node "${id}" not found`);
      process.exit(1);
    }

    if (!options.force) {
      const confirm = await clack.confirm({
        message: `Remove node "${node.name}" (${id})?`,
      });
      if (clack.isCancel(confirm) || !confirm) {
        clack.cancel("Cancelled");
        process.exit(0);
      }
    }

    try {
      await removeNode(id);
      clack.log.success(`Node "${id}" removed`);
    } catch (err) {
      clack.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// List nodes
nodeCommand
  .command("list")
  .description("List all configured nodes")
  .option("--json", "Output as JSON")
  .action((options) => {
    const config = loadConfig();

    if (options.json) {
      console.log(JSON.stringify(config.nodes, null, 2));
      return;
    }

    if (config.nodes.length === 0) {
      clack.log.info("No nodes configured. Use 'clawverse node add' to add one.");
      return;
    }

    clack.intro("Configured nodes");
    
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

      const status = node.enabled !== false ? "enabled" : "disabled";
      clack.log.info(`${node.id}: ${node.name} (${connInfo}) [${status}]`);
    }

    clack.outro(`${config.nodes.length} node(s)`);
  });

// Enable/disable node
nodeCommand
  .command("enable <id>")
  .description("Enable a node")
  .action(async (id) => {
    const config = loadConfig();
    const node = getNode(config, id);

    if (!node) {
      clack.log.error(`Node "${id}" not found`);
      process.exit(1);
    }

    node.enabled = true;
    await saveConfig(config);
    clack.log.success(`Node "${id}" enabled`);
  });

nodeCommand
  .command("disable <id>")
  .description("Disable a node")
  .action(async (id) => {
    const config = loadConfig();
    const node = getNode(config, id);

    if (!node) {
      clack.log.error(`Node "${id}" not found`);
      process.exit(1);
    }

    node.enabled = false;
    await saveConfig(config);
    clack.log.success(`Node "${id}" disabled`);
  });
