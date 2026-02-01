/**
 * Daemon management commands
 */

import { Command } from "commander";
import * as clack from "@clack/prompts";
import { loadConfig } from "../../config/index.js";
import { startDaemon, stopDaemon, isDaemonRunning, getDaemonPid } from "../../daemon/lifecycle.js";

export const daemonCommand = new Command("daemon")
  .description("Manage the Clawverse daemon");

// Start daemon
daemonCommand
  .command("start")
  .description("Start the Clawverse daemon")
  .option("-f, --foreground", "Run in foreground (don't daemonize)")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (options) => {
    const config = loadConfig();

    if (await isDaemonRunning(config.daemon.port)) {
      const pid = await getDaemonPid();
      clack.log.warn(`Daemon already running (PID: ${pid})`);
      return;
    }

    if (options.foreground) {
      clack.log.info(`Starting daemon in foreground on port ${config.daemon.port}...`);
      
      // Import and run server directly
      const { createDaemonServer } = await import("../../daemon/server.js");
      
      const server = await createDaemonServer({
        port: config.daemon.port,
        bind: config.daemon.bind,
        verbose: options.verbose,
      });

      // Handle shutdown
      const shutdown = async () => {
        clack.log.info("Shutting down...");
        await server.close();
        process.exit(0);
      };

      process.on("SIGINT", () => void shutdown());
      process.on("SIGTERM", () => void shutdown());

      clack.log.success(`Daemon running on port ${config.daemon.port}`);
      clack.log.info("Press Ctrl+C to stop");
    } else {
      const spinner = clack.spinner();
      spinner.start("Starting daemon...");

      try {
        const pid = await startDaemon(config);
        spinner.stop("Daemon started");
        clack.log.success(`Daemon running (PID: ${pid}) on port ${config.daemon.port}`);
      } catch (err) {
        spinner.stop("Failed to start daemon");
        clack.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    }
  });

// Stop daemon
daemonCommand
  .command("stop")
  .description("Stop the Clawverse daemon")
  .action(async () => {
    const config = loadConfig();

    if (!(await isDaemonRunning(config.daemon.port))) {
      clack.log.info("Daemon is not running");
      return;
    }

    const spinner = clack.spinner();
    spinner.start("Stopping daemon...");

    try {
      await stopDaemon();
      spinner.stop("Daemon stopped");
    } catch (err) {
      spinner.stop("Failed to stop daemon");
      clack.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Restart daemon
daemonCommand
  .command("restart")
  .description("Restart the Clawverse daemon")
  .action(async () => {
    const config = loadConfig();

    const spinner = clack.spinner();

    if (await isDaemonRunning(config.daemon.port)) {
      spinner.start("Stopping daemon...");
      await stopDaemon();
      spinner.message("Starting daemon...");
    } else {
      spinner.start("Starting daemon...");
    }

    try {
      const pid = await startDaemon(config);
      spinner.stop("Daemon restarted");
      clack.log.success(`Daemon running (PID: ${pid}) on port ${config.daemon.port}`);
    } catch (err) {
      spinner.stop("Failed to restart daemon");
      clack.log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

// Status
daemonCommand
  .command("status")
  .description("Check daemon status")
  .action(async () => {
    const config = loadConfig();

    if (await isDaemonRunning(config.daemon.port)) {
      const pid = await getDaemonPid();
      clack.log.success(`Daemon is running (PID: ${pid}) on port ${config.daemon.port}`);
    } else {
      clack.log.info("Daemon is not running");
    }
  });
