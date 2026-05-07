import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { showContextMenu } from "../ContextMenu";
import {
  BaseEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  type FinalConnectionState,
  getBezierPath,
  getStraightPath,
  Handle,
  MarkerType,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useUpdateNodeInternals,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import "@xyflow/react/dist/style.css";
import type { DialogSequence, Npc } from "@bleepforge/shared";
import {
  dialogsApi,
  emptyLayout,
  npcsApi,
  type DialogLayout,
  type EdgeStyle,
} from "../api";
import { AssetThumb } from "../AssetThumb";
import { ButtonLink } from "../Button";
import { showConfirm, showPrompt } from "../Modal";
import { useSyncRefresh } from "../sync/useSyncRefresh";
import { useTheme } from "../Theme";
import { useThemeColors, type ThemeColors } from "../themeColors";
import { FolderTabs } from "./FolderTabs";

type SeqNodeData = {
  seq: DialogSequence;
  ghost?: boolean;
  portrait?: string;
  // Resolved current folder (DialogGraphInner stamps it onto each node before
  // setNodes). Lets per-node UI like the right-click menu navigate without
  // re-deriving folder from search params, which is null when the URL is
  // /dialogs without ?folder=.
  folder: string | null;
};
type SeqNode = Node<SeqNodeData, "sequence">;

type ChoiceEdgeData = {
  text: string;
  setsFlag: string;
  dangling: boolean;
  // Path back to the source choice in storage:
  source: string;
  lineIdx: number;
  choiceIdx: number;
  // Visual style (mirrored from layout.edges):
  shape: "curved" | "straight";
  dashed: boolean;
  waypoints: { x: number; y: number }[];
};
type ChoiceEdge = Edge<ChoiceEdgeData, "choice">;

interface EditChoiceTextDetail {
  edgeId: string;
  newText: string;
}
interface EdgeStylePatchDetail {
  edgeId: string;
  patch: Partial<EdgeStyle>;
}

const NODE_WIDTH = 320;
const GHOST_HEIGHT = 60;
const NODE_HEADER = 52;
const NODE_LINE_BASE = 22;
const NODE_LINE_TEXT = 36;
const NODE_CHOICE = 20;
const NODE_LINE_GAP = 8; // matches space-y-2
const NODE_BODY_PAD = 6;
const NODE_PADDING = 14;

// Initial-paint fallback for handle Y positions before useLayoutEffect runs
// the real DOM measurement. Approximate — actual line heights vary with font,
// UI scale, line-clamp, and choices count, all of which differ at runtime.
function lineRowMidYFallback(
  lines: DialogSequence["Lines"],
  idx: number,
): number {
  let y = NODE_HEADER + NODE_BODY_PAD;
  for (let i = 0; i < idx; i++) {
    y += NODE_LINE_BASE + NODE_LINE_TEXT;
    y += lines[i]!.Choices.length * NODE_CHOICE;
    y += NODE_LINE_GAP;
  }
  return y + (NODE_LINE_BASE + NODE_LINE_TEXT) / 2;
}

// Used by dagre for initial auto-layout collision spacing only — once a layout
// position is saved per-node, this estimate stops mattering.
function estimateNodeHeight(seq: DialogSequence): number {
  let h = NODE_HEADER + NODE_PADDING;
  for (const line of seq.Lines) {
    h += NODE_LINE_BASE + NODE_LINE_TEXT;
    h += line.Choices.length * NODE_CHOICE;
  }
  return h;
}

function SequenceNode({ id, data }: NodeProps<SeqNode>) {
  const navigate = useNavigate();
  const folder = data.folder;

  if (data.ghost) {
    return (
      <div
        className="border-2 border-red-800 bg-red-950/40 px-3 py-2 text-xs"
        style={{ width: NODE_WIDTH, boxShadow: "3px 3px 0 0 rgba(0,0,0,0.5)" }}
      >
        <Handle type="target" position={Position.Left} isConnectable={false} />
        <div className="font-mono text-red-300">{data.seq.Id}</div>
        <div className="text-red-500 italic">missing — dangling reference</div>
      </div>
    );
  }

  const seq = data.seq;
  const portrait = data.portrait ?? "";

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    showContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "Edit",
          onClick: () => {
            if (!folder) return;
            navigate(
              `/dialogs/${encodeURIComponent(folder)}/${encodeURIComponent(seq.Id)}`,
            );
          },
          disabled: !folder,
        },
        {
          label: "Copy id",
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(seq.Id);
            } catch {}
          },
        },
      ],
    });
  };
  // If empty, we still render one source handle (anchored to the placeholder
  // text) so the user can drag-to-empty and create the first line.
  const handleCount = Math.max(seq.Lines.length, 1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);
  const updateNodeInternals = useUpdateNodeInternals();

  // Handle Y positions. Initial values are the constant-based fallback so the
  // first paint is approximately right; useLayoutEffect immediately replaces
  // them with measured DOM positions before the user sees anything.
  const [handleTops, setHandleTops] = useState<number[]>(() =>
    Array.from({ length: handleCount }, (_, i) =>
      lineRowMidYFallback(
        seq.Lines.length > 0
          ? seq.Lines
          : [{ SpeakerName: "", Text: "", Portrait: "", Choices: [] }],
        i,
      ),
    ),
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const next = lineRefs.current
        .slice(0, handleCount)
        .map((el) => (el ? el.offsetTop + el.offsetHeight / 2 : 0));
      setHandleTops((prev) => {
        if (
          prev.length === next.length &&
          prev.every((v, i) => v === next[i])
        ) {
          return prev;
        }
        return next;
      });
      // Tell React Flow the handle positions changed so it re-anchors any
      // edges attached to this node.
      updateNodeInternals(id);
    };

    measure();

    // Recompute on font / UI-scale / line-clamp changes — these don't
    // re-trigger React renders by themselves but do change DOM layout.
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    for (const el of lineRefs.current) {
      if (el) ro.observe(el);
    }
    return () => ro.disconnect();
  }, [id, seq.Lines, handleCount, updateNodeInternals]);

  return (
    <div
      ref={containerRef}
      onContextMenu={onContextMenu}
      className="relative flex flex-col border-2 border-neutral-700 bg-neutral-900 text-xs"
      style={{
        width: NODE_WIDTH,
        boxShadow: "3px 3px 0 0 rgba(0,0,0,0.5)",
      }}
    >
      <Handle type="target" position={Position.Left} />

      <header className="flex items-center gap-2 border-b-2 border-neutral-800 px-2 py-1.5">
        <div className="size-10 shrink-0">
          {portrait && <AssetThumb path={portrait} size="sm" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-[13px] text-neutral-100">
            {seq.Id}
          </div>
          {seq.SetsFlag && (
            <div
              className="truncate text-[10px] text-emerald-400"
              title={`Sequence sets flag "${seq.SetsFlag}" when it begins`}
            >
              ⚑ {seq.SetsFlag}
            </div>
          )}
        </div>
      </header>

      <div className="space-y-2 px-2 py-1.5">
        {seq.Lines.length === 0 ? (
          <div
            ref={(el) => {
              lineRefs.current[0] = el;
            }}
            className="text-[10px] italic text-neutral-600"
          >
            No lines yet — drag from the handle to add one.
          </div>
        ) : (
          seq.Lines.map((line, idx) => (
            <div
              key={idx}
              ref={(el) => {
                lineRefs.current[idx] = el;
              }}
              className="space-y-1"
            >
              <div>
                {line.SpeakerName && (
                  <span className="mr-1 italic text-neutral-400">
                    {line.SpeakerName}:
                  </span>
                )}
                <span className="line-clamp-2 inline align-top text-neutral-200">
                  {line.Text || (
                    <span className="italic text-neutral-600">(empty)</span>
                  )}
                </span>
              </div>
              {line.Choices.length > 0 && (
                <ul className="ml-1 space-y-0.5">
                  {line.Choices.map((choice, ci) => (
                    <li
                      key={ci}
                      className="flex items-baseline gap-1 text-[11px]"
                    >
                      <span className="text-neutral-500">→</span>
                      <span className="truncate text-neutral-300">
                        {choice.Text || (
                          <span className="italic text-neutral-600">
                            (no text)
                          </span>
                        )}
                      </span>
                      {choice.SetsFlag && (
                        <span
                          className="shrink-0 text-[10px] text-emerald-400"
                          title={`Choice sets flag "${choice.SetsFlag}" when taken`}
                        >
                          ⚑ {choice.SetsFlag}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        )}
      </div>

      <PerLineHandles tops={handleTops} count={handleCount} />
    </div>
  );
}

function PerLineHandles({
  tops,
  count,
}: {
  tops: number[];
  count: number;
}) {
  const colors = useThemeColors();
  return (
    <>
      {Array.from({ length: count }, (_, idx) => (
        <Handle
          key={idx}
          type="source"
          position={Position.Right}
          id={`line-${idx}`}
          style={{
            top: tops[idx] ?? 0,
            background: colors.accent500,
            width: 10,
            height: 10,
            border: `2px solid ${colors.accent900}`,
            borderRadius: 0,
          }}
        />
      ))}
    </>
  );
}

const nodeTypes = { sequence: SequenceNode };

function polylinePath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  return (
    `M ${first!.x} ${first!.y}` + rest.map((p) => ` L ${p.x} ${p.y}`).join("")
  );
}

// Catmull-Rom-to-Bezier through the given points (smooth curve, passes through all of them).
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0]!.x} ${points[0]!.y} L ${points[1]!.x} ${points[1]!.y}`;
  }
  const p = [points[0]!, ...points, points[points.length - 1]!];
  let d = `M ${p[1]!.x} ${p[1]!.y}`;
  for (let i = 1; i < p.length - 2; i++) {
    const p0 = p[i - 1]!;
    const p1 = p[i]!;
    const p2 = p[i + 1]!;
    const p3 = p[i + 2]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

function distToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) {
    const ddx = p.x - a.x;
    const ddy = p.y - a.y;
    return Math.hypot(ddx, ddy);
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(p.x - proj.x, p.y - proj.y);
}

// Insert a new waypoint into `waypoints` at the index whose corresponding path
// segment is closest to `point`, so traversal order stays sensible.
function insertWaypointInOrder(
  waypoints: { x: number; y: number }[],
  source: { x: number; y: number },
  target: { x: number; y: number },
  point: { x: number; y: number },
): { x: number; y: number }[] {
  const all = [source, ...waypoints, target];
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < all.length - 1; i++) {
    const d = distToSegment(point, all[i]!, all[i + 1]!);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return [
    ...waypoints.slice(0, bestIdx),
    point,
    ...waypoints.slice(bestIdx),
  ];
}

function dispatchEdgeStyle(edgeId: string, patch: Partial<EdgeStyle>) {
  window.dispatchEvent(
    new CustomEvent<EdgeStylePatchDetail>("bleepforge:edge-style", {
      detail: { edgeId, patch },
    }),
  );
}

function ChoiceEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
}: EdgeProps<ChoiceEdge>) {
  const reactFlow = useReactFlow();
  const colors = useThemeColors();
  const shape = data?.shape ?? "curved";
  const dashed = data?.dashed ?? false;
  const waypoints = data?.waypoints ?? [];
  const dangling = data?.dangling ?? false;

  // Local working copy of waypoints for instant feedback during drag.
  const [localWaypoints, setLocalWaypoints] = useState(waypoints);
  useEffect(() => {
    setLocalWaypoints(waypoints);
  }, [JSON.stringify(waypoints)]);

  // Inline label editing state.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data?.text ?? "");
  useEffect(() => {
    setDraft(data?.text ?? "");
  }, [data?.text]);

  // Compute the path and label position.
  const allPoints = [
    { x: sourceX, y: sourceY },
    ...localWaypoints,
    { x: targetX, y: targetY },
  ];
  let path: string;
  let labelX: number;
  let labelY: number;
  if (localWaypoints.length === 0) {
    if (shape === "straight") {
      const [p, lx, ly] = getStraightPath({ sourceX, sourceY, targetX, targetY });
      path = p;
      labelX = lx;
      labelY = ly;
    } else {
      const [p, lx, ly] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
      });
      path = p;
      labelX = lx;
      labelY = ly;
    }
  } else {
    path = shape === "straight" ? polylinePath(allPoints) : smoothPath(allPoints);
    const mid = localWaypoints[Math.floor((localWaypoints.length - 1) / 2)]!;
    labelX = mid.x;
    labelY = mid.y;
  }

  const strokeColor = dangling ? colors.danger600 : colors.neutral500;
  const dashArray = dashed || dangling ? "6 4" : undefined;
  const baseStyle: React.CSSProperties = {
    stroke: strokeColor,
    strokeWidth: 2,
    fill: "none",
    ...(dashArray ? { strokeDasharray: dashArray } : {}),
  };

  const addWaypointAt = (point: { x: number; y: number }) => {
    const next = insertWaypointInOrder(
      localWaypoints,
      { x: sourceX, y: sourceY },
      { x: targetX, y: targetY },
      point,
    );
    setLocalWaypoints(next);
    dispatchEdgeStyle(id, { waypoints: next });
  };

  // Double-click on the edge path (not label, not waypoint) → add waypoint at click position.
  const onPathDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const pos = reactFlow.screenToFlowPosition({
      x: e.clientX,
      y: e.clientY,
    });
    addWaypointAt(pos);
  };

  // Pointer-down on a waypoint → start drag.
  // Note: we DON'T call preventDefault — that would suppress the click/dblclick
  // events the browser generates from the pointer interaction, breaking the
  // "double-click to remove" affordance.
  const startWaypointDrag = (e: React.PointerEvent<HTMLDivElement>, idx: number) => {
    e.stopPropagation();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const zoom = reactFlow.getZoom();
    let lastX = e.clientX;
    let lastY = e.clientY;

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - lastX) / zoom;
      const dy = (ev.clientY - lastY) / zoom;
      lastX = ev.clientX;
      lastY = ev.clientY;
      setLocalWaypoints((prev) =>
        prev.map((p, i) => (i === idx ? { x: p.x + dx, y: p.y + dy } : p)),
      );
    };
    const onUp = (ev: PointerEvent) => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {}
      // Commit by reading latest state.
      setLocalWaypoints((latest) => {
        dispatchEdgeStyle(id, { waypoints: latest });
        return latest;
      });
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  const removeWaypoint = (idx: number) => {
    const next = localWaypoints.filter((_, i) => i !== idx);
    setLocalWaypoints(next);
    dispatchEdgeStyle(id, { waypoints: next });
  };

  const commitText = () => {
    setEditing(false);
    if (draft === (data?.text ?? "")) return;
    window.dispatchEvent(
      new CustomEvent<EditChoiceTextDetail>("bleepforge:edit-choice-text", {
        detail: { edgeId: id, newText: draft },
      }),
    );
  };

  return (
    <>
      {/* Wrap BaseEdge in <g> so onDoubleClick bubbles up from React Flow's
          built-in interaction path (the wide transparent overlay it renders for
          edge selection). Without this wrap, double-clicks land on the
          interaction path and never reach our handler — so adding waypoints
          appears "broken." */}
      <g onDoubleClick={onPathDoubleClick} style={{ cursor: "copy" }}>
        <BaseEdge id={id} path={path} markerEnd={markerEnd} style={baseStyle} />
      </g>

      <EdgeLabelRenderer>
        {/* Waypoint markers */}
        {localWaypoints.map((wp, idx) => (
          <div
            key={idx}
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${wp.x}px, ${wp.y}px)`,
              pointerEvents: "all",
              cursor: "grab",
            }}
            onPointerDown={(e) => startWaypointDrag(e, idx)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              removeWaypoint(idx);
            }}
            title="Drag to move · Double-click to remove"
          >
            <div className="size-3 border-2 border-neutral-100 bg-emerald-500" />
          </div>
        ))}

        {/* Label + (when selected) inline toolbar */}
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan flex flex-col items-center gap-1"
        >
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitText();
                } else if (e.key === "Escape") {
                  setDraft(data?.text ?? "");
                  setEditing(false);
                }
              }}
              className="border-2 border-emerald-500 bg-neutral-900 px-1 font-mono text-[10px] text-neutral-100 focus:outline-none"
              style={{ minWidth: 80 }}
            />
          ) : (
            <div
              onDoubleClick={() => {
                setDraft(data?.text ?? "");
                setEditing(true);
              }}
              className={`border-2 px-1 font-mono text-[10px] cursor-text ${
                selected
                  ? "border-emerald-500 bg-neutral-900 text-neutral-100"
                  : "border-transparent bg-neutral-900/80 text-neutral-300"
              }`}
              title="Double-click to edit text"
            >
              {data?.text || (
                <span className="italic text-neutral-600">(no text)</span>
              )}
              {data?.setsFlag && (
                <span className="ml-1 text-emerald-400">⚑ {data.setsFlag}</span>
              )}
            </div>
          )}

          {selected && !editing && (
            <div className="flex gap-1 border-2 border-neutral-700 bg-neutral-900 p-0.5 text-[10px]">
              <ToolbarBtn
                active={shape === "curved"}
                onClick={() => dispatchEdgeStyle(id, { shape: "curved" })}
                title="Curved"
              >
                ∿
              </ToolbarBtn>
              <ToolbarBtn
                active={shape === "straight"}
                onClick={() => dispatchEdgeStyle(id, { shape: "straight" })}
                title="Straight"
              >
                —
              </ToolbarBtn>
              <span className="mx-0.5 w-px self-stretch bg-neutral-700" />
              <ToolbarBtn
                active={!dashed}
                onClick={() => dispatchEdgeStyle(id, { dashed: false })}
                title="Solid"
              >
                ▬
              </ToolbarBtn>
              <ToolbarBtn
                active={dashed}
                onClick={() => dispatchEdgeStyle(id, { dashed: true })}
                title="Dashed"
              >
                ╌
              </ToolbarBtn>
              <span className="mx-0.5 w-px self-stretch bg-neutral-700" />
              <ToolbarBtn
                active={false}
                onClick={() => addWaypointAt({ x: labelX, y: labelY })}
                title="Add waypoint at midpoint (or double-click anywhere on the edge)"
              >
                + dot
              </ToolbarBtn>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function ToolbarBtn({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-1.5 py-0.5 transition-colors ${
        active
          ? "bg-emerald-600 text-white"
          : "text-neutral-300 hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

const edgeTypes = { choice: ChoiceEdgeComponent };

function resolvePortrait(
  seq: DialogSequence,
  speakerPortrait: Map<string, string>,
): string {
  const firstLine = seq.Lines[0];
  if (firstLine?.Portrait) return firstLine.Portrait;
  const speaker = firstLine?.SpeakerName;
  if (!speaker) return "";
  return speakerPortrait.get(speaker.toLowerCase()) ?? "";
}

function buildGraph(
  sequences: DialogSequence[],
  layout: DialogLayout,
  speakerPortrait: Map<string, string>,
  colors: ThemeColors,
  folder: string | null,
): { nodes: SeqNode[]; edges: ChoiceEdge[] } {
  const knownIds = new Set(sequences.map((s) => s.Id));

  const nodes: SeqNode[] = sequences.map((seq) => ({
    id: seq.Id,
    type: "sequence",
    data: { seq, portrait: resolvePortrait(seq, speakerPortrait), folder },
    position: { x: 0, y: 0 },
  }));

  const edges: ChoiceEdge[] = [];
  const danglingTargets = new Set<string>();

  for (const seq of sequences) {
    seq.Lines.forEach((line, lineIdx) => {
      line.Choices.forEach((choice, choiceIdx) => {
        if (!choice.NextSequenceId) return;
        const dangling = !knownIds.has(choice.NextSequenceId);
        if (dangling) danglingTargets.add(choice.NextSequenceId);
        const edgeId = `${seq.Id}::${lineIdx}::${choiceIdx}`;
        const style = layout.edges[edgeId];
        edges.push({
          id: edgeId,
          source: seq.Id,
          sourceHandle: `line-${lineIdx}`,
          target: choice.NextSequenceId,
          type: "choice",
          data: {
            text: choice.Text,
            setsFlag: choice.SetsFlag,
            dangling,
            source: seq.Id,
            lineIdx,
            choiceIdx,
            shape: style?.shape ?? "curved",
            dashed: style?.dashed ?? false,
            waypoints: style?.waypoints ?? [],
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: dangling ? colors.danger600 : colors.neutral500,
          },
          interactionWidth: 28,
          selectable: true,
          deletable: true,
        });
      });
    });
  }

  for (const id of danglingTargets) {
    nodes.push({
      id,
      type: "sequence",
      data: { seq: { Id: id, Lines: [], SetsFlag: "" }, ghost: true, folder },
      position: { x: 0, y: 0 },
    });
  }

  const heights = new Map<string, number>();
  for (const n of nodes) {
    const h = (n.data as SeqNodeData).ghost
      ? GHOST_HEIGHT
      : estimateNodeHeight(n.data.seq);
    heights.set(n.id, h);
  }

  // Apply saved layout where available; auto-layout the rest with dagre.
  const missing = nodes.filter((n) => !layout.nodes[n.id]);
  if (missing.length > 0) {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "LR", ranksep: 100, nodesep: 40 });
    g.setDefaultEdgeLabel(() => ({}));
    nodes.forEach((n) =>
      g.setNode(n.id, { width: NODE_WIDTH, height: heights.get(n.id) ?? GHOST_HEIGHT }),
    );
    edges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);
    for (const n of missing) {
      const pos = g.node(n.id);
      const h = heights.get(n.id) ?? GHOST_HEIGHT;
      n.position = { x: pos.x - NODE_WIDTH / 2, y: pos.y - h / 2 };
    }
  }

  for (const n of nodes) {
    const saved = layout.nodes[n.id];
    if (saved) n.position = saved;
  }

  return { nodes, edges };
}

export function DialogGraph() {
  return (
    <ReactFlowProvider>
      <DialogGraphInner />
    </ReactFlowProvider>
  );
}

interface SavedViewport {
  x: number;
  y: number;
  zoom: number;
}
const VIEWPORT_KEY_PREFIX = "bleepforge:graphViewport:";
// Padding for the first-visit fitView. 0.4 leaves a generous margin around
// the bounding box of all sequences — reads as "zoomed out, here's the
// whole map" rather than "tightly cropped to nodes".
const FIT_VIEW_PADDING = 0.4;

function readSavedViewport(folder: string): SavedViewport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VIEWPORT_KEY_PREFIX + folder);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedViewport>;
    if (
      typeof v.x === "number" &&
      typeof v.y === "number" &&
      typeof v.zoom === "number" &&
      Number.isFinite(v.x) &&
      Number.isFinite(v.y) &&
      Number.isFinite(v.zoom)
    ) {
      return { x: v.x, y: v.y, zoom: v.zoom };
    }
  } catch {}
  return null;
}

