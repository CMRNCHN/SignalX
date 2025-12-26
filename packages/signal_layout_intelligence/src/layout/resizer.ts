import { clamp } from './layoutStore';
import { nearestSnap } from './snapPoints';

export type DragType = 'sidebar' | 'composer';

export type DragCtx = {
  type: DragType;
  startX: number;
  startY: number;
  startSidebarW: number;
  startComposerH: number;
};

export function startDrag(type: DragType, e: React.MouseEvent, sidebarW: number, composerH: number): DragCtx {
  return { type, startX: e.clientX, startY: e.clientY, startSidebarW: sidebarW, startComposerH: composerH };
}

export function computeNext(ctx: DragCtx, e: MouseEvent) {
  if (ctx.type === 'sidebar') {
    const next = ctx.startSidebarW + (e.clientX - ctx.startX);
    return { sidebarW: clamp(next, 280, 520) };
  }
  const next = ctx.startComposerH - (e.clientY - ctx.startY);
  return { composerH: clamp(next, 84, 260) };
}

export function snapIfClose(sidebarW: number, composerH: number, snapSidebar: number[], snapComposer: number[]) {
  return {
    sidebarW: nearestSnap(sidebarW, snapSidebar),
    composerH: nearestSnap(composerH, snapComposer),
  };
}
