import type { Plugin } from './types';
import { registerPlugin } from './registry';

/**
 * Example plugin: Tools Panel Plugin
 */
export const toolsPanelPlugin: Plugin = {
  metadata: {
    id: 'tools-panel',
    name: 'Tools Panel',
    version: '1.0.0',
    description: 'Provides tools and utilities panel',
    enabled: true,
  },
  flag: 'ui.panel.tools',
  commands: [
    {
      id: 'export-thread',
      title: 'Export Thread',
      description: 'Export current thread to file',
      run: async () => {
        console.log('Export thread command executed');
        // Implementation would call backend API
      },
    },
  ],
  lifecycle: {
    onActivate: async () => {
      console.log('Tools panel plugin activated');
    },
    onDeactivate: async () => {
      console.log('Tools panel plugin deactivated');
    },
  },
};

/**
 * Example plugin: AI Assistant Plugin
 */
export const aiAssistantPlugin: Plugin = {
  metadata: {
    id: 'ai-assistant',
    name: 'AI Assistant',
    version: '1.0.0',
    description: 'AI-powered message assistance',
    enabled: true,
  },
  flag: 'ui.panel.ai',
  commands: [
    {
      id: 'summarize-thread',
      title: 'Summarize Thread',
      description: 'Generate AI summary of conversation',
      run: async () => {
        console.log('Summarize thread command executed');
      },
    },
    {
      id: 'draft-reply',
      title: 'Draft Reply',
      description: 'Generate AI draft reply',
      run: async () => {
        console.log('Draft reply command executed');
      },
    },
  ],
  lifecycle: {
    onActivate: async () => {
      console.log('AI assistant plugin activated');
    },
  },
};

/**
 * Register example plugins
 */
export function registerExamplePlugins(): void {
  registerPlugin(toolsPanelPlugin);
  registerPlugin(aiAssistantPlugin);
}
