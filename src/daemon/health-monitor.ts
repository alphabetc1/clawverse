/**
 * Health monitor for tracking node health and availability
 */

import type { NodeState } from "../config/types.js";
import type { NodeRegistry } from "./node-registry.js";

export interface HealthMetrics {
  nodeId: string;
  status: NodeState["status"];
  uptime?: number;
  lastLatency?: number;
  avgLatency?: number;
  errorCount: number;
  lastError?: string;
  lastChecked: number;
}

export interface HealthMonitorOptions {
  /** How many latency samples to keep for averaging */
  latencySampleSize?: number;
  /** Time window for error counting (ms) */
  errorWindowMs?: number;
}

const DEFAULT_OPTIONS: Required<HealthMonitorOptions> = {
  latencySampleSize: 10,
  errorWindowMs: 300000, // 5 minutes
};

/**
 * Health monitor tracks node health metrics
 */
export class HealthMonitor {
  private registry: NodeRegistry;
  private options: Required<HealthMonitorOptions>;
  private metrics: Map<string, HealthMetrics> = new Map();
  private latencySamples: Map<string, number[]> = new Map();
  private errors: Map<string, { timestamp: number; message: string }[]> = new Map();
  private connectionTimes: Map<string, number> = new Map();

  constructor(registry: NodeRegistry, options: HealthMonitorOptions = {}) {
    this.registry = registry;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Subscribe to state changes
    this.registry.onStateChange((nodeId, state) => {
      this.handleStateChange(nodeId, state);
    });
  }

  /**
   * Get health metrics for a node
   */
  getMetrics(nodeId: string): HealthMetrics | undefined {
    return this.metrics.get(nodeId);
  }

  /**
   * Get health metrics for all nodes
   */
  getAllMetrics(): HealthMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Record a latency sample
   */
  recordLatency(nodeId: string, latencyMs: number): void {
    const samples = this.latencySamples.get(nodeId) ?? [];
    samples.push(latencyMs);
    
    // Keep only recent samples
    if (samples.length > this.options.latencySampleSize) {
      samples.shift();
    }
    
    this.latencySamples.set(nodeId, samples);
    this.updateMetrics(nodeId);
  }

  /**
   * Record an error
   */
  recordError(nodeId: string, message: string): void {
    const nodeErrors = this.errors.get(nodeId) ?? [];
    nodeErrors.push({ timestamp: Date.now(), message });
    this.errors.set(nodeId, nodeErrors);
    this.pruneOldErrors(nodeId);
    this.updateMetrics(nodeId);
  }

  /**
   * Get recent errors for a node
   */
  getErrors(nodeId: string): { timestamp: number; message: string }[] {
    return this.errors.get(nodeId) ?? [];
  }

  /**
   * Clear error history for a node
   */
  clearErrors(nodeId: string): void {
    this.errors.delete(nodeId);
    this.updateMetrics(nodeId);
  }

  /**
   * Handle state changes
   */
  private handleStateChange(nodeId: string, state: NodeState): void {
    if (state.status === "connected") {
      this.connectionTimes.set(nodeId, Date.now());
    } else if (state.status === "error" && state.error) {
      this.recordError(nodeId, state.error);
    }
    
    this.updateMetrics(nodeId);
  }

  /**
   * Update metrics for a node
   */
  private updateMetrics(nodeId: string): void {
    const state = this.registry.getState(nodeId);
    if (!state) return;

    const samples = this.latencySamples.get(nodeId) ?? [];
    const nodeErrors = this.errors.get(nodeId) ?? [];
    const connectedAt = this.connectionTimes.get(nodeId);

    const avgLatency = samples.length > 0
      ? samples.reduce((a, b) => a + b, 0) / samples.length
      : undefined;

    const metrics: HealthMetrics = {
      nodeId,
      status: state.status,
      uptime: connectedAt && state.status === "connected"
        ? Date.now() - connectedAt
        : undefined,
      lastLatency: samples.length > 0 ? samples[samples.length - 1] : undefined,
      avgLatency,
      errorCount: nodeErrors.length,
      lastError: nodeErrors.length > 0 
        ? nodeErrors[nodeErrors.length - 1].message 
        : undefined,
      lastChecked: Date.now(),
    };

    this.metrics.set(nodeId, metrics);
  }

  /**
   * Remove errors outside the time window
   */
  private pruneOldErrors(nodeId: string): void {
    const nodeErrors = this.errors.get(nodeId);
    if (!nodeErrors) return;

    const cutoff = Date.now() - this.options.errorWindowMs;
    const filtered = nodeErrors.filter((e) => e.timestamp >= cutoff);
    
    if (filtered.length !== nodeErrors.length) {
      this.errors.set(nodeId, filtered);
    }
  }

  /**
   * Check if a node is healthy
   */
  isHealthy(nodeId: string): boolean {
    const metrics = this.metrics.get(nodeId);
    if (!metrics) return false;
    
    return metrics.status === "connected" && metrics.errorCount < 3;
  }

  /**
   * Get summary of overall health
   */
  getSummary(): {
    total: number;
    connected: number;
    disconnected: number;
    error: number;
    healthy: number;
  } {
    const metrics = this.getAllMetrics();
    
    return {
      total: metrics.length,
      connected: metrics.filter((m) => m.status === "connected").length,
      disconnected: metrics.filter((m) => m.status === "disconnected").length,
      error: metrics.filter((m) => m.status === "error").length,
      healthy: metrics.filter((m) => this.isHealthy(m.nodeId)).length,
    };
  }

  /**
   * Cleanup
   */
  clear(): void {
    this.metrics.clear();
    this.latencySamples.clear();
    this.errors.clear();
    this.connectionTimes.clear();
  }
}
