import type { Node, NodePositionChange, XYPosition } from "@xyflow/react";

// Alignment helper lines, adapted from the official React Flow "helper lines"
// example. When a dragged node's edge comes within `distance` px of another
// node's edge, we snap to it and report the guide line to render.

export interface HelperLinesResult {
  horizontal?: number;
  vertical?: number;
  snapPosition: Partial<XYPosition>;
}

function bounds(pos: XYPosition, width: number, height: number) {
  return {
    left: pos.x,
    right: pos.x + width,
    top: pos.y,
    bottom: pos.y + height,
    width,
    height,
  };
}

export function getHelperLines(
  change: NodePositionChange,
  nodes: Node[],
  distance = 5,
): HelperLinesResult {
  const defaultResult: HelperLinesResult = {
    horizontal: undefined,
    vertical: undefined,
    snapPosition: { x: undefined, y: undefined },
  };

  const nodeA = nodes.find((n) => n.id === change.id);
  if (!nodeA || !change.position) return defaultResult;

  const a = bounds(change.position, nodeA.measured?.width ?? 0, nodeA.measured?.height ?? 0);

  let vDist = distance;
  let hDist = distance;

  return nodes
    .filter((n) => n.id !== nodeA.id)
    .reduce<HelperLinesResult>((result, nodeB) => {
      const b = bounds(nodeB.position, nodeB.measured?.width ?? 0, nodeB.measured?.height ?? 0);

      // ---- vertical guides (align on X) ----
      const leftLeft = Math.abs(a.left - b.left);
      if (leftLeft < vDist) {
        result.snapPosition.x = b.left;
        result.vertical = b.left;
        vDist = leftLeft;
      }
      const rightRight = Math.abs(a.right - b.right);
      if (rightRight < vDist) {
        result.snapPosition.x = b.right - a.width;
        result.vertical = b.right;
        vDist = rightRight;
      }
      const leftRight = Math.abs(a.left - b.right);
      if (leftRight < vDist) {
        result.snapPosition.x = b.right;
        result.vertical = b.right;
        vDist = leftRight;
      }
      const rightLeft = Math.abs(a.right - b.left);
      if (rightLeft < vDist) {
        result.snapPosition.x = b.left - a.width;
        result.vertical = b.left;
        vDist = rightLeft;
      }

      // ---- horizontal guides (align on Y) ----
      const topTop = Math.abs(a.top - b.top);
      if (topTop < hDist) {
        result.snapPosition.y = b.top;
        result.horizontal = b.top;
        hDist = topTop;
      }
      const bottomBottom = Math.abs(a.bottom - b.bottom);
      if (bottomBottom < hDist) {
        result.snapPosition.y = b.bottom - a.height;
        result.horizontal = b.bottom;
        hDist = bottomBottom;
      }
      const topBottom = Math.abs(a.top - b.bottom);
      if (topBottom < hDist) {
        result.snapPosition.y = b.bottom;
        result.horizontal = b.bottom;
        hDist = topBottom;
      }
      const bottomTop = Math.abs(a.bottom - b.top);
      if (bottomTop < hDist) {
        result.snapPosition.y = b.top - a.height;
        result.horizontal = b.top;
        hDist = bottomTop;
      }

      return result;
    }, defaultResult);
}
