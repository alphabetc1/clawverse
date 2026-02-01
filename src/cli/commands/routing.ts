/**
 * Routing management commands
 */

import { Command } from "commander";
import * as clack from "@clack/prompts";
import { loadConfig, saveConfig, getNode } from "../../config/index.js";
import type { RoutingRule, RoutingStrategy, RouteMatch } from "../../config/types.js";
import { createDaemonClient } from "../../daemon/client.js";
import { AVAILABLE_STRATEGIES } from "../../routing/strategies.js";

export const routingCommand = new Command("routing")
  .description("Manage routing configuration");

// Show routing configuration
routingCommand
  .command("show")
  .description("Show current routing configuration")
  .option("--json", "Output as JSON")
  .action((options) => {
    const config = loadConfig();

    if (options.json) {
      console.log(JSON.stringify(config.routing, null, 2));
      return;
    }

    const routing = config.routing;
    if (!routing) {
      clack.log.info("No routing configuration defined");
      return;
    }

    clack.intro("Routing Configuration");

    // Show default routing
    if (routing.default) {
      const def = routing.default;
      console.log("\nDefault routing:");
      console.log(`  Strategy: ${def.strategy}`);
      console.log(`  Targets: ${def.targets.join(", ") || "(none)"}`);
      if (def.fallback) {
        console.log(`  Fallback: ${def.fallback}`);
      }
    } else {
      console.log("\nNo default routing configured");
    }

    // Show rules
    if (routing.rules && routing.rules.length > 0) {
      console.log("\nRouting rules:");
      for (let i = 0; i < routing.rules.length; i++) {
        const rule = routing.rules[i];
        const name = rule.name || `Rule ${i}`;
        const priority = rule.priority ?? 0;
        
        console.log(`\n  ${name} (priority: ${priority})`);
        
        // Match conditions
        const conditions: string[] = [];
        if (rule.match.channel) conditions.push(`channel=${rule.match.channel}`);
        if (rule.match.capability) conditions.push(`capability=${rule.match.capability}`);
        if (rule.match.sessionPattern) conditions.push(`session=${rule.match.sessionPattern}`);
        if (rule.match.sourceNode) conditions.push(`from=${rule.match.sourceNode}`);
        console.log(`    Match: ${conditions.join(", ") || "any"}`);

        // Target
        if (rule.target) {
          console.log(`    Target: ${rule.target}`);
        } else if (rule.targets) {
          console.log(`    Targets: ${rule.targets.join(", ")}`);
          console.log(`    Strategy: ${rule.strategy ?? "round-robin"}`);
        }
      }
    } else {
      console.log("\nNo routing rules configured");
    }

    clack.outro("");
  });

// Set default routing
routingCommand
  .command("set-default")
  .description("Set default routing configuration")
  .option("--strategy <strategy>", "Routing strategy")
  .option("--targets <targets>", "Comma-separated target node IDs")
  .option("--fallback <node>", "Fallback node ID")
  .action(async (options) => {
    const config = loadConfig();

    let strategy: RoutingStrategy = options.strategy;
    let targets: string[] = options.targets?.split(",").map((s: string) => s.trim()).filter(Boolean) ?? [];
    let fallback: string | undefined = options.fallback;

    // Interactive prompts if not provided
    if (!strategy) {
      const result = await clack.select({
        message: "Select default routing strategy",
        options: AVAILABLE_STRATEGIES.map((s) => ({
          value: s,
          label: s,
          hint: getStrategyHint(s),
        })),
      });
      if (clack.isCancel(result)) {
        clack.cancel("Cancelled");
        process.exit(0);
      }
      strategy = result as RoutingStrategy;
    }

    if (targets.length === 0) {
      const nodeOptions = config.nodes
        .filter((n) => n.enabled !== false)
        .map((n) => ({ value: n.id, label: `${n.name} (${n.id})` }));

      if (nodeOptions.length === 0) {
        clack.log.error("No enabled nodes available");
        process.exit(1);
      }

      const result = await clack.multiselect({
        message: "Select target nodes",
        options: nodeOptions,
        required: true,
      });
      if (clack.isCancel(result)) {
        clack.cancel("Cancelled");
        process.exit(0);
      }
      targets = result as string[];
    }

    // Validate targets
    for (const target of targets) {
      if (!getNode(config, target)) {
        clack.log.error(`Target "${target}" is not a configured node`);
        process.exit(1);
      }
    }

    if (fallback && !getNode(config, fallback)) {
      clack.log.error(`Fallback "${fallback}" is not a configured node`);
      process.exit(1);
    }

    // Update config
    config.routing = config.routing ?? { rules: [] };
    config.routing.default = {
      strategy,
      targets,
      fallback,
    };

    await saveConfig(config);
    clack.log.success(`Default routing set: ${strategy} -> [${targets.join(", ")}]`);
  });

