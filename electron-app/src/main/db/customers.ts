import { getDb } from './index'
import type { Customer } from '@shared/types'

const SELECT = `
  SELECT id, name, email, phone, address,
         created_at AS createdAt, updated_at AS updatedAt
  FROM customers
`

export function insert(c: Customer): Customer {
  getDb()
    .prepare(
      `INSERT INTO customers (id, name, email, phone, address)
       VALUES (@id, @name, @email, @phone, @address)`
    )
    .run(c)
  return c
}

export function findById(id: string): Customer | undefined {
  return getDb()
    .prepare(`${SELECT} WHERE id = ?`)
    .get(id) as Customer | undefined
}

export function findAll(): Customer[] {
  return getDb()
    .prepare(`${SELECT} ORDER BY created_at DESC`)
    .all() as Customer[]
}
