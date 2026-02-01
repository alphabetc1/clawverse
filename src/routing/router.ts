/**
 * Message router - handles routing decisions based on rules and strategies
 */

import type {
  RoutingConfig,
  RoutingRule,
  RouteContext,
  RouteDecision,
  RoutingStrategy,
  NodeConfig,
} from "../config/types.js";
import type { Strategy, StrategyContext } from "./types.js";
import { createStrategy } from "./strategies.js";

export interface RouterOptions {
  /** Node configurations for weight lookup */
  nodes: NodeConfig[];
  /** Routing configuration */
  routing: RoutingConfig;
}

/**
 * Message router for selecting target nodes
 */
export class Router {
  private config: RoutingConfig;
  private nodes: Map<string, NodeConfig>;
  private strategies: Map<string, Strategy>;
  private defaultStrategy: Strategy;
  private connectionCounts: Map<string, number>;
  private nodeHealth: Map<string, boolean>;

  constructor(options: RouterOptions) {
    this.config = options.routing;
    this.nodes = new Map(options.nodes.map((n) => [n.id, n]));
    this.strategies = new Map();
    this.connectionCounts = new Map();
    this.nodeHealth = new Map();

    // Initialize default strategy
    const defaultStrategyName = this.config.default?.strategy ?? "round-robin";
    this.defaultStrategy = this.getOrCreateStrategy(defaultStrategyName);

    // Pre-create strategies for all rules
    for (const rule of this.config.rules ?? []) {
      if (rule.strategy) {
        this.getOrCreateStrategy(rule.strategy);
      }
    }
  }

  /**
   * Update routing configuration
   */
  updateConfig(routing: RoutingConfig): void {
    this.config = routing;
    const defaultStrategyName = routing.default?.strategy ?? "round-robin";
    this.defaultStrategy = this.getOrCreateStrategy(defaultStrategyName);
  }

  /**
   * Update node list
   */
  updateNodes(nodes: NodeConfig[]): void {
    this.nodes = new Map(nodes.map((n) => [n.id, n]));
  }

  /**
   * Make a routing decision
   */
  route(context: RouteContext): RouteDecision | null {
    // Sort rules by priority (higher first)
    const sortedRules = [...(this.config.rules ?? [])].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
    );

    // Try to match rules
    for (const rule of sortedRules) {
      if (this.matchRule(rule, context)) {
        const target = this.selectFromRule(rule);
        if (target) {
          return {
            target,
            matchedRule: rule.name,
            strategy: rule.strategy ?? "first-available",
          };
        }
      }
    }

