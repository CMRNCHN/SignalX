import type React from 'react';

/**
 * Plugin lifecycle hooks
 */
export type PluginLifecycle = {
  onActivate?: () => void | Promise<void>;
  onDeactivate?: () => void | Promise<void>;
  onMessage?: (message: PluginMessage) => void | Promise<void>;
};

/**
 * Plugin message for inter-plugin communication
 */
export type PluginMessage = {
  type: string;
  payload?: unknown;
  source?: string;
  timestamp: number;
};

/**
 * Plugin command definition
 */
export type PluginCommand = {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  run: () => void | Promise<void>;
  enabled?: () => boolean;
  category?: string;
};

/**
 * Plugin configuration
 */
export type PluginConfig = {
  [key: string]: unknown;
};

/**
 * Plugin metadata
 */
export type PluginMetadata = {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  enabled: boolean;
  config?: PluginConfig;
};

/**
 * Plugin definition
 */
export type Plugin = {
  metadata: PluginMetadata;
  flag?: string; // Feature flag that controls plugin visibility
  render?: () => React.ReactNode;
  commands?: PluginCommand[];
  lifecycle?: PluginLifecycle;
  dependencies?: string[]; // IDs of plugins this depends on
};

/**
 * Plugin registry entry
 */
export type PluginRegistryEntry = {
  plugin: Plugin;
  state: 'registered' | 'activated' | 'deactivated' | 'error';
  error?: string;
  activatedAt?: number;
};

/**
 * Plugin event types
 */
export type PluginEvent = 
  | { type: 'plugin.registered'; pluginId: string }
  | { type: 'plugin.activated'; pluginId: string }
  | { type: 'plugin.deactivated'; pluginId: string }
  | { type: 'plugin.error'; pluginId: string; error: string }
  | { type: 'plugin.message'; pluginId: string; message: PluginMessage };
