import { v4 as uuid } from 'uuid'
import type { SignalClient } from '../signal/client'
import * as msgDb from '../db/messages'
import { getCustomer } from './customers'
import { getOrder } from './orders'
import { getInvoice } from './invoices'

let signal: SignalClient

export function init(client: SignalClient): void {
  signal = client
}

// All notification functions follow the same pattern:
//   1. Resolve domain objects (throws if not found)
//   2. Build message content
//   3. Send via Signal
//   4. Persist to messages table
// If the Signal send fails the message is NOT logged — no phantom history.

export async function sendOrderConfirmation(
  customerId: string,
  orderId: string
): Promise<void> {
  const customer = getCustomer(customerId)
  const order = getOrder(orderId)
  const content = `Order #${orderId.slice(0, 8)} confirmed. Total: $${order.totalAmount.toFixed(2)}`

  await signal.sendMessage(customer.phone, content)
  msgDb.insert({ id: uuid(), customerId, orderId, messageType: 'order_confirmation', content, isAutomated: true })
}

export async function sendInvoiceNotification(
  customerId: string,
  invoiceId: string
): Promise<void> {
  const customer = getCustomer(customerId)
  const invoice = getInvoice(invoiceId)
  const content = `Invoice ${invoice.invoiceNumber} issued. Amount due: $${invoice.amountDue.toFixed(2)}`

  await signal.sendMessage(customer.phone, content)
  msgDb.insert({ id: uuid(), customerId, orderId: invoice.orderId, messageType: 'invoice_notification', content, isAutomated: true })
}

export async function sendPaymentReminder(
  customerId: string,
  invoiceId: string
): Promise<void> {
  const customer = getCustomer(customerId)
  const invoice = getInvoice(invoiceId)
  const remaining = invoice.amountDue - invoice.amountPaid
  const content = `Payment reminder: invoice ${invoice.invoiceNumber} — $${remaining.toFixed(2)} remaining`

  await signal.sendMessage(customer.phone, content)
  msgDb.insert({ id: uuid(), customerId, orderId: invoice.orderId, messageType: 'payment_reminder', content, isAutomated: true })
}

export async function sendDirect(
  phone: string,
  customerId: string,
  message: string
): Promise<void> {
  await signal.sendMessage(phone, message)
  // Manual sends are logged too — this was missing in the old codebase
  msgDb.insert({ id: uuid(), customerId, orderId: null, messageType: 'direct', content: message, isAutomated: false })
}