    // Use default routing
    return this.routeDefault();
  }

  /**
   * Route using default configuration
   */
  private routeDefault(): RouteDecision | null {
    const defaultConfig = this.config.default;
    if (!defaultConfig || defaultConfig.targets.length === 0) {
      return null;
    }

    const strategyContext = this.buildStrategyContext();
    const target = this.defaultStrategy.select(defaultConfig.targets, strategyContext);

    if (target) {
      return {
        target,
        strategy: defaultConfig.strategy,
      };
    }

    // Try fallback
    if (defaultConfig.fallback) {
      const isHealthy = this.nodeHealth.get(defaultConfig.fallback) !== false;
      if (isHealthy) {
        return {
          target: defaultConfig.fallback,
          strategy: "first-available",
        };
      }
    }

    return null;
  }

  /**
   * Check if a rule matches the context
   */
  private matchRule(rule: RoutingRule, context: RouteContext): boolean {
    const { match } = rule;

    // Match channel
    if (match.channel && context.channel !== match.channel) {
      return false;
    }

    // Match source node
    if (match.sourceNode && context.sourceNode !== match.sourceNode) {
      return false;
    }

    // Match session pattern (supports * wildcard)
    if (match.sessionPattern && context.sessionKey) {
      if (!this.matchPattern(match.sessionPattern, context.sessionKey)) {
        return false;
      }
    }

    // Match capability - at least one target must have the capability
    if (match.capability) {
      const targets = rule.targets ?? (rule.target ? [rule.target] : []);
      const hasCapable = targets.some((t) => {
        const node = this.nodes.get(t);
        return node?.capabilities?.includes(match.capability!);
      });
      if (!hasCapable) {
        return false;
      }
    }

    return true;
  }

  /**
   * Match a pattern with * wildcard support
   */
  private matchPattern(pattern: string, value: string): boolean {
    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&") // Escape special chars
      .replace(/\*/g, ".*"); // Convert * to .*
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(value);
  }

  /**
   * Select a target from a rule
   */
  private selectFromRule(rule: RoutingRule): string | null {
    // Single target
    if (rule.target) {
      const isHealthy = this.nodeHealth.get(rule.target) !== false;
      return isHealthy ? rule.target : null;
    }

    // Multiple targets with strategy
    if (rule.targets && rule.targets.length > 0) {
      const strategyName = rule.strategy ?? "round-robin";
      const strategy = this.getOrCreateStrategy(strategyName);
      const strategyContext = this.buildStrategyContext();
      return strategy.select(rule.targets, strategyContext);
    }

    return null;
  }

  /**
   * Build strategy context from current state
   */
  private buildStrategyContext(): StrategyContext {
    const weights = new Map<string, number>();
    for (const [id, node] of this.nodes) {
      weights.set(id, node.weight ?? 1);
    }

    return {
      weights,
      connections: new Map(this.connectionCounts),
      health: new Map(this.nodeHealth),
    };
  }

  /**
   * Get or create a strategy instance
   */
  private getOrCreateStrategy(name: RoutingStrategy): Strategy {
    let strategy = this.strategies.get(name);
    if (!strategy) {
      strategy = createStrategy(name);
      this.strategies.set(name, strategy);
    }
    return strategy;
  }

  /**
   * Update node health status
   */
  setNodeHealth(nodeId: string, healthy: boolean): void {
    this.nodeHealth.set(nodeId, healthy);
  }

  /**
   * Increment connection count for a node
   */
  incrementConnections(nodeId: string): void {
    const count = this.connectionCounts.get(nodeId) ?? 0;
    this.connectionCounts.set(nodeId, count + 1);
  }

  /**
   * Decrement connection count for a node
   */
  decrementConnections(nodeId: string): void {
    const count = this.connectionCounts.get(nodeId) ?? 0;
    this.connectionCounts.set(nodeId, Math.max(0, count - 1));
  }

  /**
   * Get connection count for a node
   */
  getConnectionCount(nodeId: string): number {
    return this.connectionCounts.get(nodeId) ?? 0;
  }

  /**
   * Get all connection counts
   */
  getAllConnectionCounts(): Map<string, number> {
    return new Map(this.connectionCounts);
  }

  /**
   * Reset all strategy states
   */
  resetStrategies(): void {
    for (const strategy of this.strategies.values()) {
      strategy.reset();
    }
    this.defaultStrategy.reset();
  }

  /**
   * Get routing configuration
   */
  getConfig(): RoutingConfig {
    return this.config;
  }

  /**
   * Get all targets (from default and rules)
   */
  getAllTargets(): string[] {
    const targets = new Set<string>();

    // From default
    if (this.config.default?.targets) {
      for (const t of this.config.default.targets) {
        targets.add(t);
      }
    }
    if (this.config.default?.fallback) {
      targets.add(this.config.default.fallback);
    }

    // From rules
    for (const rule of this.config.rules ?? []) {
      if (rule.target) {
        targets.add(rule.target);
      }
      if (rule.targets) {
        for (const t of rule.targets) {
          targets.add(t);
        }
      }
    }

    return Array.from(targets);
  }

  /**
   * Test route decision (dry run)
   */
  testRoute(context: RouteContext): {
    decision: RouteDecision | null;
    matchedRules: string[];
    defaultUsed: boolean;
  } {
    const matchedRules: string[] = [];
    
    // Check which rules would match
    for (const rule of this.config.rules ?? []) {
      if (this.matchRule(rule, context)) {
        matchedRules.push(rule.name ?? "(unnamed)");
      }
    }

    const decision = this.route(context);
    const defaultUsed = decision !== null && !decision.matchedRule;

    return { decision, matchedRules, defaultUsed };
  }
}

/**
 * Create a router from configuration
 */
export function createRouter(nodes: NodeConfig[], routing: RoutingConfig): Router {
  return new Router({ nodes, routing });
}
