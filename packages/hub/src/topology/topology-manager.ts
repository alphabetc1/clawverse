import type { Topology, ClawVerseConfig } from "../types/config.js";
import { createLogger } from "../logger.js";

const log = createLogger("topology");

export interface TopologyNode {
  id: string;
  parent?: string;
  children: string[];
  depth: number;
  isRoot: boolean;
  isLeaf: boolean;
}

export class TopologyManager {
  private topology: Topology;
  private nodeMap: Map<string, TopologyNode> = new Map();
  private rootId?: string;

  constructor(config: ClawVerseConfig) {
    this.topology = config.topology;
    this.buildTopology(Object.keys(config.nodes));
  }

  /**
   * Build the topology tree from configuration
   */
  private buildTopology(nodeIds: string[]): void {
    if (this.topology.type === "flat") {
      // Flat topology: all nodes are peers at the same level
      for (const id of nodeIds) {
        this.nodeMap.set(id, {
          id,
          children: [],
          depth: 0,
          isRoot: true,
          isLeaf: true,
        });
      }
      log.info(`Built flat topology with ${nodeIds.length} peer nodes`);
      return;
    }

    // Tree topology
    if (!this.topology.root) {
      throw new Error("Tree topology requires a root node");
    }

    this.rootId = this.topology.root;
    const children = this.topology.children || {};

    // Build parent-child relationships
    const parentMap = new Map<string, string>();
    for (const [parent, childList] of Object.entries(children)) {
      for (const child of childList) {
        if (parentMap.has(child)) {
          throw new Error(`Node ${child} has multiple parents`);
        }
        parentMap.set(child, parent);
      }
    }

    // Create node entries with depth calculation
    const calculateDepth = (nodeId: string): number => {
      const parent = parentMap.get(nodeId);
      if (!parent) return 0;
      return calculateDepth(parent) + 1;
    };

    for (const id of nodeIds) {
      const parent = parentMap.get(id);
      const nodeChildren = children[id] || [];
      const depth = calculateDepth(id);

      this.nodeMap.set(id, {
        id,
        parent,
        children: nodeChildren,
        depth,
        isRoot: id === this.rootId,
        isLeaf: nodeChildren.length === 0,
      });
    }

    // Validate tree structure
    this.validateTree();

    log.info(`Built tree topology with root=${this.rootId}, ${nodeIds.length} total nodes`);
  }

  /**
   * Validate tree topology structure
   */
  private validateTree(): void {
    if (!this.rootId || !this.nodeMap.has(this.rootId)) {
      throw new Error(`Root node ${this.rootId} not found in node list`);
    }

    // Check for orphan nodes (not root and no parent)
    for (const [id, node] of this.nodeMap) {
      if (!node.isRoot && !node.parent) {
        log.warn(`Node ${id} is orphaned (not root and no parent)`);
      }
    }

    // Check for cycles (shouldn't happen with our construction but good to verify)
    for (const [id] of this.nodeMap) {
      const visited = new Set<string>();
      let current: string | undefined = id;
      while (current) {
        if (visited.has(current)) {
          throw new Error(`Cycle detected in topology involving node ${id}`);
        }
        visited.add(current);
        current = this.nodeMap.get(current)?.parent;
      }
    }
  }

  /**
   * Get topology type
   */
  getType(): "flat" | "tree" {
    return this.topology.type;
  }

  /**
   * Get root node ID (for tree topology)
   */
  getRoot(): string | undefined {
    return this.rootId;
  }

  /**
   * Get topology node info
   */
  getNode(nodeId: string): TopologyNode | undefined {
    return this.nodeMap.get(nodeId);
  }

  /**
   * Get all nodes
   */
  getAllNodes(): TopologyNode[] {
    return Array.from(this.nodeMap.values());
  }

  /**
   * Get parent node ID
   */
  getParent(nodeId: string): string | undefined {
    return this.nodeMap.get(nodeId)?.parent;
  }

  /**
   * Get children node IDs
   */
  getChildren(nodeId: string): string[] {
    return this.nodeMap.get(nodeId)?.children || [];
  }

