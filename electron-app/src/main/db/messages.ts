import { getDb } from './index'
import type { Message } from '@shared/types'

type NewMessage = Omit<Message, 'createdAt'>

const SELECT = `
  SELECT id,
         customer_id  AS customerId,
         order_id     AS orderId,
         message_type AS messageType,
         content,
         is_automated AS isAutomated,
         created_at   AS createdAt
  FROM messages
`

export function insert(m: NewMessage): void {
  getDb()
    .prepare(
      `INSERT INTO messages (id, customer_id, order_id, message_type, content, is_automated)
       VALUES (@id, @customerId, @orderId, @messageType, @content, @isAutomated)`
    )
    .run({ ...m, isAutomated: m.isAutomated ? 1 : 0, orderId: m.orderId ?? null })
}

export function findByCustomer(customerId: string): Message[] {
  return (
    getDb()
      .prepare(`${SELECT} WHERE customer_id = ? ORDER BY created_at ASC`)
      .all(customerId) as (Omit<Message, 'isAutomated'> & { isAutomated: number })[]
  ).map((r) => ({ ...r, isAutomated: r.isAutomated === 1 }))
}
