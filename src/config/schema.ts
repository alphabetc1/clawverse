/**
 * Configuration validation for Clawverse
 */

import type {
  ClawverseConfig,
  NodeConfig,
  NodeRelation,
  RoutingConfig,
  RoutingRule,
  RoutingStrategy,
} from "./types.js";

// Valid routing strategies
const VALID_STRATEGIES: RoutingStrategy[] = [
  "round-robin",
  "weighted",
  "random",
  "least-connections",
  "first-available",
];

export type ValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validate a node ID
 */
function isValidNodeId(id: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id);
}

/**
 * Validate a URL
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "ws:" || parsed.protocol === "wss:";
  } catch {
    return false;
  }
}

/**
 * Validate a node configuration
 */
export function validateNode(node: NodeConfig): ValidationResult {
  if (!node.id || typeof node.id !== "string") {
    return { ok: false, error: "Node must have an id" };
  }

  if (!isValidNodeId(node.id)) {
    return {
      ok: false,
      error: `Invalid node id "${node.id}": must start with a letter and contain only letters, numbers, underscores, and hyphens`,
    };
  }

  if (!node.name || typeof node.name !== "string") {
    return { ok: false, error: `Node "${node.id}" must have a name` };
  }

  if (!node.connection || typeof node.connection !== "object") {
    return { ok: false, error: `Node "${node.id}" must have a connection` };
  }

  const conn = node.connection;

  switch (conn.type) {
    case "local":
      if (
        conn.port !== undefined &&
        (typeof conn.port !== "number" || conn.port < 1 || conn.port > 65535)
      ) {
        return { ok: false, error: `Node "${node.id}": invalid port` };
      }
      break;

    case "ssh":
      if (!conn.host || typeof conn.host !== "string") {
        return { ok: false, error: `Node "${node.id}": SSH connection requires host` };
      }
      if (
        conn.port !== undefined &&
        (typeof conn.port !== "number" || conn.port < 1 || conn.port > 65535)
      ) {
        return { ok: false, error: `Node "${node.id}": invalid SSH port` };
      }
      break;

    case "url":
      if (!conn.url || typeof conn.url !== "string") {
        return { ok: false, error: `Node "${node.id}": URL connection requires url` };
      }
      if (!isValidUrl(conn.url)) {
        return { ok: false, error: `Node "${node.id}": invalid URL (must be ws:// or wss://)` };
      }
      break;

    default:
      return { ok: false, error: `Node "${node.id}": unknown connection type` };
  }

  // Validate weight if provided
  if (node.weight !== undefined && (typeof node.weight !== "number" || node.weight < 0)) {
    return { ok: false, error: `Node "${node.id}": weight must be a non-negative number` };
  }

  return { ok: true };
}

/**
 * Validate a topology relation
 */
export function validateRelation(
  relation: NodeRelation,
  nodeIds: Set<string>
): ValidationResult {
  if (!relation.parent || typeof relation.parent !== "string") {
    return { ok: false, error: "Relation must have a parent" };
  }

  if (!nodeIds.has(relation.parent)) {
    return { ok: false, error: `Relation parent "${relation.parent}" is not a configured node` };
  }

  if (!Array.isArray(relation.children) || relation.children.length === 0) {
    return { ok: false, error: "Relation must have at least one child" };
  }

  for (const child of relation.children) {
    if (!nodeIds.has(child)) {
      return { ok: false, error: `Relation child "${child}" is not a configured node` };
    }
    if (child === relation.parent) {
      return { ok: false, error: `Node "${child}" cannot be its own child` };
    }
  }

  const validModes = ["control", "delegate", "message", "all"];
  if (!validModes.includes(relation.mode)) {
    return { ok: false, error: `Invalid relation mode "${relation.mode}"` };
  }

  return { ok: true };
}

/**
 * Check for circular dependencies in topology
 */
