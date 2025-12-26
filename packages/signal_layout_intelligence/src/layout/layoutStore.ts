export type Density = 'compact' | 'comfortable' | 'spacious';
export type Contrast = 'normal' | 'high';
export type Workspace = 'Focus' | 'Inbox' | 'Ops' | 'Compose';

export type LayoutState = {
  sidebarW: number;
  composerH: number;
  density: Density;
  contrast: Contrast;
  workspace: Workspace;
  collapsed: Record<string, boolean>;
};

const KEY = 'signalx.layout.v1';

const DEFAULTS: LayoutState = {
  sidebarW: 360,
  composerH: 120,
  density: 'comfortable',
  contrast: 'normal',
  workspace: 'Inbox',
  collapsed: {},
};

export const SNAP = {
  sidebarW: [320, 360, 420, 480],
  composerH: [96, 120, 160, 220],
};

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function saveLayout(next: LayoutState) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function applyHtmlDatasets(state: LayoutState) {
  document.documentElement.dataset.density = state.density;
  document.documentElement.dataset.contrast = state.contrast;
}

export function preset(workspace: Workspace, current: LayoutState): LayoutState {
  const base = { ...current, workspace };
  switch (workspace) {
    case 'Focus':   return { ...base, sidebarW: 320, composerH: 96 };
    case 'Inbox':   return { ...base, sidebarW: 360, composerH: 120 };
    case 'Ops':     return { ...base, sidebarW: 480, composerH: 160, contrast: 'high' };
    case 'Compose': return { ...base, sidebarW: 420, composerH: 220 };
    default:        return base;
  }
}
