import { v4 as uuid } from 'uuid'
import * as db from '../db/invoices'
import * as orderDb from '../db/orders'
import type { Invoice } from '@shared/types'

export function createInvoice(orderId: string): Invoice {
  const order = orderDb.findById(orderId)
  if (!order) throw new Error(`Order ${orderId} not found`)

  return db.insert({
    id: uuid(),
    orderId,
    invoiceNumber: `INV-${Date.now()}`,
    amountDue: order.totalAmount,
    amountPaid: 0,
    status: 'pending',
    dueDate: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
}

export function listInvoices(): Invoice[] {
  return db.findAll()
}

export function getInvoice(id: string): Invoice {
  const inv = db.findById(id)
  if (!inv) throw new Error(`Invoice ${id} not found`)
  return inv
}

export function recordPayment(id: string, amount: number): Invoice {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Payment amount must be a positive number')
  }
  return db.applyPayment(id, amount)
}
