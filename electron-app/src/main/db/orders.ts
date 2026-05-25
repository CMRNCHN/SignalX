import { getDb } from './index'
import type { Order } from '@shared/types'

const SELECT = `
  SELECT id,
         customer_id  AS customerId,
         status,
         total_amount AS totalAmount,
         created_at   AS createdAt,
         updated_at   AS updatedAt
  FROM orders
`

export function insert(o: Order): Order {
  getDb()
    .prepare(
      `INSERT INTO orders (id, customer_id, status, total_amount)
       VALUES (@id, @customerId, @status, @totalAmount)`
    )
    .run(o)
  return o
}

export function findById(id: string): Order | undefined {
  return getDb().prepare(`${SELECT} WHERE id = ?`).get(id) as Order | undefined
}

export function findAll(): Order[] {
  return getDb().prepare(`${SELECT} ORDER BY created_at DESC`).all() as Order[]
}

export function updateStatus(id: string, status: string): void {
  const result = getDb()
    .prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(status, id)
  if (result.changes === 0) throw new Error(`Order ${id} not found`)
}
