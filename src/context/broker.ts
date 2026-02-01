/**
 * Context broker - handles cross-node context queries and caching
 */

import type { NodeRegistry } from "../daemon/node-registry.js";
import type { TopologyManager } from "../topology/manager.js";
import type {
  ContextQueryPayload,
  ContextResponse,
  ContextHistoryResponse,
  ContextSessionsResponse,
  SessionHistoryItem,
  SessionListItem,
} from "../protocol/messages.js";
import { ContextCache } from "./cache.js";

export interface ContextBrokerOptions {
  /** Cache TTL in ms (default: 30000) */
  cacheTtlMs?: number;
  /** Max cache size per node */
  maxCacheSize?: number;
}

const DEFAULT_OPTIONS: Required<ContextBrokerOptions> = {
  cacheTtlMs: 30000,
  maxCacheSize: 100,
};

/**
 * Context broker manages cross-node context queries with caching
 */
export class ContextBroker {
  private registry: NodeRegistry;
  private topology: TopologyManager;
  private cache: ContextCache;
  private options: Required<ContextBrokerOptions>;

  constructor(
    registry: NodeRegistry,
    topology: TopologyManager,
    options: ContextBrokerOptions = {}
  ) {
    this.registry = registry;
    this.topology = topology;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.cache = new ContextCache({
      ttlMs: this.options.cacheTtlMs,
      maxSize: this.options.maxCacheSize,
    });
  }

  /**
   * Get the topology manager
   */
  getTopology(): TopologyManager {
    return this.topology;
  }

  /**
   * Query context from a node
   */
  async query(
    nodeId: string,
    params: ContextQueryPayload
  ): Promise<ContextResponse> {
    // Check cache first
    const cacheKey = this.buildCacheKey(nodeId, params);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached.data as ContextResponse;
    }

    // Get transport
    const transport = this.registry.getTransport(nodeId);
    if (!transport) {
      throw new Error(`Node ${nodeId} not connected`);
    }

    // Execute query
    let result: ContextResponse;

    switch (params.queryType) {
      case "session_history":
        result = await this.querySessionHistory(nodeId, params);
        break;

      case "session_list":
        result = await this.querySessionList(nodeId, params);
        break;

      case "user_profile":
        result = await this.queryUserProfile(nodeId, params);
        break;

      default:
        throw new Error(`Unknown query type: ${params.queryType}`);
    }

    // Cache result
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Query session history from a node
   */
  private async querySessionHistory(
    nodeId: string,
    params: ContextQueryPayload
  ): Promise<ContextHistoryResponse> {
    const transport = this.registry.getTransport(nodeId);
    if (!transport) {
      throw new Error(`Node ${nodeId} not connected`);
    }

    const sessionKey = params.sessionKey ?? "main";
    const limit = params.limit ?? 20;

    // Call gateway's chat.history method
    const response = await transport.call<{
      messages?: Array<{
        role: string;
        content: string;
        timestamp?: number;
        toolCalls?: unknown[];
      }>;
    }>("chat.history", {
      sessionKey,
      limit,
      includeTools: true,
    });

    if (response.error) {
      throw new Error(`Query failed: ${response.error.message}`);
    }

    const messages: SessionHistoryItem[] = (response.result?.messages ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      timestamp: m.timestamp,
      toolCalls: m.toolCalls,
    }));

    return {
      sessionKey,
      messages,
      totalMessages: messages.length,
    };
  }

  /**
   * Query session list from a node
   */
  private async querySessionList(
    nodeId: string,
    params: ContextQueryPayload
  ): Promise<ContextSessionsResponse> {
    const transport = this.registry.getTransport(nodeId);
    if (!transport) {
      throw new Error(`Node ${nodeId} not connected`);
    }

    // Call gateway's sessions.list method
    const response = await transport.call<{
      sessions?: Array<{
        sessionKey: string;
        label?: string;
        updatedAt?: number;
        channel?: string;
        messageCount?: number;
      }>;
    }>("sessions.list", {
      agentId: params.agentId,
    });

    if (response.error) {
      throw new Error(`Query failed: ${response.error.message}`);
    }

    const sessions: SessionListItem[] = (response.result?.sessions ?? []).map((s) => ({
      sessionKey: s.sessionKey,
      label: s.label,
      updatedAt: s.updatedAt,
      channel: s.channel,
      messageCount: s.messageCount,
    }));

    return { sessions };
  }

  /**
   * Query user profile (placeholder for future implementation)
   */
  private async queryUserProfile(
    _nodeId: string,
    _params: ContextQueryPayload
  ): Promise<ContextResponse> {
    // User profile is not yet implemented in OpenClaw
    // Return empty sessions for now
    return { sessions: [] };
  }

  /**
   * Build cache key for a query
   */
  private buildCacheKey(nodeId: string, params: ContextQueryPayload): string {
    const parts = [nodeId, params.queryType];
    
    if (params.sessionKey) {
      parts.push(params.sessionKey);
    }
    if (params.agentId) {
      parts.push(params.agentId);
    }
    if (params.limit) {
      parts.push(String(params.limit));
    }

    return parts.join(":");
  }

  /**
   * Invalidate cache for a node
   */
  invalidateNode(nodeId: string): void {
    this.cache.invalidateByPrefix(nodeId);
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hits: number; misses: number } {
    return this.cache.getStats();
  }
}
