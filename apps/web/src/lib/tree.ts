/**
 * Helpers for lists that nest (venues and their spaces, storage locations):
 * build a tree from `parentId`s, narrow it while keeping each match's
 * ancestors, and work out which rows are on screen given the expanded set.
 * Rows render with `TreeRowLeading` (`components/tree-row.tsx`).
 */

export type TreeRecord = { _id: string; parentId?: string | null };

export type TreeNode<T> = { item: T; children: TreeNode<T>[] };

/** Nest rows under their parents (orphans become roots), sorting each level with `compare`. */
export function buildTree<T extends TreeRecord>(rows: T[], compare: (a: T, b: T) => number): TreeNode<T>[] {
  const byId = new Map<string, TreeNode<T>>();
  for (const item of rows) byId.set(item._id, { item, children: [] });

  const roots: TreeNode<T>[] = [];
  for (const item of rows) {
    const node = byId.get(item._id)!;
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortRecursive = (nodes: TreeNode<T>[]) => {
    nodes.sort((a, b) => compare(a.item, b.item));
    for (const node of nodes) sortRecursive(node.children);
  };
  sortRecursive(roots);
  return roots;
}

/** Keep a node if it matches, or any descendant matches (so its path stays visible). */
export function filterTree<T>(nodes: TreeNode<T>[], matches: (item: T) => boolean): TreeNode<T>[] {
  const filtered: TreeNode<T>[] = [];
  for (const node of nodes) {
    const children = filterTree(node.children, matches);
    if (matches(node.item) || children.length > 0) filtered.push({ item: node.item, children });
  }
  return filtered;
}

/** Ids of the rows on screen: every root, plus the children of expanded nodes. */
export function flattenVisibleIds<T extends TreeRecord>(nodes: TreeNode<T>[], expandedIds: Set<string>): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    ids.push(node.item._id);
    if (node.children.length > 0 && expandedIds.has(node.item._id)) {
      ids.push(...flattenVisibleIds(node.children, expandedIds));
    }
  }
  return ids;
}

export function countDescendants<T>(node: TreeNode<T>): number {
  let n = node.children.length;
  for (const child of node.children) n += countDescendants(child);
  return n;
}

/** Ids of every node with children: the "expand all" set. */
export function collectParentIds<T extends TreeRecord>(nodes: TreeNode<T>[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: TreeNode<T>[]) => {
    for (const node of list) {
      if (node.children.length > 0) {
        ids.add(node.item._id);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return ids;
}
