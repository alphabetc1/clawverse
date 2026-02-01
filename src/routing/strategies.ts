/**
 * Routing strategy implementations
 */

import type { Strategy, StrategyContext } from "./types.js";
import type { RoutingStrategy } from "../config/types.js";

/**
 * Filter targets to only healthy ones
 */
function filterHealthy(targets: string[], context: StrategyContext): string[] {
  if (context.health.size === 0) {
    // No health info, assume all healthy
    return targets;
  }
  return targets.filter((t) => context.health.get(t) !== false);
}

/**
 * Round-robin strategy - rotate through targets in order
 */
export class RoundRobinStrategy implements Strategy {
  readonly name: RoutingStrategy = "round-robin";
  private index = 0;

  select(targets: string[], context: StrategyContext): string | null {
    const healthy = filterHealthy(targets, context);
    if (healthy.length === 0) return null;

    const target = healthy[this.index % healthy.length];
    this.index++;
    return target;
  }

  reset(): void {
    this.index = 0;
  }
}

/**
 * Weighted strategy - select based on node weights
 * Uses weighted random selection
 */
export class WeightedStrategy implements Strategy {
  readonly name: RoutingStrategy = "weighted";

  select(targets: string[], context: StrategyContext): string | null {
    const healthy = filterHealthy(targets, context);
    if (healthy.length === 0) return null;

    // Calculate total weight
    let totalWeight = 0;
    const weights: number[] = [];
    
    for (const target of healthy) {
      const weight = context.weights.get(target) ?? 1;
      weights.push(weight);
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      // All weights are 0, fall back to random
      return healthy[Math.floor(Math.random() * healthy.length)];
    }

    // Weighted random selection
    let random = Math.random() * totalWeight;
    for (let i = 0; i < healthy.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return healthy[i];
      }
    }

    // Fallback (shouldn't reach here)
    return healthy[healthy.length - 1];
  }

  reset(): void {
    // Stateless strategy, nothing to reset
  }
}

/**
 * Random strategy - randomly select a target
 */
export class RandomStrategy implements Strategy {
  readonly name: RoutingStrategy = "random";

  select(targets: string[], context: StrategyContext): string | null {
    const healthy = filterHealthy(targets, context);
    if (healthy.length === 0) return null;

    const index = Math.floor(Math.random() * healthy.length);
    return healthy[index];
  }

  reset(): void {
    // Stateless strategy, nothing to reset
  }
}

/**
 * Least connections strategy - select node with fewest active connections
 */
export class LeastConnectionsStrategy implements Strategy {
  readonly name: RoutingStrategy = "least-connections";

  select(targets: string[], context: StrategyContext): string | null {
    const healthy = filterHealthy(targets, context);
    if (healthy.length === 0) return null;

    let minConnections = Infinity;
    let selected: string | null = null;

    for (const target of healthy) {
      const connections = context.connections.get(target) ?? 0;
      if (connections < minConnections) {
        minConnections = connections;
        selected = target;
      }
    }

    return selected;
  }

  reset(): void {
    // Stateless strategy, nothing to reset
  }
}

/**
 * First available strategy - use first healthy target
 */
export class FirstAvailableStrategy implements Strategy {
  readonly name: RoutingStrategy = "first-available";

  select(targets: string[], context: StrategyContext): string | null {
    const healthy = filterHealthy(targets, context);
    return healthy.length > 0 ? healthy[0] : null;
  }

  reset(): void {
    // Stateless strategy, nothing to reset
  }
}

/**
 * Create a strategy instance by name
 */
export function createStrategy(name: RoutingStrategy): Strategy {
  switch (name) {
    case "round-robin":
      return new RoundRobinStrategy();
    case "weighted":
      return new WeightedStrategy();
    case "random":
      return new RandomStrategy();
    case "least-connections":
      return new LeastConnectionsStrategy();
    case "first-available":
      return new FirstAvailableStrategy();
    default:
      // Default to round-robin for unknown strategies
      return new RoundRobinStrategy();
  }
}

/**
 * All available strategies
 */
export const AVAILABLE_STRATEGIES: RoutingStrategy[] = [
  "round-robin",
  "weighted",
  "random",
  "least-connections",
  "first-available",
];
