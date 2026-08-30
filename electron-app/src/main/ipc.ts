// IPC handlers — deliberately thin.
// No business logic lives here. Every handler is a one-liner that delegates
// to a domain module. If you find yourself writing more than one line per
// handler, the logic belongs in business/ instead.

import { ipcMain, BrowserWindow } from 'electron'
import type { SignalClient } from './signal/client'
import type { OrderStatus } from '@shared/types'
import * as customers from './business/customers'
import * as orders from './business/orders'
import * as invoices from './business/invoices'
import * as notifications from './business/notifications'
import * as msgDb from './db/messages'
import * as ai from './ai/client'

export function registerHandlers(signal: SignalClient, win: BrowserWindow): void {
  // ── Customers ──────────────────────────────────────────────────────────────
  ipcMain.handle('customers:create', (_, args) => customers.createCustomer(args))
  ipcMain.handle('customers:list', () => customers.listCustomers())
  ipcMain.handle('customers:get', (_, id: string) => customers.getCustomer(id))

  // ── Orders ─────────────────────────────────────────────────────────────────
  ipcMain.handle('orders:create', (_, args) => orders.createOrder(args))
  ipcMain.handle('orders:list', () => orders.listOrders())
  ipcMain.handle('orders:get', (_, id: string) => orders.getOrder(id))
  ipcMain.handle('orders:updateStatus', (_, id: string, status: OrderStatus) =>
    orders.updateStatus(id, status))

  // ── Invoices ───────────────────────────────────────────────────────────────
  ipcMain.handle('invoices:create', (_, orderId: string) => invoices.createInvoice(orderId))
  ipcMain.handle('invoices:list', () => invoices.listInvoices())
  ipcMain.handle('invoices:get', (_, id: string) => invoices.getInvoice(id))
  ipcMain.handle('invoices:recordPayment', (_, id: string, amount: number) =>
    invoices.recordPayment(id, amount))

  // ── Signal ─────────────────────────────────────────────────────────────────
  ipcMain.handle('signal:send', (_, phone: string, customerId: string, message: string) =>
    notifications.sendDirect(phone, customerId, message))
  ipcMain.handle('signal:getConversation', (_, customerId: string) =>
    msgDb.findByCustomer(customerId))
  ipcMain.handle('signal:sendOrderConfirmation', (_, customerId: string, orderId: string) =>
    notifications.sendOrderConfirmation(customerId, orderId))
  ipcMain.handle('signal:sendInvoiceNotification', (_, customerId: string, invoiceId: string) =>
    notifications.sendInvoiceNotification(customerId, invoiceId))
  ipcMain.handle('signal:sendPaymentReminder', (_, customerId: string, invoiceId: string) =>
    notifications.sendPaymentReminder(customerId, invoiceId))

  // ── AI ─────────────────────────────────────────────────────────────────────
  ipcMain.handle('ai:summarize', (_, msgs) => ai.summarize(msgs))

  // Streaming draft: tokens are pushed as events rather than buffered to response.
  // requestId lets the renderer match tokens to the originating call.
  ipcMain.handle('ai:generateDraft', async (_, args: { context: string; requestId: string }) => {
    return ai.generateDraft({
      context: args.context,
      onToken: (token) => win.webContents.send('ai:token', { requestId: args.requestId, token, done: false })
    }).then((full) => {
      win.webContents.send('ai:token', { requestId: args.requestId, token: '', done: true })
      return full
    })
  })

  // ── Signal → Renderer events ───────────────────────────────────────────────
  signal.onMessage((msg) => win.webContents.send('signal:message', msg))
  signal.onStatus((status) => win.webContents.send('signal:status', status))
}
