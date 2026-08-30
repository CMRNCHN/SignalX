import { v4 as uuid } from 'uuid'
import * as db from '../db/orders'
import * as customerDb from '../db/customers'
import type { Order, OrderStatus } from '@shared/types'

export function createOrder(args: { customerId: string; amount: number }): Order {
  if (!customerDb.findById(args.customerId)) {
    throw new Error(`Customer ${args.customerId} not found`)
  }
  if (!Number.isFinite(args.amount) || args.amount <= 0) {
    throw new Error('Order amount must be a positive number')
  }

  return db.insert({
    id: uuid(),
    customerId: args.customerId,
    status: 'pending',
    totalAmount: args.amount,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
}

export function listOrders(): Order[] {
  return db.findAll()
}

export function getOrder(id: string): Order {
  const o = db.findById(id)
  if (!o) throw new Error(`Order ${id} not found`)
  return o
}

export function updateStatus(id: string, status: OrderStatus): void {
  const VALID: OrderStatus[] = ['pending', 'processing', 'shipped', 'completed', 'cancelled']
  if (!VALID.includes(status)) throw new Error(`Invalid status: ${status}`)
  db.updateStatus(id, status)
}