  /**
   * Get all ancestors of a node (from immediate parent to root)
   */
  getAncestors(nodeId: string): string[] {
    const ancestors: string[] = [];
    let current = this.nodeMap.get(nodeId)?.parent;

    while (current) {
      ancestors.push(current);
      current = this.nodeMap.get(current)?.parent;
    }

    return ancestors;
  }

  /**
   * Get all descendants of a node (BFS order)
   */
  getDescendants(nodeId: string): string[] {
    const descendants: string[] = [];
    const queue = [...(this.nodeMap.get(nodeId)?.children || [])];

    while (queue.length > 0) {
      const current = queue.shift()!;
      descendants.push(current);
      const children = this.nodeMap.get(current)?.children || [];
      queue.push(...children);
    }

    return descendants;
  }

  /**
   * Get siblings of a node (nodes with same parent)
   */
  getSiblings(nodeId: string): string[] {
    const node = this.nodeMap.get(nodeId);
    if (!node) return [];

    if (this.topology.type === "flat") {
      // In flat topology, all other nodes are siblings
      return Array.from(this.nodeMap.keys()).filter((id) => id !== nodeId);
    }

    if (!node.parent) {
      // Root has no siblings
      return [];
    }

    const parent = this.nodeMap.get(node.parent);
    return (parent?.children || []).filter((id) => id !== nodeId);
  }

  /**
   * Get the next node in escalation path
   */
  getEscalationTarget(nodeId: string): string | undefined {
    if (this.topology.type === "flat") {
      // In flat topology, no escalation path
      return undefined;
    }

    return this.getParent(nodeId);
  }

  /**
   * Check if nodeA is an ancestor of nodeB
   */
  isAncestor(nodeA: string, nodeB: string): boolean {
    return this.getAncestors(nodeB).includes(nodeA);
  }

  /**
   * Check if nodeA is a descendant of nodeB
   */
  isDescendant(nodeA: string, nodeB: string): boolean {
    return this.getDescendants(nodeB).includes(nodeA);
  }

  /**
   * Get node depth in the tree
   */
  getDepth(nodeId: string): number {
    return this.nodeMap.get(nodeId)?.depth ?? -1;
  }

  /**
   * Get all leaf nodes
   */
  getLeafNodes(): string[] {
    return Array.from(this.nodeMap.values())
      .filter((n) => n.isLeaf)
      .map((n) => n.id);
  }

  /**
   * Get nodes at a specific depth
   */
  getNodesAtDepth(depth: number): string[] {
    return Array.from(this.nodeMap.values())
      .filter((n) => n.depth === depth)
      .map((n) => n.id);
  }

  /**
   * Find common ancestor of two nodes
   */
  findCommonAncestor(nodeA: string, nodeB: string): string | undefined {
    if (this.topology.type === "flat") {
      return undefined;
    }

    const ancestorsA = new Set([nodeA, ...this.getAncestors(nodeA)]);

    let current: string | undefined = nodeB;
    while (current) {
      if (ancestorsA.has(current)) {
        return current;
      }
      current = this.getParent(current);
    }

    return undefined;
  }

  /**
   * Get a visual representation of the topology
   */
  toTree(): string {
    if (this.topology.type === "flat") {
      const nodes = Array.from(this.nodeMap.keys());
      return `[Flat] ${nodes.join(", ")}`;
    }

    const lines: string[] = [];

    const printNode = (nodeId: string, prefix: string, isLast: boolean) => {
      const connector = isLast ? "└── " : "├── ";
      lines.push(`${prefix}${connector}${nodeId}`);

      const children = this.getChildren(nodeId);
      const childPrefix = prefix + (isLast ? "    " : "│   ");

      children.forEach((child, index) => {
        printNode(child, childPrefix, index === children.length - 1);
      });
    };

    if (this.rootId) {
      lines.push(this.rootId);
      const children = this.getChildren(this.rootId);
      children.forEach((child, index) => {
        printNode(child, "", index === children.length - 1);
      });
    }

    return lines.join("\n");
  }
}