function writeSavedViewport(folder: string, vp: SavedViewport) {
  try {
    window.localStorage.setItem(
      VIEWPORT_KEY_PREFIX + folder,
      JSON.stringify(vp),
    );
  } catch {}
}

function DialogGraphInner() {
  const [folders, setFolders] = useState<string[] | null>(null);
  const [seqs, setSeqs] = useState<DialogSequence[] | null>(null);
  const [npcs, setNpcs] = useState<Npc[]>([]);
  const [layout, setLayout] = useState<DialogLayout>(emptyLayout());
  const [nodes, setNodes, onNodesChange] = useNodesState<SeqNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ChoiceEdge>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { screenToFlowPosition, setViewport, fitView } = useReactFlow();
  const { theme } = useTheme();
  const themeColors = useThemeColors();

  const seqsRef = useRef<DialogSequence[]>([]);
  useEffect(() => {
    seqsRef.current = seqs ?? [];
  }, [seqs]);

  const folderParam = searchParams.get("folder");
  const folder = folderParam ?? folders?.[0] ?? null;

  const speakerPortrait = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of npcs) {
      const portrait = n.Portrait;
      if (!portrait) continue;
      if (n.DisplayName) m.set(n.DisplayName.toLowerCase(), portrait);
      if (n.NpcId) m.set(n.NpcId.toLowerCase(), portrait);
    }
    return m;
  }, [npcs]);

  useEffect(() => {
    dialogsApi.listFolders().then(setFolders).catch((e) => setError(String(e)));
    npcsApi.list().then(setNpcs).catch(() => {});
  }, []);

  useEffect(() => {
    if (!folder) {
      setSeqs([]);
      setLayout(emptyLayout());
      return;
    }
    setSeqs(null);
    Promise.all([
      dialogsApi.listInFolder(folder),
      dialogsApi.getLayout(folder),
    ])
      .then(([s, l]) => {
        setSeqs(s);
        setLayout(l);
      })
      .catch((e) => setError(String(e)));
  }, [folder]);

  useEffect(() => {
    if (!seqs) return;
    const built = buildGraph(seqs, layout, speakerPortrait, themeColors, folder);
    setNodes(built.nodes);
    setEdges(built.edges);
  }, [seqs, layout, speakerPortrait, themeColors, folder, setNodes, setEdges]);

  // Apply saved viewport (or fitView for first-visit) once nodes are loaded
  // for the current folder. Tracks the last folder we applied for so that
  // node count changes (user creates/deletes a sequence) don't re-trigger.
  const lastAppliedFolderRef = useRef<string | null>(null);
  useEffect(() => {
    if (!folder) return;
    if (nodes.length === 0) return;
    if (lastAppliedFolderRef.current === folder) return;
    lastAppliedFolderRef.current = folder;

    const saved = readSavedViewport(folder);
    if (saved) {
      setViewport(saved, { duration: 0 });
    } else {
      fitView({ padding: FIT_VIEW_PADDING, duration: 0 });
    }
  }, [folder, nodes.length, setViewport, fitView]);

  // Persist viewport on every user pan/zoom. Programmatic setViewport /
  // fitView don't fire onMoveEnd so the auto-fit view isn't saved as if
  // the user had set it.
  const onMoveEnd = useCallback(
    (_event: unknown, viewport: SavedViewport) => {
      if (!folder) return;
      writeSavedViewport(folder, viewport);
    },
    [folder],
  );

  const refetch = useCallback(async () => {
    if (!folder) return;
    const fresh = await dialogsApi.listInFolder(folder);
    setSeqs(fresh);
  }, [folder]);

  // Live-refresh on any dialog change in the current folder (e.g. saved
  // in Godot while the graph is open).
  useSyncRefresh({
    domain: "dialog",
    onChange: (e) => {
      if (!folder) return;
      const [eventFolder] = e.key.split("/");
      if (eventFolder !== folder) return;
      void refetch();
    },
  });

  const onNodeDragStop = useCallback(
    (_e: React.MouseEvent, node: SeqNode) => {
      if (!folder) return;
      const next: DialogLayout = {
        ...layout,
        nodes: { ...layout.nodes, [node.id]: node.position },
      };
      setLayout(next);
      dialogsApi.saveLayout(folder, next).catch((e) => setError(String(e)));
    },
    [folder, layout],
  );

  const appendChoice = useCallback(
    async (
      sourceId: string,
      sourceHandle: string | null | undefined,
      targetId: string,
    ) => {
      if (!folder) return;
      const source = seqsRef.current.find((s) => s.Id === sourceId);
      if (!source) return;

      let lineIdx = source.Lines.length - 1;
      if (sourceHandle) {
        const m = sourceHandle.match(/^line-(\d+)$/);
        if (m) lineIdx = parseInt(m[1]!, 10);
      }
      let lines = source.Lines;
      if (lines.length === 0) {
        lines = [{ SpeakerName: "", Text: "", Portrait: "", Choices: [] }];
        lineIdx = 0;
      }
      if (lineIdx < 0) lineIdx = 0;
      if (lineIdx >= lines.length) lineIdx = lines.length - 1;

      const updatedLines = lines.map((l, i) =>
        i === lineIdx
          ? {
              ...l,
              Choices: [
                ...l.Choices,
                { Text: "", NextSequenceId: targetId, SetsFlag: "" },
              ],
            }
          : l,
      );
      await dialogsApi.save(folder, { ...source, Lines: updatedLines });
    },
    [folder],
  );

  const onConnect = useCallback(
    async (connection: Connection) => {
      if (!folder || !connection.source || !connection.target) return;
      try {
        await appendChoice(
          connection.source,
          connection.sourceHandle,
          connection.target,
        );
        await refetch();
      } catch (e) {
        setError(String(e));
      }
    },
    [folder, appendChoice, refetch],
  );

  // Shared by the drag-to-empty flow and the pane right-click → "Create new"
  // menu. `wireFrom` is set when the new sequence should also be wired as a
  // choice from an existing line (drag-to-empty path); omit it when the user
  // wants a standalone node (right-click path).
  const createSequenceAtCursor = useCallback(
    async (
      clientX: number,
      clientY: number,
      wireFrom?: { nodeId: string; handleId: string | null | undefined },
    ) => {
      if (!folder) return;
      const newId = await showPrompt({
        title: "New dialog sequence",
        message: `Will be created in folder "${folder}".`,
        defaultValue: "new_sequence",
        placeholder: "globally unique sequence id",
        confirmLabel: "Create",
        validate: (v) => {
          const trimmed = v.trim();
          if (!trimmed) return "id is required";
          if (!/^[a-zA-Z0-9_-]+$/.test(trimmed))
            return "letters, digits, _, - only";
          if (seqsRef.current.some((s) => s.Id === trimmed))
            return `"${trimmed}" already exists`;
          return null;
        },
      });
      if (!newId) return;

      const flowPos = screenToFlowPosition({ x: clientX, y: clientY });
      const nodePos = { x: flowPos.x - NODE_WIDTH / 2, y: flowPos.y - 40 };

      try {
        await dialogsApi.save(folder, {
          Id: newId,
          Lines: [{ SpeakerName: "", Text: "", Portrait: "", Choices: [] }],
          SetsFlag: "",
        });
        if (wireFrom) {
          await appendChoice(wireFrom.nodeId, wireFrom.handleId, newId);
        }
        const nextLayout: DialogLayout = {
          ...layout,
          nodes: { ...layout.nodes, [newId]: nodePos },
        };
        setLayout(nextLayout);
        await dialogsApi.saveLayout(folder, nextLayout);
        await refetch();
      } catch (e) {
        setError(String(e));
      }
    },
    [folder, appendChoice, layout, refetch, screenToFlowPosition],
  );

  const onConnectEnd = useCallback(
    async (
      event: MouseEvent | TouchEvent,
      connectionState: FinalConnectionState,
    ) => {
      if (!folder || connectionState.isValid) return;
      const fromNode = connectionState.fromNode;
      if (!fromNode) return;
      const clientX =
        "clientX" in event
          ? event.clientX
          : event.changedTouches?.[0]?.clientX ?? 0;
      const clientY =
        "clientY" in event
          ? event.clientY
          : event.changedTouches?.[0]?.clientY ?? 0;
      await createSequenceAtCursor(clientX, clientY, {
        nodeId: fromNode.id,
        handleId: connectionState.fromHandle?.id,
      });
    },
    [folder, createSequenceAtCursor],
  );

  const onPaneContextMenu = useCallback(
    (event: React.MouseEvent | MouseEvent) => {
      event.preventDefault();
      // Capture coords now — by the time the prompt closes the cursor might
      // have moved, and we want the new node placed where the user clicked.
      const x = event.clientX;
      const y = event.clientY;
      showContextMenu({
        x,
        y,
        items: [
          {
            label: "Create new sequence",
            onClick: () => createSequenceAtCursor(x, y),
            disabled: !folder,
          },
        ],
      });
    },
    [folder, createSequenceAtCursor],
  );

  const onEdgesDelete = useCallback(
    async (deleted: ChoiceEdge[]) => {
      if (!folder || !seqs) return;
      const removalsBySource = new Map<string, Map<number, Set<number>>>();
      for (const e of deleted) {
        const [sourceId, lineStr, choiceStr] = e.id.split("::");
        if (!sourceId) continue;
        const lineIdx = Number(lineStr);
        const choiceIdx = Number(choiceStr);
        if (!Number.isInteger(lineIdx) || !Number.isInteger(choiceIdx)) continue;
        let perLine = removalsBySource.get(sourceId);
        if (!perLine) {
          perLine = new Map();
          removalsBySource.set(sourceId, perLine);
        }
        let set = perLine.get(lineIdx);
        if (!set) {
          set = new Set();
          perLine.set(lineIdx, set);
        }
        set.add(choiceIdx);
      }

      for (const [sourceId, perLine] of removalsBySource) {
        const source = seqs.find((s) => s.Id === sourceId);
        if (!source) continue;
        const updatedLines = source.Lines.map((line, lineIdx) => {
          const drop = perLine.get(lineIdx);
          if (!drop) return line;
          return { ...line, Choices: line.Choices.filter((_, ci) => !drop.has(ci)) };
        });
        try {
          await dialogsApi.save(folder, { ...source, Lines: updatedLines });
        } catch (e) {
          setError(String(e));
          return;
        }
      }
      await refetch();
    },
    [folder, seqs, refetch],
  );

  const onNodesDelete = useCallback(
    async (deleted: SeqNode[]) => {
      if (!folder || !seqs) return;

      const ghostIds = new Set<string>();
      const realIds: string[] = [];
      for (const n of deleted) {
        if ((n.data as SeqNodeData).ghost) ghostIds.add(n.id);
        else realIds.push(n.id);
      }

      if (ghostIds.size > 0) {
        for (const seq of seqs) {
          let changed = false;
          const updatedLines = seq.Lines.map((line) => {
            const filtered = line.Choices.filter(
              (c) => !ghostIds.has(c.NextSequenceId),
            );
            if (filtered.length !== line.Choices.length) {
              changed = true;
              return { ...line, Choices: filtered };
            }
            return line;
          });
          if (!changed) continue;
          try {
            await dialogsApi.save(folder, { ...seq, Lines: updatedLines });
          } catch (e) {
            setError(String(e));
            return;
          }
        }
      }

      for (const id of realIds) {
        try {
          await dialogsApi.remove(folder, id);
        } catch (e) {
          setError(String(e));
          return;
        }
      }

      await refetch();
    },
    [folder, seqs, refetch],
  );

  const onBeforeDelete = useCallback(
    async ({ nodes: ns }: { nodes: SeqNode[]; edges: ChoiceEdge[] }) => {
      const real = ns.filter((n) => !(n.data as SeqNodeData).ghost);
      const ghosts = ns.filter((n) => (n.data as SeqNodeData).ghost);
      if (real.length === 0 && ghosts.length === 0) return true;
      const parts: string[] = [];
      if (real.length > 0) {
        parts.push(
          real.length === 1
            ? `Delete sequence "${real[0]!.id}" (removes its file).`
            : `Delete ${real.length} sequence files: ${real.map((n) => n.id).join(", ")}.`,
        );
      }
      if (ghosts.length > 0) {
        parts.push(
          ghosts.length === 1
            ? `Clean up all choices that point to missing "${ghosts[0]!.id}".`
            : `Clean up all choices pointing to ${ghosts.length} missing targets: ${ghosts.map((n) => n.id).join(", ")}.`,
        );
      }
      return await showConfirm({
        title: real.length > 0 ? "Delete sequences?" : "Clean up dangling references?",
        message: parts.join("\n\n"),
        confirmLabel: "Delete",
        danger: real.length > 0,
      });
    },
    [],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const target = nodes.find((n) => n.id === connection.target);
      if (target && (target.data as SeqNodeData).ghost) return false;
      return true;
    },
    [nodes],
  );

  // Listen for edge-style patches (shape, dashed, waypoints) from edge components.
  const layoutRef = useRef<DialogLayout>(layout);
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);
  useEffect(() => {
    const handler = async (ev: Event) => {
      const detail = (ev as CustomEvent<EdgeStylePatchDetail>).detail;
      if (!folder || !detail) return;
      const current = layoutRef.current;
      const existing: EdgeStyle = current.edges[detail.edgeId] ?? {
        shape: "curved",
        dashed: false,
        waypoints: [],
      };
      const merged: EdgeStyle = { ...existing, ...detail.patch };
      const nextLayout: DialogLayout = {
        ...current,
        edges: { ...current.edges, [detail.edgeId]: merged },
      };
      setLayout(nextLayout);
      try {
        await dialogsApi.saveLayout(folder, nextLayout);
      } catch (e) {
        setError(String(e));
      }
    };
    window.addEventListener("bleepforge:edge-style", handler);
    return () => {
      window.removeEventListener("bleepforge:edge-style", handler);
    };
  }, [folder]);

  // Listen for inline edge label edits from ChoiceEdgeComponent.
  useEffect(() => {
    const handler = async (ev: Event) => {
      const detail = (ev as CustomEvent<EditChoiceTextDetail>).detail;
      if (!folder || !detail) return;
      const [sourceId, lineStr, choiceStr] = detail.edgeId.split("::");
      if (!sourceId) return;
      const lineIdx = Number(lineStr);
      const choiceIdx = Number(choiceStr);
      if (!Number.isInteger(lineIdx) || !Number.isInteger(choiceIdx)) return;

      const source = seqsRef.current.find((s) => s.Id === sourceId);
      if (!source) return;
      const updatedLines = source.Lines.map((line, li) => {
        if (li !== lineIdx) return line;
        return {
          ...line,
          Choices: line.Choices.map((c, ci) =>
            ci === choiceIdx ? { ...c, Text: detail.newText } : c,
          ),
        };
      });
      try {
        await dialogsApi.save(folder, { ...source, Lines: updatedLines });
        await refetch();
      } catch (e) {
        setError(String(e));
      }
    };
    window.addEventListener("bleepforge:edit-choice-text", handler);
    return () => {
      window.removeEventListener("bleepforge:edit-choice-text", handler);
    };
  }, [folder, refetch]);

  const resetLayout = useCallback(async () => {
    if (!folder) return;
    const ok = await showConfirm({
      title: "Reset layout?",
      message:
        "Discard saved node positions and edge styles for this folder, and re-run auto-layout.",
      confirmLabel: "Reset",
    });
    if (!ok) return;
    try {
      const cleared = emptyLayout();
      await dialogsApi.saveLayout(folder, cleared);
      setLayout(cleared);
    } catch (e) {
      setError(String(e));
    }
  }, [folder]);

  if (error) return <div className="text-red-400">Error: {error}</div>;
  if (folders === null) return <div className="text-neutral-500">Loading…</div>;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-xl font-semibold">Dialog graph</h1>
        <div className="flex items-center gap-3 text-sm">
          {folder &&
            (Object.keys(layout.nodes).length > 0 ||
              Object.keys(layout.edges).length > 0) && (
              <button
                onClick={resetLayout}
                className="text-neutral-500 hover:text-neutral-300"
                title="Discard saved positions and edge styles; re-run auto-layout"
              >
                Reset layout
              </button>
            )}
          <Link
            to={folder ? `/dialogs/list?folder=${encodeURIComponent(folder)}` : "/dialogs/list"}
            className="text-neutral-400 hover:text-neutral-200"
          >
            List view
          </Link>
          <ButtonLink to={folder ? `/dialogs/new?folder=${encodeURIComponent(folder)}` : "/dialogs/new"}>New</ButtonLink>
        </div>
      </div>

      <div className="shrink-0">
        <FolderTabs folders={folders} selected={folder} basePath="/dialogs" />
      </div>

      {folders.length === 0 ? (
        <div className="rounded border border-neutral-800 p-8 text-center text-neutral-500">
          No dialog folders yet.{" "}
          <Link to="/dialogs/new" className="text-emerald-400 hover:underline">
            Create your first dialog
          </Link>
          .
        </div>
      ) : seqs === null ? (
        <div className="text-neutral-500">Loading sequences…</div>
      ) : seqs.length === 0 ? (
        <div className="rounded border border-neutral-800 p-8 text-center text-neutral-500">
          No sequences in <span className="font-mono text-neutral-300">{folder}</span> yet.
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col rounded border border-neutral-800">
          <div className="min-h-0 flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              colorMode={theme === "light" ? "light" : "dark"}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeDragStop={onNodeDragStop}
              onConnect={onConnect}
              onConnectEnd={onConnectEnd}
              onPaneContextMenu={onPaneContextMenu}
              onEdgesDelete={onEdgesDelete}
              onNodesDelete={onNodesDelete}
              onBeforeDelete={onBeforeDelete}
              isValidConnection={isValidConnection}
              onMoveEnd={onMoveEnd}
              onNodeDoubleClick={(_e, node) => {
                const data = node.data as SeqNodeData;
                if (data.ghost || !folder) return;
                navigate(
                  `/dialogs/${encodeURIComponent(folder)}/${encodeURIComponent(node.id)}`,
                );
              }}
              nodesDraggable
              nodesConnectable
              elementsSelectable
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <div className="shrink-0 space-y-1 border-t border-neutral-800 bg-neutral-950/40 px-4 py-3 text-xs leading-relaxed text-neutral-300">
            <div>
              <span className="text-neutral-100">Drag handle</span> to connect ·
              drop on empty canvas →{" "}
              <span className="text-neutral-100">new sequence</span> ·{" "}
              <span className="text-neutral-100">double-click node</span> to
              open its form
            </div>
            <div>
              <span className="text-neutral-100">Click edge</span> for toolbar ·{" "}
              <span className="text-neutral-100">double-click edge path</span>{" "}
              to add a waypoint ·{" "}
              <span className="text-neutral-100">drag waypoint</span> to bend
            </div>
            <div>
              <span className="text-neutral-100">Double-click label</span> to
              edit choice text ·{" "}
              <span className="text-neutral-100">double-click waypoint</span> to
              remove it ·{" "}
              <span className="text-neutral-100">Backspace</span> to delete
              selection
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
