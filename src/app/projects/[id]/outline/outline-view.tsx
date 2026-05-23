"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { OutlineNode, OutlineNodeType } from "@/lib/types";
import {
  buildTree,
  flattenTree,
  getDescendantIds,
  getProjection,
  type FlatTreeItem,
} from "./tree-utils";

type Props = {
  projectId: string;
  /** Nodes only — full Outline can't cross the Server→Client boundary
   *  because Firestore Timestamp fields (createdAt/updatedAt) are class
   *  instances that React's RSC serialiser rejects. The header on the
   *  server page already renders timestamps + status; the editor only
   *  needs the tree itself. */
  initialNodes: OutlineNode[];
  canEdit: boolean;
};

// Pixels per depth level — must match the CSS padding-left applied
// per-depth below (depth * INDENT_PX).
const INDENT_PX = 28;

/**
 * Outline editor with drag-drop tree.
 *
 * The user-facing model is a flat list with depth indentation — easier
 * to grok than a deeply-nested tree, and dnd-kit's sortable works on
 * flat arrays anyway. We round-trip through `flattenTree` /
 * `buildTree` (see tree-utils.ts) only at the boundaries (load from
 * API → flat working state → save → server).
 *
 * Drag mechanics:
 *   - Vertical drag = reorder (cursor Y determines insertion slot)
 *   - Horizontal drag = re-parent (cursor X relative to drag start
 *     determines depth → parent becomes the nearest preceding item at
 *     depth-1)
 *   - During drag, the dragged subtree is "collapsed" — only the
 *     parent row shows; descendants follow on commit.
 *
 * Promote / demote / delete / add-child remain as button affordances
 * for users who prefer keyboard/click — they manipulate the same flat
 * state.
 */
