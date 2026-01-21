import React from 'react';
import { Card } from './primitives';
import './TileDashboard.css';

interface TileDashboardProps {
  newMessagesCount?: number;
  activeContacts?: number;
  threadsCount?: number;
}

/**
 * TileDashboard renders a row of pastel dashboard tiles.  Each tile can
 * represent a quick action or a statistic.  The muted pastel colours
 * align with the overall SignalX aesthetic without overwhelming the
 * workspace.
 */
const TileDashboard: React.FC<TileDashboardProps> = ({ 
  newMessagesCount = 0,
  activeContacts = 0,
  threadsCount = 0
}) => {
  const tiles = [
    { color: '#A9E8D9', title: 'New Messages', value: newMessagesCount },
    { color: '#A8D0FF', title: 'Active Contacts', value: activeContacts },
    { color: '#FFE8A3', title: 'Conversations', value: threadsCount },
    { color: '#FFB1A8', title: 'AI Suggestions', value: 0 }
  ];

  return (
    <div className="tile-dashboard panel tile-dashboard">
      <div className="tiles-container">
        {tiles.map((tile, idx) => (
          <Card
            key={idx}
            variant="elevated"
            padding="md"
            hoverable
            interactive
            style={{ backgroundColor: tile.color }}
          >
            <span className="tile-value">{tile.value}</span>
            <span className="tile-title">{tile.title}</span>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default TileDashboard;