function hasCircularDependency(relations: NodeRelation[]): string | null {
  const graph = new Map<string, string[]>();

  for (const rel of relations) {
    const existing = graph.get(rel.parent) ?? [];
    graph.set(rel.parent, [...existing, ...rel.children]);
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(node: string): string | null {
    visited.add(node);
    recursionStack.add(node);

    const children = graph.get(node) ?? [];
    for (const child of children) {
      if (!visited.has(child)) {
        const cycle = dfs(child);
        if (cycle) return cycle;
      } else if (recursionStack.has(child)) {
        return `${node} -> ${child}`;
      }
    }

    recursionStack.delete(node);
    return null;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
  }

  return null;
}

/**
 * Validate a routing rule
 */
export function validateRoutingRule(
  rule: RoutingRule,
  nodeIds: Set<string>,
  index: number
): ValidationResult {
  if (!rule.match || typeof rule.match !== "object") {
    return { ok: false, error: `Routing rule ${index}: must have match conditions` };
  }

  if (!rule.target && (!rule.targets || rule.targets.length === 0)) {
    return { ok: false, error: `Routing rule ${index}: must have target or targets` };
  }

  if (rule.target && !nodeIds.has(rule.target)) {
    return {
      ok: false,
      error: `Routing rule ${index}: target "${rule.target}" is not a configured node`,
    };
  }

  if (rule.targets) {
    for (const target of rule.targets) {
      if (!nodeIds.has(target)) {
        return {
          ok: false,
          error: `Routing rule ${index}: target "${target}" is not a configured node`,
        };
      }
    }
  }

  if (rule.strategy && !VALID_STRATEGIES.includes(rule.strategy)) {
    return { ok: false, error: `Routing rule ${index}: invalid strategy "${rule.strategy}"` };
  }

  return { ok: true };
}

/**
 * Validate routing configuration
 */
export function validateRouting(
  routing: RoutingConfig | undefined,
  nodeIds: Set<string>
): ValidationResult {
  if (!routing) return { ok: true };

  if (routing.default) {
    const def = routing.default;
    if (!def.strategy || !VALID_STRATEGIES.includes(def.strategy)) {
      return { ok: false, error: `Default routing: invalid strategy "${def.strategy}"` };
    }
    if (!Array.isArray(def.targets)) {
      return { ok: false, error: "Default routing must have targets array" };
    }
    for (const target of def.targets) {
      if (!nodeIds.has(target)) {
        return {
          ok: false,
          error: `Default routing: target "${target}" is not a configured node`,
        };
      }
    }
    if (def.fallback && !nodeIds.has(def.fallback)) {
      return {
        ok: false,
        error: `Default routing: fallback "${def.fallback}" is not a configured node`,
      };
    }
  }

  if (routing.rules) {
    for (let i = 0; i < routing.rules.length; i++) {
      const result = validateRoutingRule(routing.rules[i], nodeIds, i);
      if (!result.ok) return result;
    }
  }

  return { ok: true };
}

/**
 * Validate the full configuration
 */
export function validateConfig(config: ClawverseConfig): ValidationResult {
  // Validate daemon config
  if (!config.daemon || typeof config.daemon !== "object") {
    return { ok: false, error: "Configuration must have daemon settings" };
  }

  if (
    typeof config.daemon.port !== "number" ||
    config.daemon.port < 1 ||
    config.daemon.port > 65535
  ) {
    return { ok: false, error: "Invalid daemon port" };
  }

  if (!["loopback", "lan"].includes(config.daemon.bind)) {
    return { ok: false, error: "Invalid daemon bind mode" };
  }

  // Validate nodes
  if (!Array.isArray(config.nodes)) {
    return { ok: false, error: "Configuration must have nodes array" };
  }

  const nodeIds = new Set<string>();
  for (const node of config.nodes) {
    const nodeResult = validateNode(node);
    if (!nodeResult.ok) {
      return nodeResult;
    }
    if (nodeIds.has(node.id)) {
      return { ok: false, error: `Duplicate node id "${node.id}"` };
    }
    nodeIds.add(node.id);
  }

  // Validate topology
  if (!config.topology || !Array.isArray(config.topology.relations)) {
    return { ok: false, error: "Configuration must have topology.relations array" };
  }

  // Validate topology mode if specified
  if (config.topology.mode) {
    const validModes = ["hierarchical", "parallel", "mixed"];
    if (!validModes.includes(config.topology.mode)) {
      return { ok: false, error: `Invalid topology mode "${config.topology.mode}"` };
    }
  }

  for (const relation of config.topology.relations) {
    const relResult = validateRelation(relation, nodeIds);
    if (!relResult.ok) {
      return relResult;
    }
  }

  // Check for circular dependencies
  const cycle = hasCircularDependency(config.topology.relations);
  if (cycle) {
    return { ok: false, error: `Circular dependency detected in topology: ${cycle}` };
  }

  // Validate routing
  const routingResult = validateRouting(config.routing, nodeIds);
  if (!routingResult.ok) {
    return routingResult;
  }

  return { ok: true };
}