// Add routing rule
routingCommand
  .command("add-rule")
  .description("Add a routing rule")
  .option("--name <name>", "Rule name")
  .option("--match-channel <channel>", "Match channel (imessage, slack, etc.)")
  .option("--match-capability <capability>", "Match node capability")
  .option("--match-session <pattern>", "Match session key pattern")
  .option("--match-source <node>", "Match source node ID")
  .option("--target <node>", "Target node ID")
  .option("--targets <nodes>", "Comma-separated target node IDs")
  .option("--strategy <strategy>", "Strategy for multiple targets")
  .option("--priority <n>", "Rule priority (higher = checked first)", parseInt)
  .action(async (options) => {
    const config = loadConfig();

    // Build match conditions
    const match: RouteMatch = {};
    if (options.matchChannel) match.channel = options.matchChannel;
    if (options.matchCapability) match.capability = options.matchCapability;
    if (options.matchSession) match.sessionPattern = options.matchSession;
    if (options.matchSource) match.sourceNode = options.matchSource;

    // Interactive prompts if no match conditions provided
    if (Object.keys(match).length === 0) {
      const channel = await clack.text({
        message: "Match channel (leave empty to skip)",
        placeholder: "imessage",
      });
      if (clack.isCancel(channel)) {
        clack.cancel("Cancelled");
        process.exit(0);
      }
      if (channel) match.channel = channel;

      const capability = await clack.text({
        message: "Match capability (leave empty to skip)",
        placeholder: "coding",
      });
      if (clack.isCancel(capability)) {
        clack.cancel("Cancelled");
        process.exit(0);
      }
      if (capability) match.capability = capability;
    }

    if (Object.keys(match).length === 0) {
      clack.log.error("At least one match condition is required");
      process.exit(1);
    }

    // Get target(s)
    let target: string | undefined = options.target;
    let targets: string[] | undefined = options.targets?.split(",").map((s: string) => s.trim()).filter(Boolean);
    let strategy: RoutingStrategy | undefined = options.strategy;

    if (!target && (!targets || targets.length === 0)) {
      const nodeOptions = config.nodes
        .filter((n) => n.enabled !== false)
        .map((n) => ({ value: n.id, label: `${n.name} (${n.id})` }));

      const result = await clack.multiselect({
        message: "Select target node(s)",
        options: nodeOptions,
        required: true,
      });
      if (clack.isCancel(result)) {
        clack.cancel("Cancelled");
        process.exit(0);
      }
      
      const selected = result as string[];
      if (selected.length === 1) {
        target = selected[0];
      } else {
        targets = selected;
      }
    }

    // Get strategy if multiple targets
    if (targets && targets.length > 1 && !strategy) {
      const result = await clack.select({
        message: "Select routing strategy for multiple targets",
        options: AVAILABLE_STRATEGIES.map((s) => ({
          value: s,
          label: s,
          hint: getStrategyHint(s),
        })),
      });
      if (clack.isCancel(result)) {
        clack.cancel("Cancelled");
        process.exit(0);
      }
      strategy = result as RoutingStrategy;
    }

    // Build rule
    const rule: RoutingRule = {
      name: options.name,
      match,
      target,
      targets,
      strategy,
      priority: options.priority,
    };

    // Add to config
    config.routing = config.routing ?? { rules: [] };
    config.routing.rules = config.routing.rules ?? [];
    config.routing.rules.push(rule);

    await saveConfig(config);
    clack.log.success(`Routing rule added: ${rule.name ?? "unnamed"}`);
  });

