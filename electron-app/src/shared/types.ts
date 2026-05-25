// IPC contract. Both main and renderer import from here.
// Never import from main/ inside renderer — all comms go through this surface.

export interface Customer {
  id: string
  name: string
  email: string
  phone: string
  address: string
  createdAt: string
  updatedAt: string
}

export interface Order {
  id: string
  customerId: string
  status: OrderStatus
  totalAmount: number
  createdAt: string
  updatedAt: string
}

export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'completed' | 'cancelled'

export interface Invoice {
  id: string
  orderId: string
  invoiceNumber: string
  amountDue: number
  amountPaid: number
  status: InvoiceStatus
  dueDate: string | null
  createdAt: string
  updatedAt: string
}

export type InvoiceStatus = 'pending' | 'partial' | 'paid'

export interface Message {
  id: string
  customerId: string
  orderId: string | null
  messageType: string
  content: string
  isAutomated: boolean
  createdAt: string
}

export interface IncomingSignalMessage {
  source: string
  sourceNumber: string
  content: string
  timestamp: number
}

export type SignalStatus = 'connected' | 'disconnected' | 'reconnecting'

// The full IPC surface — what the renderer can call via window.api
export interface API {
  customers: {
    create(args: { name: string; email: string; phone: string; address: string }): Promise<Customer>
    list(): Promise<Customer[]>
    get(id: string): Promise<Customer>
  }
  orders: {
    create(args: { customerId: string; amount: number }): Promise<Order>
    list(): Promise<Order[]>
    get(id: string): Promise<Order>
    updateStatus(id: string, status: OrderStatus): Promise<void>
  }
  invoices: {
    create(orderId: string): Promise<Invoice>
    list(): Promise<Invoice[]>
    get(id: string): Promise<Invoice>
    recordPayment(id: string, amount: number): Promise<Invoice>
  }
  signal: {
    send(phone: string, customerId: string, message: string): Promise<void>
    getConversation(customerId: string): Promise<Message[]>
    sendOrderConfirmation(customerId: string, orderId: string): Promise<void>
    sendInvoiceNotification(customerId: string, invoiceId: string): Promise<void>
    sendPaymentReminder(customerId: string, invoiceId: string): Promise<void>
  }
  ai: {
    summarize(messages: Message[]): Promise<string>
    // Streaming draft: tokens arrive via on.aiToken; resolves with full text
    generateDraft(args: { context: string; requestId: string }): Promise<string>
  }
  on: {
    signalMessage(handler: (msg: IncomingSignalMessage) => void): () => void
    signalStatus(handler: (status: SignalStatus) => void): () => void
    aiToken(handler: (args: { requestId: string; token: string; done: boolean }) => void): () => void
  }
}

// Augment the Window interface so renderer gets types without importing Electron
declare global {
  interface Window {
    api: API
  }
}
