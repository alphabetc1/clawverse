/**
 * Routing module types
 */

import type { RoutingStrategy } from "../config/types.js";

/**
 * Strategy interface for target selection
 */
export interface Strategy {
  /** Strategy name */
  readonly name: RoutingStrategy;
  
  /**
   * Select next target from available targets
   * @param targets Available target node IDs
   * @param context Additional context for selection
   */
  select(targets: string[], context: StrategyContext): string | null;
  
  /**
   * Reset strategy state (e.g., round-robin index)
   */
  reset(): void;
}

/**
 * Context passed to strategy for decision making
 */
export interface StrategyContext {
  /** Node weights (node ID -> weight) */
  weights: Map<string, number>;
  /** Active connection counts (node ID -> count) */
  connections: Map<string, number>;
  /** Node health status (node ID -> is healthy) */
  health: Map<string, boolean>;
}

/**
 * Create default strategy context
 */
export function createDefaultContext(): StrategyContext {
  return {
    weights: new Map(),
    connections: new Map(),
    health: new Map(),
  };
}