// Remove routing rule
routingCommand
  .command("remove-rule <index>")
  .description("Remove a routing rule by index")
  .action(async (index) => {
    const config = loadConfig();
    const idx = parseInt(index, 10);

    if (!config.routing?.rules || idx < 0 || idx >= config.routing.rules.length) {
      clack.log.error(`Invalid rule index: ${index}`);
      process.exit(1);
    }

    const rule = config.routing.rules[idx];
    config.routing.rules.splice(idx, 1);

    await saveConfig(config);
    clack.log.success(`Removed rule: ${rule.name ?? `Rule ${idx}`}`);
  });

// Test routing
routingCommand
  .command("test")
  .description("Test routing decision (dry run)")
  .option("--channel <channel>", "Test channel")
  .option("--session <key>", "Test session key")
  .option("--source <node>", "Test source node")
  .option("--live", "Query running daemon for live test")
  .action(async (options) => {
    const config = loadConfig();

    const context = {
      channel: options.channel,
      sessionKey: options.session,
      sourceNode: options.source,
    };

    if (options.live) {
      // Query daemon
      const spinner = clack.spinner();
      spinner.start("Testing route with daemon...");

      try {
        const client = await createDaemonClient(config.daemon.port);
        const result = await client.call("routing.test", context);
        spinner.stop("Test complete");

        const testResult = result as {
          decision: { target: string; matchedRule?: string; strategy: string } | null;
          matchedRules: string[];
          defaultUsed: boolean;
        };

        if (testResult.decision) {
          console.log(`\nDecision: Route to "${testResult.decision.target}"`);
          console.log(`Strategy: ${testResult.decision.strategy}`);
          if (testResult.decision.matchedRule) {
            console.log(`Matched rule: ${testResult.decision.matchedRule}`);
          } else if (testResult.defaultUsed) {
            console.log("Used: default routing");
          }
        } else {
          console.log("\nDecision: No route found");
        }

        if (testResult.matchedRules.length > 0) {
          console.log(`\nAll matching rules: ${testResult.matchedRules.join(", ")}`);
        }

        client.close();
      } catch (err) {
        spinner.stop("Test failed");
        clack.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    } else {
      // Local test using Router
      const { Router } = await import("../../routing/router.js");
      const router = new Router({
        nodes: config.nodes,
        routing: config.routing ?? { default: { strategy: "round-robin", targets: [] } },
      });

      const result = router.testRoute(context);

      if (result.decision) {
        console.log(`\nDecision: Route to "${result.decision.target}"`);
        console.log(`Strategy: ${result.decision.strategy}`);
        if (result.decision.matchedRule) {
          console.log(`Matched rule: ${result.decision.matchedRule}`);
        } else if (result.defaultUsed) {
          console.log("Used: default routing");
        }
      } else {
        console.log("\nDecision: No route found");
      }

      if (result.matchedRules.length > 0) {
        console.log(`\nAll matching rules: ${result.matchedRules.join(", ")}`);
      }
    }
  });

// Helper to get strategy description
function getStrategyHint(strategy: RoutingStrategy): string {
  switch (strategy) {
    case "round-robin":
      return "Rotate through targets in order";
    case "weighted":
      return "Select based on node weights";
    case "random":
      return "Random selection";
    case "least-connections":
      return "Select node with fewest active connections";
    case "first-available":
      return "Use first healthy target";
    default:
      return "";
  }
}
