/**
 * Topology management commands
 */

import { Command } from "commander";
import * as clack from "@clack/prompts";
import { loadConfig, saveConfig, getNode } from "../../config/index.js";
import type { NodeRelation, RelationMode } from "../../config/types.js";

export const topologyCommand = new Command("topology")
  .description("Manage node topology and relationships");

// Set relation
topologyCommand
  .command("set <parent>")
  .description("Set node relationship")
  .option("--children <children>", "Comma-separated list of child node IDs")
  .option("--mode <mode>", "Relation mode: control, delegate, message, all")
  .action(async (parent, options) => {
    const config = loadConfig();

    // Validate parent exists
    if (!getNode(config, parent)) {
      clack.log.error(`Parent node "${parent}" not found`);
      process.exit(1);
    }

    let children: string[] = [];
    let mode: RelationMode;

    // Get children
    if (options.children) {
      children = options.children.split(",").map((c: string) => c.trim()).filter(Boolean);
    } else {
      // Interactive selection
      const availableNodes = config.nodes
        .filter((n) => n.id !== parent)
        .map((n) => ({ value: n.id, label: `${n.name} (${n.id})` }));

      if (availableNodes.length === 0) {
        clack.log.error("No other nodes available to set as children");
        process.exit(1);
      }

      const result = await clack.multiselect({
        message: `Select child nodes for "${parent}"`,
        options: availableNodes,
        required: true,
      });

      if (clack.isCancel(result)) {
        clack.cancel("Cancelled");
        process.exit(0);
      }

      children = result as string[];
    }

    // Validate children exist
    for (const child of children) {
      if (!getNode(config, child)) {
        clack.log.error(`Child node "${child}" not found`);
        process.exit(1);
      }
    }

    // Get mode
    if (options.mode) {
      const validModes: RelationMode[] = ["control", "delegate", "message", "all"];
      if (!validModes.includes(options.mode)) {
        clack.log.error(`Invalid mode "${options.mode}". Must be one of: ${validModes.join(", ")}`);
        process.exit(1);
      }
      mode = options.mode;
    } else {
      const result = await clack.select({
        message: "Select relation mode",
        options: [
          { value: "control", label: "Control", hint: "Parent can manage child (restart, config, status)" },
          { value: "delegate", label: "Delegate", hint: "Parent can send tasks to child" },
          { value: "message", label: "Message", hint: "Parent can only send messages to child" },
          { value: "all", label: "All", hint: "All of the above" },
        ],
      });

      if (clack.isCancel(result)) {
        clack.cancel("Cancelled");
        process.exit(0);
      }

      mode = result as RelationMode;
    }

    // Update topology
    const existingIndex = config.topology.relations.findIndex((r) => r.parent === parent);
    const relation: NodeRelation = { parent, children, mode };

    if (existingIndex >= 0) {
      config.topology.relations[existingIndex] = relation;
    } else {
      config.topology.relations.push(relation);
    }

    await saveConfig(config);
    clack.log.success(`Topology updated: ${parent} -> [${children.join(", ")}] (${mode})`);
  });

// Remove relation
topologyCommand
  .command("remove <parent>")
  .description("Remove a node's relationships")
  .action(async (parent) => {
    const config = loadConfig();

    const existingIndex = config.topology.relations.findIndex((r) => r.parent === parent);
    if (existingIndex < 0) {
      clack.log.error(`No relations found for parent "${parent}"`);
      process.exit(1);
    }

    config.topology.relations.splice(existingIndex, 1);
    await saveConfig(config);
    clack.log.success(`Relations for "${parent}" removed`);
  });

// Show topology
topologyCommand
  .command("show")
  .description("Show current topology")
  .option("--json", "Output as JSON")
  .action((options) => {
    const config = loadConfig();

    if (options.json) {
      console.log(JSON.stringify(config.topology, null, 2));
      return;
    }

    if (config.topology.relations.length === 0) {
      clack.log.info("No topology relations configured. All nodes are peers.");
      clack.log.info("Use 'clawverse topology set <parent> --children <child1,child2>' to create relationships.");
      return;
    }

    clack.intro("Node Topology");

    // Build and display tree
    const childToParent = new Map<string, string>();
    for (const rel of config.topology.relations) {
      for (const child of rel.children) {
        childToParent.set(child, rel.parent);
      }
    }

    // Find root nodes (no parent)
    const allNodes = new Set(config.nodes.map((n) => n.id));
    const roots = [...allNodes].filter((id) => !childToParent.has(id));

    // Display tree
    function displayNode(nodeId: string, indent: string, isLast: boolean) {
      const node = getNode(config, nodeId);
      const name = node?.name ?? nodeId;
      const prefix = indent + (isLast ? "└── " : "├── ");
      
      // Find relation for this node as parent
      const relation = config.topology.relations.find((r) => r.parent === nodeId);
      const modeStr = relation ? ` [${relation.mode}]` : "";
      
      console.log(`${prefix}${name} (${nodeId})${modeStr}`);

      // Get children
      const children = relation?.children ?? [];
      const newIndent = indent + (isLast ? "    " : "│   ");
      
      children.forEach((child, i) => {
        displayNode(child, newIndent, i === children.length - 1);
      });
    }

    roots.forEach((root, i) => {
      displayNode(root, "", i === roots.length - 1);
    });

    // Show orphan nodes (configured but not in any relation)
    const relatedNodes = new Set<string>();
    for (const rel of config.topology.relations) {
      relatedNodes.add(rel.parent);
      rel.children.forEach((c) => relatedNodes.add(c));
    }
    
    const orphans = [...allNodes].filter((id) => !relatedNodes.has(id));
    if (orphans.length > 0) {
      console.log("\nPeer nodes (no hierarchy):");
      for (const id of orphans) {
        const node = getNode(config, id);
        console.log(`  • ${node?.name ?? id} (${id})`);
      }
    }

    clack.outro("");
  });
