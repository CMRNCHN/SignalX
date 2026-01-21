import React, { useState, useEffect } from 'react';
import { Button, Card, Badge } from '../primitives';
import { 
  getAllPlugins, 
  getActivatedPlugins,
  activatePlugin,
  deactivatePlugin,
  pluginRegistry
} from '../../../packages/signal_plugin_system/src/plugins/index';
import type { Plugin } from '../../../packages/signal_plugin_system/src/plugins/types';
import './PluginManagementPanel.css';

interface PluginManagementPanelProps {
  onClose?: () => void;
}

export const PluginManagementPanel: React.FC<PluginManagementPanelProps> = ({ onClose }) => {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [activatedIds, setActivatedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = () => {
    const all = getAllPlugins();
    const activated = getActivatedPlugins();
    setPlugins(all);
    setActivatedIds(new Set(activated.map(p => p.metadata.id)));
  };

  const handleToggle = async (pluginId: string) => {
    try {
      if (activatedIds.has(pluginId)) {
        await pluginRegistry.deactivate(pluginId);
      } else {
        await pluginRegistry.activate(pluginId);
      }
      loadPlugins();
    } catch (error) {
      console.error(`Failed to toggle plugin ${pluginId}:`, error);
      alert(`Failed to toggle plugin: ${error}`);
    }
  };

  return (
    <div className="plugin-management-panel">
      <div className="plugin-management-content">
        <div className="plugin-list">
          {plugins.length === 0 ? (
            <div className="plugin-empty">No plugins installed</div>
          ) : (
            plugins.map(plugin => {
              const isActivated = activatedIds.has(plugin.metadata.id);
              return (
                <Card
                  key={plugin.metadata.id}
                  variant={selectedPlugin?.metadata.id === plugin.metadata.id ? 'elevated' : 'default'}
                  onClick={() => setSelectedPlugin(plugin)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="plugin-item">
                    <div className="plugin-item-header">
                      <div>
                        <h3 className="plugin-name">{plugin.metadata.name}</h3>
                        <p className="plugin-description">{plugin.metadata.description}</p>
                      </div>
                      <Badge variant={isActivated ? 'success' : 'default'} size="sm">
                        {isActivated ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="plugin-item-meta">
                      <span className="plugin-version">v{plugin.metadata.version}</span>
                      {plugin.flag && (
                        <span className="plugin-flag">Flag: {plugin.flag}</span>
                      )}
                    </div>
                    <div className="plugin-item-actions">
                      <Button
                        variant={isActivated ? 'secondary' : 'primary'}
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle(plugin.metadata.id);
                        }}
                      >
                        {isActivated ? 'Deactivate' : 'Activate'}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <div className="plugin-details">
          {selectedPlugin ? (
            <div className="plugin-details-content">
              <h3>{selectedPlugin.metadata.name}</h3>
              <p className="plugin-details-description">{selectedPlugin.metadata.description}</p>
              
              <div className="plugin-details-section">
                <h4>Metadata</h4>
                <dl>
                  <dt>ID</dt>
                  <dd>{selectedPlugin.metadata.id}</dd>
                  <dt>Version</dt>
                  <dd>{selectedPlugin.metadata.version}</dd>
                  <dt>Status</dt>
                  <dd>
                    <Badge variant={activatedIds.has(selectedPlugin.metadata.id) ? 'success' : 'default'}>
                      {activatedIds.has(selectedPlugin.metadata.id) ? 'Active' : 'Inactive'}
                    </Badge>
                  </dd>
                  {selectedPlugin.flag && (
                    <>
                      <dt>Feature Flag</dt>
                      <dd>{selectedPlugin.flag}</dd>
                    </>
                  )}
                </dl>
              </div>

              {selectedPlugin.commands && selectedPlugin.commands.length > 0 && (
                <div className="plugin-details-section">
                  <h4>Commands</h4>
                  <ul>
                    {selectedPlugin.commands.map(cmd => (
                      <li key={cmd.id}>
                        <strong>{cmd.title}</strong>: {cmd.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="plugin-details-actions">
                <Button
                  variant={activatedIds.has(selectedPlugin.metadata.id) ? 'secondary' : 'primary'}
                  onClick={() => handleToggle(selectedPlugin.metadata.id)}
                >
                  {activatedIds.has(selectedPlugin.metadata.id) ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="plugin-details-empty">
              <p>Select a plugin to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PluginManagementPanel;
