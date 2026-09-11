// Scope types
export type Scope = "messages" | "people" | "catalog" | "orders" | "bot_menus";

// People
export type PersonType = "Consumer" | "Supplier" | "Team";
export type PersonStatus = "Unread" | "Needs attention" | "Pending send" | "Auto-replied" | "Read";

export interface Person {
  key: string;
  name: string;
  type: PersonType;
  status: PersonStatus[];
  email?: string;
  phone?: string;
  tags: string[];
  favorite: boolean;
  muted: boolean;
  unreadCount: number;
  orderCount: number;
  lifetimeCents: number;
  openCents: number;
  notes?: string;
}

// Orders
export type OrderStatus = "draft" | "confirmed" | "invoiced" | "paid" | "fulfilled" | "cancelled";

export interface OrderLine {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
}

export interface Order {
  id: string;
  thread_id: string;
  customer_id?: string;
  status: OrderStatus;
  created_at: number;
  updated_at: number;
  total_cents: number;
  lines: OrderLine[];
}

// Catalog / Products
export type ProductStatus = "active" | "draft" | "discontinued";
export type StockLevel = "in_stock" | "low_stock" | "out_of_stock";

export interface Product {
  id: string;
  name: string;
  sku: string;
  description?: string;
  status: ProductStatus;
  category?: string;
  price_cents: number;
  cost_cents?: number;
  current_stock: number;
  reorder_level: number;
  tags: string[];
}

// Messages
export interface Message {
  id: string;
  thread_id: string;
  content: string;
  direction: "Incoming" | "Outgoing";
  timestamp: number;
  from?: string;
}

export interface Thread {
  id: string;
  type: "direct" | "group";
  participants: string[];
  last_message?: Message;
  unread: boolean;
}

// Bot Menus
export interface BotMenuOption {
  letter: string; // A, B, C, D
  label: string;
  response?: string;
}

export interface BotMenu {
  id: string;
  name: string;
  type: "callable" | "triggered";
  status: "active" | "draft" | "archived";
  first_message: string;
  options: BotMenuOption[];
  trigger?: string; // when it appears
  linked_to?: Scope; // which entity it's linked to
  times_shown?: number;
  response_rate?: number;
}

// Sidebar State
export interface SidebarState {
  searchQuery: string;
  expandedScopes: Set<Scope>;
  selectedScope: Scope | null;
  selectedItemId: string | null;
  scopeCounts: Record<Scope, number>;
  activeFilters: Record<Scope, any>;
  scopeResults: Record<Scope, any[]>;
}

// Detail View State
export interface DetailViewState {
  selectedScope: Scope | null;
  selectedItemId: string | null;
  itemData: any | null;
  loading: boolean;
  error: string | null;
}

// Action Button
export interface ActionButton {
  id: string;
  label: string;
  icon: string;
  onClick: () => Promise<void> | void;
  variant?: "default" | "danger";
  disabled?: boolean;
}

// Filters per scope
export interface FilterState {
  messages: Record<string, any>;
  people: {
    type?: PersonType[];
    status?: PersonStatus[];
    tags?: string[];
  };
  catalog: {
    status?: ProductStatus[];
    category?: string[];
    stock?: StockLevel[];
  };
  orders: {
    status?: OrderStatus[];
    dateRange?: "7" | "30" | "all";
    payment?: "paid" | "unpaid";
  };
  bot_menus: Record<string, any>;
}
