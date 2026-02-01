/**
 * Send message command
 */

import { Command } from "commander";
import * as clack from "@clack/prompts";
import { loadConfig, getNode } from "../../config/index.js";
import { createDaemonClient } from "../../daemon/client.js";
import type { ClawverseMessage, DelegatePayload } from "../../protocol/messages.js";
import { nanoid } from "nanoid";

export const sendCommand = new Command("send")
  .description("Send a message or task to another node")
  .option("--from <node>", "Source node ID")
  .option("--to <node>", "Target node ID")
  .option("--message <text>", "Message text")
  .option("--delegate", "Send as delegated task (wait for response)")
  .option("--timeout <seconds>", "Timeout for delegated tasks", parseInt)
  .option("--session <key>", "Target session key (default: main)")
  .action(async (options) => {
    const config = loadConfig();

    let from = options.from;
    let to = options.to;
    let message = options.message;

    // Interactive prompts if options not provided
    if (!from || !to) {
      const nodeOptions = config.nodes
        .filter((n) => n.enabled !== false)
        .map((n) => ({ value: n.id, label: `${n.name} (${n.id})` }));

      if (nodeOptions.length < 2) {
        clack.log.error("Need at least 2 enabled nodes to send messages between them");
        process.exit(1);
      }

      if (!from) {
        const result = await clack.select({
          message: "Select source node",
          options: nodeOptions,
        });
        if (clack.isCancel(result)) {
          clack.cancel("Cancelled");
          process.exit(0);
        }
        from = result as string;
      }

      if (!to) {
        const result = await clack.select({
          message: "Select target node",
          options: nodeOptions.filter((n) => n.value !== from),
        });
        if (clack.isCancel(result)) {
          clack.cancel("Cancelled");
          process.exit(0);
        }
        to = result as string;
      }
    }

    // Validate nodes exist
    if (!getNode(config, from)) {
      clack.log.error(`Source node "${from}" not found`);
      process.exit(1);
    }
    if (!getNode(config, to)) {
      clack.log.error(`Target node "${to}" not found`);
      process.exit(1);
    }

    if (!message) {
      const result = await clack.text({
        message: "Enter message",
        placeholder: "Hello from another node!",
      });
      if (clack.isCancel(result)) {
        clack.cancel("Cancelled");
        process.exit(0);
      }
      message = result as string;
    }

    const spinner = clack.spinner();
    spinner.start("Connecting to daemon...");

    try {
      const client = await createDaemonClient(config.daemon.port);
      spinner.message("Sending message...");

      const isDelegate = options.delegate;
      const timeout = options.timeout ?? 60;

      const msg: ClawverseMessage = {
        id: nanoid(),
        source: from,
        target: to,
        type: isDelegate ? "delegate" : "message",
        payload: isDelegate
          ? ({
              task: message,
              timeout: timeout * 1000,
              replyTo: from,
            } as DelegatePayload)
          : { text: message, sessionKey: options.session },
        timestamp: Date.now(),
      };

      const result = await client.sendMessage(msg, isDelegate ? timeout * 1000 : undefined);

      spinner.stop("Message sent");

      if (result.success) {
        if (result.response) {
          clack.log.success("Response received:");
          console.log(result.response);
        } else {
          clack.log.success("Message delivered successfully");
        }
      } else {
        clack.log.error(`Failed to send message: ${result.error}`);
      }

      client.close();
    } catch (err) {
      spinner.stop("Failed");
      clack.log.error(err instanceof Error ? err.message : String(err));
      clack.log.info("Make sure the daemon is running: clawverse daemon start");
      process.exit(1);
    }
  });