export function OutlineView({ projectId, initialNodes, canEdit }: Props) {
  // Working state is FLAT. We only build a tree when saving.
  const [items, setItems] = useState<FlatTreeItem[]>(() =>
    flattenTree(initialNodes),
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Drag state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);

  // dnd-kit sensors. PointerSensor needs a small activation distance
  // so a click on the text input doesn't accidentally start a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Visible items: hide descendants of the currently-dragged subtree
  // so it moves as a unit. We still need the FULL list inside dnd-kit
  // for projection math.
  const collapsedIds = useMemo<Set<string>>(
    () => (activeId ? getDescendantIds(items, activeId) : new Set()),
    [activeId, items],
  );
  const visibleItems = useMemo(
    () => items.filter((i) => !collapsedIds.has(i.id)),
    [items, collapsedIds],
  );

  // Live projection of where the dragged item will land
  const projection = useMemo(() => {
    if (!activeId || !overId) return null;
    return getProjection(visibleItems, activeId, overId, dragOffsetX, INDENT_PX);
  }, [activeId, overId, dragOffsetX, visibleItems]);

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setOverId(String(e.active.id));
    setDragOffsetX(0);
  }

  function handleDragMove(e: DragMoveEvent) {
    setDragOffsetX(e.delta.x);
  }

  function handleDragOver(e: DragOverEvent) {
    setOverId(e.over ? String(e.over.id) : null);
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    setOverId(null);
    if (!e.over || !projection) return;

    // Apply the move: reorder in flat list + apply new depth/parentId
    // to the dragged subtree.
    const activeIdx = items.findIndex((i) => i.id === String(e.active.id));
    const overIdx = items.findIndex((i) => i.id === String(e.over!.id));
    if (activeIdx === -1 || overIdx === -1) return;

    const next = arrayMove(items, activeIdx, overIdx);

    // Apply new depth/parentId to the active item, then shift its
    // descendants by the depth delta so the subtree shape is preserved.
    const oldDepth = items[activeIdx].depth;
    const depthDelta = projection.depth - oldDepth;

    const desc = getDescendantIds(items, String(e.active.id));
    const movedIdx = next.findIndex((i) => i.id === String(e.active.id));
    const updated = next.map((it) => {
      if (it.id === String(e.active.id)) {
        return { ...it, depth: projection.depth, parentId: projection.parentId };
      }
      if (desc.has(it.id)) {
        return { ...it, depth: it.depth + depthDelta };
      }
      // Items that were children of the active item via parentId stay
      // pointing at the active id — depth update above keeps the
      // hierarchy visually consistent.
      return it;
    });

    // After all depth shifts, recompute parentId for moved descendants
    // based on the new contiguous block. This keeps parentId correct
    // when the depthDelta changed.
    const finalItems = recomputeParents(updated, movedIdx, desc);

    setItems(finalItems);
    setDirty(true);
  }

  function handleDragCancel() {
    setActiveId(null);
    setOverId(null);
  }

  /* ─── Imperative ops (buttons) ─── */

  function updateText(id: string, text: string) {
    setItems((curr) => curr.map((it) => (it.id === id ? { ...it, text } : it)));
    setDirty(true);
  }

  function updateType(id: string, type: OutlineNodeType) {
    setItems((curr) => curr.map((it) => (it.id === id ? { ...it, type } : it)));
    setDirty(true);
  }

  function deleteItem(id: string) {
    const desc = getDescendantIds(items, id);
    setItems((curr) => curr.filter((it) => it.id !== id && !desc.has(it.id)));
    setDirty(true);
  }

  function addChild(parentId: string) {
    const parent = items.find((i) => i.id === parentId);
    if (!parent) return;
    const newId = makeId();
    const childType: OutlineNodeType = demoteType(parent.type);
    const newItem: FlatTreeItem = {
      id: newId,
      type: childType,
      text: "",
      depth: parent.depth + 1,
      parentId: parent.id,
      hasChildren: false,
    };
    // Insert after the parent + any existing descendants of parent
    const parentIdx = items.findIndex((i) => i.id === parentId);
    const desc = getDescendantIds(items, parentId);
    // Find insertion point: after the last descendant of parent (or
    // just after parent if no descendants)
    let insertAt = parentIdx + 1;
    while (insertAt < items.length && desc.has(items[insertAt].id)) {
      insertAt++;
    }
    setItems((curr) => {
      const next = curr.slice();
      next.splice(insertAt, 0, newItem);
      return next.map((it) =>
        it.id === parentId ? { ...it, hasChildren: true } : it,
      );
    });
    setDirty(true);
  }

  function addRootChapter() {
    setItems((curr) => [
      ...curr,
      {
        id: makeId(),
        type: "chapter",
        text: "บทใหม่",
        depth: 0,
        parentId: null,
        hasChildren: false,
      },
    ]);
    setDirty(true);
  }

  /* ─── Save ─── */

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const nodes: OutlineNode[] = buildTree(items);
      const res = await fetch(`/api/projects/${projectId}/outline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(
          (body as { error?: string }).error ||
            `บันทึกไม่สำเร็จ (HTTP ${res.status})`,
        );
        return;
      }
      setDirty(false);
      setMessage("บันทึกแล้ว ✓");
      setTimeout(() => setMessage(null), 2000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "เครือข่ายมีปัญหา");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          {items.length === 0 ? (
            <span>ไม่มีโหนดในเค้าโครงนี้</span>
          ) : (
            <span>
              {items.length} โหนดทั้งหมด ·{" "}
              {items.filter((i) => i.depth === 0).length} บท
            </span>
          )}
          {dirty && (
            <span
              className="ml-3 inline-block size-2 rounded-full bg-amber-500"
              title="มีการแก้ไขที่ยังไม่ได้บันทึก"
            />
          )}
        </div>
        <div className="flex items-center gap-3">
          {message && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">
              {message}
            </span>
          )}
          {canEdit && (
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {saving ? "กำลังบันทึก…" : dirty ? "บันทึก" : "บันทึกแล้ว"}
            </button>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={visibleItems.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-1" role="tree">
            {visibleItems.map((it) => {
              const isActive = activeId === it.id;
              const displayDepth =
                isActive && projection ? projection.depth : it.depth;
              return (
                <SortableRow
                  key={it.id}
                  item={it}
                  depth={displayDepth}
                  canEdit={canEdit}
                  onTextChange={(t) => updateText(it.id, t)}
                  onPromote={() => updateType(it.id, promoteType(it.type))}
                  onDemote={() => updateType(it.id, demoteType(it.type))}
                  onDelete={() => deleteItem(it.id)}
                  onAddChild={() => addChild(it.id)}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>

      {canEdit && (
        <div className="mt-4">
          <button
            onClick={addRootChapter}
            className="rounded-md border border-dashed border-zinc-300 px-4 py-2 text-sm text-zinc-600 transition-colors hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100"
          >
            + เพิ่มบทใหม่
          </button>
        </div>
      )}
    </div>
  );
}

/* ──────────────────── Sortable row component ──────────────────── */

type RowProps = {
  item: FlatTreeItem;
  depth: number;
  canEdit: boolean;
  onTextChange: (text: string) => void;
  onPromote: () => void;
  onDemote: () => void;
  onDelete: () => void;
  onAddChild: () => void;
};

function SortableRow({
  item,
  depth,
  canEdit,
  onTextChange,
  onPromote,
  onDemote,
  onDelete,
  onAddChild,
}: RowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    paddingLeft: `${depth * INDENT_PX}px`,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-900"
    >
      <div className="flex items-start gap-2 px-2 py-1">
        {canEdit ? (
          <button
            {...attributes}
            {...listeners}
            type="button"
            className="mt-1 shrink-0 cursor-grab touch-none rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 active:cursor-grabbing dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title="ลากเพื่อจัดลำดับ"
            aria-label="Drag handle"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="9" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" />
              <circle cx="15" cy="6" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="15" cy="18" r="1.5" />
            </svg>
          </button>
        ) : (
          <span className="size-6" aria-hidden />
        )}

        <TypeBadge type={item.type} />

        <input
          type="text"
          value={item.text}
          onChange={(e) => onTextChange(e.target.value)}
          disabled={!canEdit}
          className={
            "flex-1 border-b border-transparent bg-transparent px-1 text-sm focus:border-zinc-300 focus:outline-none dark:focus:border-zinc-600 " +
            typeTextClass(item.type)
          }
          placeholder="ใส่ข้อความ…"
        />

        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              onClick={onPromote}
              title="ยกระดับ (chapter→h2→h3→h4→p)"
              disabled={item.type === "chapter"}
            >
              ⇧
            </IconButton>
            <IconButton
              onClick={onDemote}
              title="ลดระดับ"
              disabled={item.type === "p"}
            >
              ⇩
            </IconButton>
            <IconButton onClick={onAddChild} title="เพิ่มลูก">
              +
            </IconButton>
            <IconButton onClick={onDelete} title="ลบ" danger>
              ×
            </IconButton>
          </div>
        )}
      </div>
    </li>
  );
}

/* ──────────────────── small components ──────────────────── */

function TypeBadge({ type }: { type: OutlineNodeType }) {
  const label =
    type === "chapter"
      ? "📖 บท"
      : type === "h2"
        ? "H2"
        : type === "h3"
          ? "H3"
          : type === "h4"
            ? "H4"
            : "¶";
  const color =
    type === "chapter"
      ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
      : type === "p"
        ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
        : "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300";
  return (
    <span
      className={
        "mt-1 inline-block min-w-12 shrink-0 rounded px-2 py-0.5 text-center text-xs font-medium " +
        color
      }
    >
      {label}
    </span>
  );
}

function IconButton({
  onClick,
  title,
  children,
  disabled,
  danger,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={
        "size-7 rounded text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30 " +
        (danger
          ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
          : "text-zinc-600 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800")
      }
    >
      {children}
    </button>
  );
}

/* ──────────────────── helpers ──────────────────── */

const TYPE_ORDER: OutlineNodeType[] = ["chapter", "h2", "h3", "h4", "p"];

function promoteType(t: OutlineNodeType): OutlineNodeType {
  const i = TYPE_ORDER.indexOf(t);
  return i > 0 ? TYPE_ORDER[i - 1] : t;
}
function demoteType(t: OutlineNodeType): OutlineNodeType {
  const i = TYPE_ORDER.indexOf(t);
  return i >= 0 && i < TYPE_ORDER.length - 1 ? TYPE_ORDER[i + 1] : t;
}

function typeTextClass(t: OutlineNodeType): string {
  switch (t) {
    case "chapter":
      return "font-semibold text-zinc-900 dark:text-zinc-100";
    case "h2":
      return "font-medium text-zinc-800 dark:text-zinc-200";
    case "h3":
      return "text-zinc-700 dark:text-zinc-300";
    case "h4":
      return "text-zinc-600 dark:text-zinc-400";
    case "p":
      return "text-zinc-500 italic dark:text-zinc-400";
  }
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `n-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * After a drag finishes and depths have been shifted, walk the
 * dragged subtree and rebind each item's parentId to the nearest
 * preceding item at depth-1. Without this step, the dragged subtree's
 * children still point at their old parent ids — the depths look right
 * but `buildTree` would lose the hierarchy on save.
 */
function recomputeParents(
  items: FlatTreeItem[],
  movedIdx: number,
  descendantIds: Set<string>,
): FlatTreeItem[] {
  const out = items.slice();
  // The active item itself was assigned a parentId by getProjection,
  // so we only need to rebind its descendants here.
  for (let i = movedIdx + 1; i < out.length; i++) {
    const it = out[i];
    if (!descendantIds.has(it.id)) {
      // We've walked past the dragged subtree
      if (it.depth <= out[movedIdx].depth) break;
      continue;
    }
    // Find nearest preceding item at depth-1
    let newParentId: string | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (out[j].depth === it.depth - 1) {
        newParentId = out[j].id;
        break;
      }
      if (out[j].depth < it.depth - 1) break;
    }
    if (newParentId !== it.parentId) {
      out[i] = { ...it, parentId: newParentId };
    }
  }
  return out;
}
