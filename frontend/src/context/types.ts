export type ThemePreference = "light" | "dark" | "system";

export type ThreadMessage = {
  id: string;
  role: "buyer" | "seller";
  text: string;
  timestamp: number;
  read: boolean;
};

export type Thread = {
  id: string;
  buyerId: string;
  messages: ThreadMessage[];
  status: "open" | "resolved";
  lastMessage: string;
  unread: number;
  kind: "dm" | "group";
  needsSend: boolean;
};

export type Contact = {
  id: string;
  name: string;
  phone: string;
  alias?: string;
  email?: string;
  meta?: {
    favorite?: boolean;
    vip?: boolean;
    coresBuyer?: boolean;
    notes?: string;
    standing?: string;
  };
};

export type Product = {
  id: string;
  name: string;
  priceCents: number;
  unit: string;
  quantity: number;
};

export type Order = {
  id: string;
  buyerId: string;
  total: number;
  status: "pending" | "confirmed" | "delivered";
  items: Array<{ productId: string; qty: number }>;
};

export type MenuChoice = {
  id: string;
  text: string;
  action: string;
};

export type Menu = {
  id: string;
  name: string;
  choices: MenuChoice[];
};

export type Fixtures = {
  threads: Thread[];
  contacts: Contact[];
  products: Product[];
  orders: Order[];
  menus: Menu[];
};

export type ScreenId =
  | "inbox"
  | "people"
  | "menu"
  | "settings"
  | "catalog"
  | "orders"
  | "sales"
  | "outbox"
  | "audit";
