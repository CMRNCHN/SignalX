import type {
  Plugin,
  PluginRegistryEntry,
  PluginEvent,
  PluginMessage,
  PluginMetadata,
} from './types';

type EventListener = (event: PluginEvent) => void;

/**
 * Plugin Registry
 * 
 * Manages plugin registration, activation, and lifecycle.
 */
class PluginRegistry {
  private plugins: Map<string, PluginRegistryEntry> = new Map();
  private listeners: Set<EventListener> = new Set();
  private messageQueue: Map<string, PluginMessage[]> = new Map();

  /**
   * Register a plugin
   */
  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.metadata.id)) {
      console.warn(`Plugin ${plugin.metadata.id} is already registered`);
      return;
    }

    // Validate plugin
    if (!plugin.metadata.id || !plugin.metadata.name) {
      throw new Error('Plugin must have id and name in metadata');
    }

    // Check dependencies
    if (plugin.dependencies) {
      for (const depId of plugin.dependencies) {
        if (!this.plugins.has(depId)) {
          console.warn(
            `Plugin ${plugin.metadata.id} depends on ${depId} which is not registered`
          );
        }
      }
    }

    const entry: PluginRegistryEntry = {
      plugin,
      state: 'registered',
    };

    this.plugins.set(plugin.metadata.id, entry);
    this.messageQueue.set(plugin.metadata.id, []);

    this.emit({
      type: 'plugin.registered',
      pluginId: plugin.metadata.id,
    });

    // Auto-activate if enabled
    if (plugin.metadata.enabled) {
      this.activate(plugin.metadata.id);
    }
  }

  /**
   * Unregister a plugin
   */
  unregister(pluginId: string): void {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      return;
    }

    // Deactivate first if active
    if (entry.state === 'activated') {
      this.deactivate(pluginId);
    }

    this.plugins.delete(pluginId);
    this.messageQueue.delete(pluginId);
  }

  /**
   * Activate a plugin
   */
  async activate(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (entry.state === 'activated') {
      return; // Already activated
    }

    // Check dependencies are activated
    if (entry.plugin.dependencies) {
      for (const depId of entry.plugin.dependencies) {
        const dep = this.plugins.get(depId);
        if (!dep || dep.state !== 'activated') {
          throw new Error(
            `Cannot activate ${pluginId}: dependency ${depId} is not activated`
          );
        }
      }
    }

    try {
      // Call lifecycle hook
      if (entry.plugin.lifecycle?.onActivate) {
        await entry.plugin.lifecycle.onActivate();
      }

      entry.state = 'activated';
      entry.activatedAt = Date.now();
      entry.error = undefined;

      // Process queued messages
      const queued = this.messageQueue.get(pluginId) || [];
      for (const message of queued) {
        await this.sendMessage(pluginId, message);
      }
      this.messageQueue.set(pluginId, []);

      this.emit({
        type: 'plugin.activated',
        pluginId,
      });
    } catch (error) {
      entry.state = 'error';
      entry.error = error instanceof Error ? error.message : String(error);

      this.emit({
        type: 'plugin.error',
        pluginId,
        error: entry.error,
      });

      throw error;
    }
  }

  /**
   * Deactivate a plugin
   */
  async deactivate(pluginId: string): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      return;
    }

    if (entry.state !== 'activated') {
      return; // Not activated
    }

    try {
      // Call lifecycle hook
      if (entry.plugin.lifecycle?.onDeactivate) {
        await entry.plugin.lifecycle.onDeactivate();
      }

      entry.state = 'deactivated';

      this.emit({
        type: 'plugin.deactivated',
        pluginId,
      });
    } catch (error) {
      entry.state = 'error';
      entry.error = error instanceof Error ? error.message : String(error);

      this.emit({
        type: 'plugin.error',
        pluginId,
        error: entry.error,
      });
    }
  }

  /**
   * Get a plugin by ID
   */
  get(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId)?.plugin;
  }

  /**
   * Get all registered plugins
   */
  getAll(): Plugin[] {
    return Array.from(this.plugins.values()).map(entry => entry.plugin);
  }

  /**
   * Get all activated plugins
   */
  getActivated(): Plugin[] {
    return Array.from(this.plugins.values())
      .filter(entry => entry.state === 'activated')
      .map(entry => entry.plugin);
  }

  /**
   * Get plugin registry entry
   */
  getEntry(pluginId: string): PluginRegistryEntry | undefined {
    return this.plugins.get(pluginId);
  }

  /**
   * Check if plugin is activated
   */
  isActivated(pluginId: string): boolean {
    return this.plugins.get(pluginId)?.state === 'activated';
  }

  /**
   * Send message to a plugin
   */
  async sendMessage(pluginId: string, message: PluginMessage): Promise<void> {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    const fullMessage: PluginMessage = {
      ...message,
      timestamp: Date.now(),
    };

    if (entry.state === 'activated' && entry.plugin.lifecycle?.onMessage) {
      try {
        await entry.plugin.lifecycle.onMessage(fullMessage);
      } catch (error) {
        console.error(`Error handling message in plugin ${pluginId}:`, error);
      }
    } else {
      // Queue message if plugin not activated
      const queue = this.messageQueue.get(pluginId) || [];
      queue.push(fullMessage);
      this.messageQueue.set(pluginId, queue);
    }

    this.emit({
      type: 'plugin.message',
      pluginId,
      message: fullMessage,
    });
  }

  /**
   * Broadcast message to all activated plugins
   */
  async broadcast(message: Omit<PluginMessage, 'timestamp'>): Promise<void> {
    const activated = this.getActivated();
    await Promise.all(
      activated.map(plugin => this.sendMessage(plugin.metadata.id, message as PluginMessage))
    );
  }

  /**
   * Subscribe to plugin events
   */
  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Emit plugin event
   */
  private emit(event: PluginEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in plugin event listener:', error);
      }
    });
  }

  /**
   * Get plugins by feature flag
   */
  getByFlag(flag: string): Plugin[] {
    return this.getAll().filter(plugin => plugin.flag === flag);
  }

  /**
   * Update plugin metadata
   */
  updateMetadata(pluginId: string, updates: Partial<PluginMetadata>): void {
    const entry = this.plugins.get(pluginId);
    if (!entry) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    entry.plugin.metadata = {
      ...entry.plugin.metadata,
      ...updates,
    };
  }
}

// Singleton instance
export const pluginRegistry = new PluginRegistry();

// Export convenience functions
export function registerPlugin(plugin: Plugin): void {
  pluginRegistry.register(plugin);
}

export function activatePlugin(pluginId: string): Promise<void> {
  return pluginRegistry.activate(pluginId);
}

export function deactivatePlugin(pluginId: string): Promise<void> {
  return pluginRegistry.deactivate(pluginId);
}

export function getPlugin(pluginId: string): Plugin | undefined {
  return pluginRegistry.get(pluginId);
}

export function getAllPlugins(): Plugin[] {
  return pluginRegistry.getAll();
}

export function getActivatedPlugins(): Plugin[] {
  return pluginRegistry.getActivated();
}
