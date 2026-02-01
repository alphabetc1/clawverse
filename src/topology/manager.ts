/**
 * Topology manager - handles node relationships and permission checking
 */

import type { ClawverseConfig, NodeRelation, RelationMode } from "../config/types.js";

export interface TopologyPermission {
  allowed: boolean;
  mode?: RelationMode;
  reason?: string;
}

/**
 * Topology manager handles node hierarchy and permission checking
 */
export class TopologyManager {
  private relations: NodeRelation[];
  private nodeIds: Set<string>;

  constructor(config: ClawverseConfig) {
    this.relations = config.topology.relations;
    this.nodeIds = new Set(config.nodes.map((n) => n.id));
  }

  /**
   * Update topology from config
   */
  update(config: ClawverseConfig): void {
    this.relations = config.topology.relations;
    this.nodeIds = new Set(config.nodes.map((n) => n.id));
  }

  /**
   * Get parent node for a given node
   */
  getParent(nodeId: string): string | null {
    for (const rel of this.relations) {
      if (rel.children.includes(nodeId)) {
        return rel.parent;
      }
    }
    return null;
  }

  /**
   * Get children of a node
   */
  getChildren(nodeId: string): string[] {
    const rel = this.relations.find((r) => r.parent === nodeId);
    return rel?.children ?? [];
  }

  /**
   * Get all descendants of a node (recursive)
   */
  getDescendants(nodeId: string): string[] {
    const descendants: string[] = [];
    const children = this.getChildren(nodeId);
    
    for (const child of children) {
      descendants.push(child);
      descendants.push(...this.getDescendants(child));
    }
    
    return descendants;
  }

  /**
   * Get all ancestors of a node (recursive)
   */
  getAncestors(nodeId: string): string[] {
    const ancestors: string[] = [];
    let current = this.getParent(nodeId);
    
    while (current) {
      ancestors.push(current);
      current = this.getParent(current);
    }
    
    return ancestors;
  }

  /**
   * Get the relation mode between two nodes
   */
  getRelationMode(parentId: string, childId: string): RelationMode | null {
    const rel = this.relations.find(
      (r) => r.parent === parentId && r.children.includes(childId)
    );
    return rel?.mode ?? null;
  }

  /**
   * Check if a node can perform an action on another node
   */
  checkPermission(
    sourceId: string,
    targetId: string,
    action: "control" | "delegate" | "message"
  ): TopologyPermission {
    // Same node - always allowed
    if (sourceId === targetId) {
      return { allowed: true, mode: "all", reason: "same node" };
    }

    // Check direct parent-child relationship
    const mode = this.getRelationMode(sourceId, targetId);
    
    if (mode) {
      if (mode === "all" || mode === action) {
        return { allowed: true, mode, reason: "direct relation" };
      }
      return { 
        allowed: false, 
        mode, 
        reason: `mode "${mode}" does not allow "${action}"` 
      };
    }

    // Check if source is an ancestor (transitive parent)
    const ancestors = this.getAncestors(targetId);
    if (ancestors.includes(sourceId)) {
      // Find the relation mode through the hierarchy
      const directChild = this.findDirectChildInPath(sourceId, targetId);
      if (directChild) {
        const transitiveMode = this.getRelationMode(sourceId, directChild);
        if (transitiveMode === "all" || transitiveMode === action) {
          return { allowed: true, mode: transitiveMode, reason: "transitive relation" };
        }
      }
    }

    // Check if they are peers (no direct relation but both are valid nodes)
    if (this.nodeIds.has(sourceId) && this.nodeIds.has(targetId)) {
      // For peers, allow messaging by default
      if (action === "message") {
        return { allowed: true, reason: "peer nodes" };
      }
      return { 
        allowed: false, 
        reason: `no relation defined for "${action}" between peers` 
      };
    }

    return { allowed: false, reason: "unknown node" };
  }

  /**
   * Find direct child in path from ancestor to descendant
   */
  private findDirectChildInPath(ancestorId: string, descendantId: string): string | null {
    const children = this.getChildren(ancestorId);
    
    for (const child of children) {
      if (child === descendantId) {
        return child;
      }
      if (this.getDescendants(child).includes(descendantId)) {
        return child;
      }
    }
    
    return null;
  }

  /**
   * Check if source can control target
   */
  canControl(sourceId: string, targetId: string): boolean {
    return this.checkPermission(sourceId, targetId, "control").allowed;
  }

  /**
   * Check if source can delegate to target
   */
  canDelegate(sourceId: string, targetId: string): boolean {
    return this.checkPermission(sourceId, targetId, "delegate").allowed;
  }

  /**
   * Check if source can message target
   */
  canMessage(sourceId: string, targetId: string): boolean {
    return this.checkPermission(sourceId, targetId, "message").allowed;
  }

  /**
   * Get nodes that a given node can control
   */
  getControllableNodes(nodeId: string): string[] {
    return [...this.nodeIds].filter((id) => this.canControl(nodeId, id) && id !== nodeId);
  }

  /**
   * Get nodes that a given node can delegate to
   */
  getDelegatableNodes(nodeId: string): string[] {
    return [...this.nodeIds].filter((id) => this.canDelegate(nodeId, id) && id !== nodeId);
  }

  /**
   * Get nodes that a given node can message
   */
  getMessageableNodes(nodeId: string): string[] {
    return [...this.nodeIds].filter((id) => this.canMessage(nodeId, id) && id !== nodeId);
  }

  /**
   * Get root nodes (nodes with no parent)
   */
  getRoots(): string[] {
    return [...this.nodeIds].filter((id) => this.getParent(id) === null);
  }

  /**
   * Get leaf nodes (nodes with no children)
   */
  getLeaves(): string[] {
    return [...this.nodeIds].filter((id) => this.getChildren(id).length === 0);
  }

  /**
   * Export topology as a tree structure for visualization
   */
  toTree(): TreeNode[] {
    const roots = this.getRoots();
    
    const buildTree = (nodeId: string): TreeNode => {
      const children = this.getChildren(nodeId);
      return {
        id: nodeId,
        children: children.map(buildTree),
      };
    };

    return roots.map(buildTree);
  }
}

interface TreeNode {
  id: string;
  children: TreeNode[];
}
