/**
 * Configuration loader for Clawverse
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import JSON5 from "json5";
import type { ClawverseConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { validateConfig } from "./schema.js";

// Default config directory
export const CLAWVERSE_HOME = process.env.CLAWVERSE_HOME || path.join(os.homedir(), ".clawverse");
export const CONFIG_FILE = "config.json";

/**
 * Ensure the clawverse home directory exists
 */
export function ensureClawverseHome(): void {
  if (!fs.existsSync(CLAWVERSE_HOME)) {
    fs.mkdirSync(CLAWVERSE_HOME, { recursive: true, mode: 0o700 });
  }
}

/**
 * Get the full path to the config file
 */
export function getConfigPath(): string {
  return path.join(CLAWVERSE_HOME, CONFIG_FILE);
}

/**
 * Load configuration from file
 */
export function loadConfig(): ClawverseConfig {
  const configPath = getConfigPath();
  
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON5.parse(raw);
    
    // Merge with defaults
    const config: ClawverseConfig = {
      daemon: { ...DEFAULT_CONFIG.daemon, ...parsed.daemon },
      nodes: parsed.nodes ?? [],
      topology: {
        mode: parsed.topology?.mode ?? DEFAULT_CONFIG.topology?.mode,
        relations: parsed.topology?.relations ?? [],
      },
      routing: parsed.routing ? {
        default: parsed.routing.default ?? DEFAULT_CONFIG.routing?.default,
        rules: parsed.routing.rules ?? [],
      } : DEFAULT_CONFIG.routing,
    };

    // Validate
    const validation = validateConfig(config);
    if (!validation.ok) {
      throw new Error(`Invalid configuration: ${validation.error}`);
    }

    return config;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Invalid configuration")) {
      throw err;
    }
    throw new Error(`Failed to load config from ${configPath}: ${err}`);
  }
}

/**
 * Save configuration to file
 */
export async function saveConfig(config: ClawverseConfig): Promise<void> {
  ensureClawverseHome();
  
  const validation = validateConfig(config);
  if (!validation.ok) {
    throw new Error(`Invalid configuration: ${validation.error}`);
  }

  const configPath = getConfigPath();
  const json = JSON.stringify(config, null, 2);
  
  await fs.promises.writeFile(configPath, json, { mode: 0o600 });
}

/**
 * Update specific config fields
 */
export async function updateConfig(
  updater: (config: ClawverseConfig) => ClawverseConfig
): Promise<ClawverseConfig> {
  const current = loadConfig();
  const updated = updater(current);
  await saveConfig(updated);
  return updated;
}

/**
 * Add a node to the configuration
 */
export async function addNode(
  node: ClawverseConfig["nodes"][number]
): Promise<ClawverseConfig> {
  return updateConfig((config) => {
    // Check for duplicate ID
    if (config.nodes.some((n) => n.id === node.id)) {
      throw new Error(`Node with id "${node.id}" already exists`);
    }
    return {
      ...config,
      nodes: [...config.nodes, node],
    };
  });
}

/**
 * Remove a node from the configuration
 */
export async function removeNode(nodeId: string): Promise<ClawverseConfig> {
  return updateConfig((config) => {
    const filtered = config.nodes.filter((n) => n.id !== nodeId);
    if (filtered.length === config.nodes.length) {
      throw new Error(`Node with id "${nodeId}" not found`);
    }

    // Also remove from topology relations
    const relations = config.topology.relations
      .map((r) => ({
        ...r,
        children: r.children.filter((c) => c !== nodeId),
      }))
      .filter((r) => r.parent !== nodeId && r.children.length > 0);

    // Also remove from routing configuration
    let routing = config.routing;
    if (routing) {
      routing = {
        default: routing.default ? {
          ...routing.default,
          targets: routing.default.targets.filter((t) => t !== nodeId),
          fallback: routing.default.fallback === nodeId ? undefined : routing.default.fallback,
        } : undefined,
        rules: routing.rules?.map((rule) => ({
          ...rule,
          target: rule.target === nodeId ? undefined : rule.target,
          targets: rule.targets?.filter((t) => t !== nodeId),
        })).filter((rule) => rule.target || (rule.targets && rule.targets.length > 0)),
      };
    }

    return {
      ...config,
      nodes: filtered,
      topology: { ...config.topology, relations },
      routing,
    };
  });
}

/**
 * Get a node by ID
 */
export function getNode(
  config: ClawverseConfig,
  nodeId: string
): ClawverseConfig["nodes"][number] | undefined {
  return config.nodes.find((n) => n.id === nodeId);
}
