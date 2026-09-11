import { DetailViewState, Scope } from "../types";

interface DetailViewProps {
  state: DetailViewState;
  onAction?: (actionId: string) => void;
}

export function DetailView({ state, onAction }: DetailViewProps) {
  const { selectedScope, loading, error, itemData } = state;

  if (!selectedScope) {
    return (
      <div className="detail-view detail-empty">
        <p>Select an item to view details</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="detail-view detail-loading">
        <p>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="detail-view detail-error">
        <p>Error loading detail: {error}</p>
      </div>
    );
  }

  if (!itemData) {
    return (
      <div className="detail-view detail-empty">
        <p>No data available</p>
      </div>
    );
  }

  // Route to correct detail component per scope
  switch (selectedScope) {
    case "people":
      return <PeopleDetail data={itemData} onAction={onAction} />;
    case "messages":
      return <MessagesDetail data={itemData} onAction={onAction} />;
    case "orders":
      return <OrderDetail data={itemData} onAction={onAction} />;
    case "catalog":
      return <CatalogDetail data={itemData} onAction={onAction} />;
    case "bot_menus":
      return <BotMenuDetail data={itemData} onAction={onAction} />;
    default:
      return null;
  }
}

// Placeholder detail components (to be implemented)

function PeopleDetail({ data, onAction }: { data: any; onAction?: (actionId: string) => void }) {
  return (
    <div className="detail-view people-detail">
      <h2>{data.name}</h2>
      <p>{data.type}</p>
      {/* TODO: Implement full People detail view */}
    </div>
  );
}

function MessagesDetail({ data, onAction }: { data: any; onAction?: (actionId: string) => void }) {
  return (
    <div className="detail-view messages-detail">
      <h2>{data.id}</h2>
      {/* TODO: Implement full Messages detail view */}
    </div>
  );
}

function OrderDetail({ data, onAction }: { data: any; onAction?: (actionId: string) => void }) {
  return (
    <div className="detail-view order-detail">
      <h2>{data.id}</h2>
      <p>{data.status}</p>
      {/* TODO: Implement full Order detail view */}
    </div>
  );
}

function CatalogDetail({ data, onAction }: { data: any; onAction?: (actionId: string) => void }) {
  return (
    <div className="detail-view catalog-detail">
      <h2>{data.name}</h2>
      <p>{data.sku}</p>
      {/* TODO: Implement full Catalog detail view */}
    </div>
  );
}

function BotMenuDetail({ data, onAction }: { data: any; onAction?: (actionId: string) => void }) {
  return (
    <div className="detail-view botmenu-detail">
      <h2>{data.name}</h2>
      {/* TODO: Implement full Bot Menu detail view */}
    </div>
  );
}
