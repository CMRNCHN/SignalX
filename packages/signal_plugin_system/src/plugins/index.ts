/**
 * SignalX Plugin System
 * 
 * Provides plugin architecture for extending SignalX functionality.
 */

export * from './types';
export * from './registry';
export * from './examples';
export * from './hooks';
export {
  pluginRegistry,
  registerPlugin,
  activatePlugin,
  deactivatePlugin,
  getPlugin,
  getAllPlugins,
  getActivatedPlugins,
} from './registry';
