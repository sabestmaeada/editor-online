import type { OutlineNode } from "@/lib/types";

/**
 * Tree utilities for the outline editor.
 *
 * The editor stores its working state as a FLAT list with `depth` and
 * `parentId` annotations — dnd-kit Sortable works on flat arrays, and
 * flat is also what makes the drag-projection math tractable. We
 * round-trip to the nested OutlineNode tree at the boundaries
 * (load from API / save to API).
 */

export type FlatTreeItem = {
  id: string;
  type: OutlineNode["type"];
  text: string;
  depth: number;
  parentId: string | null;
  /** Whether this node has children — for collapse rendering and to
   *  short-circuit subtree moves. We don't track children separately
   *  in the flat list; the flag is recomputed each flatten. */
  hasChildren: boolean;
};

/** Recursively walk the tree, emitting one FlatTreeItem per node in
 *  document order. Depth = parent depth + 1; roots are depth 0. */
export function flattenTree(
  nodes: OutlineNode[],
  parentId: string | null = null,
  depth = 0,
): FlatTreeItem[] {
  const out: FlatTreeItem[] = [];
  for (const n of nodes) {
    out.push({
      id: n.id,
      type: n.type,
      text: n.text,
      depth,
      parentId,
      hasChildren: n.children.length > 0,
    });
    if (n.children.length > 0) {
      out.push(...flattenTree(n.children, n.id, depth + 1));
    }
  }
  return out;
}

/** Inverse of flattenTree. Walks the flat list in order and uses
 *  parentId references to assemble a nested OutlineNode tree. Items
 *  whose parentId points to nothing (id not present) end up as roots
 *  — defensive, shouldn't happen in practice. */
export function buildTree(items: FlatTreeItem[]): OutlineNode[] {
  // Map id → fresh OutlineNode (no children yet)
  const nodeById = new Map<string, OutlineNode>();
  for (const it of items) {
    nodeById.set(it.id, {
      id: it.id,
      type: it.type,
      text: it.text,
      children: [],
    });
  }
  // Walk in order, attaching each to its parent (or root if no parent)
  const roots: OutlineNode[] = [];
  for (const it of items) {
    const node = nodeById.get(it.id)!;
    if (it.parentId && nodeById.has(it.parentId)) {
      nodeById.get(it.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Find the flat item that's the parent of `id`, or null. */
export function findParent(
  items: FlatTreeItem[],
  id: string,
): FlatTreeItem | null {
  const item = items.find((i) => i.id === id);
  if (!item || !item.parentId) return null;
  return items.find((i) => i.id === item.parentId) ?? null;
}

/** Return all ids that are descendants of `id` (children, grandchildren,
 *  ...). Used to "collapse" a subtree during drag so the dragged subtree
 *  moves as a unit. */
export function getDescendantIds(
  items: FlatTreeItem[],
  id: string,
): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const it of items) {
      if (it.parentId === current) {
        out.add(it.id);
        stack.push(it.id);
      }
    }
  }
  return out;
}

/**
 * Compute the projected drop position of an active drag.
 *
 * Inputs:
 *   - `items`: the flat list AFTER hypothetically moving `activeId` to
 *     the slot just before `overId` (caller does the swap with
 *     dnd-kit's arrayMove before calling us)
 *   - `activeId` / `overId`: the dragged item and the item being
 *     hovered over
 *   - `dragOffset`: horizontal cursor offset in pixels from the start
 *     of the drag (positive = right = deeper)
 *   - `indentWidth`: pixels per depth level
 *
 * Output: the new `depth` and `parentId` for the dragged item.
 *
 * The depth is clamped to [minDepth, maxDepth] where:
 *   - maxDepth = depth of the item immediately above + 1 (can be its
 *     child) OR same depth (sibling)
 *   - minDepth = depth of the item immediately below (must be at
 *     least as deep as the next sibling, otherwise the next item
 *     would become OUR child accidentally)
 *
 * Pattern adapted from the dnd-kit sortable-tree story.
 */
export function getProjection(
  items: FlatTreeItem[],
  activeId: string,
  overId: string,
  dragOffset: number,
  indentWidth: number,
): { depth: number; parentId: string | null } | null {
  const overItemIndex = items.findIndex((i) => i.id === overId);
  const activeItemIndex = items.findIndex((i) => i.id === activeId);
  if (overItemIndex === -1 || activeItemIndex === -1) return null;

  const activeItem = items[activeItemIndex];
  const newItems = arrayMove(items, activeItemIndex, overItemIndex);

  const previousItem = newItems[overItemIndex - 1];
  const nextItem = newItems[overItemIndex + 1];

  const dragDepth = Math.round(dragOffset / indentWidth);
  const projectedDepth = activeItem.depth + dragDepth;

  const maxDepth = previousItem ? previousItem.depth + 1 : 0;
  const minDepth = nextItem ? nextItem.depth : 0;

  let depth = projectedDepth;
  if (projectedDepth >= maxDepth) depth = maxDepth;
  else if (projectedDepth < minDepth) depth = minDepth;

  // parentId is the nearest preceding item at (depth - 1)
  let parentId: string | null = null;
  if (depth > 0) {
    for (let i = overItemIndex - 1; i >= 0; i--) {
      const candidate = newItems[i];
      if (candidate.depth === depth - 1) {
        parentId = candidate.id;
        break;
      }
      if (candidate.depth < depth - 1) break;
    }
  }

  return { depth, parentId };
}

/** Move `from` index to `to` index, returning a new array. dnd-kit's
 *  arrayMove utility is equivalent — kept in-house so this file has
 *  no dnd-kit import (it's pure logic; the React component does the
 *  dnd-kit wiring). */
export function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const out = arr.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}
