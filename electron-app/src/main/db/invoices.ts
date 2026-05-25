import { getDb } from './index'
import type { Invoice, InvoiceStatus } from '@shared/types'

const SELECT = `
  SELECT id,
         order_id        AS orderId,
         invoice_number  AS invoiceNumber,
         amount_due      AS amountDue,
         amount_paid     AS amountPaid,
         status,
         due_date        AS dueDate,
         created_at      AS createdAt,
         updated_at      AS updatedAt
  FROM invoices
`

export function insert(inv: Invoice): Invoice {
  getDb()
    .prepare(
      `INSERT INTO invoices (id, order_id, invoice_number, amount_due, amount_paid, status, due_date)
       VALUES (@id, @orderId, @invoiceNumber, @amountDue, @amountPaid, @status, @dueDate)`
    )
    .run(inv)
  return inv
}

export function findById(id: string): Invoice | undefined {
  return getDb().prepare(`${SELECT} WHERE id = ?`).get(id) as Invoice | undefined
}

export function findAll(): Invoice[] {
  return getDb().prepare(`${SELECT} ORDER BY created_at DESC`).all() as Invoice[]
}

// Atomic: increment amount_paid and derive status in a single transaction.
// No TOCTOU window — both writes happen or neither does.
export function applyPayment(id: string, amount: number): Invoice {
  return getDb().transaction((): Invoice => {
    getDb()
      .prepare(`UPDATE invoices SET amount_paid = amount_paid + ?, updated_at = datetime('now') WHERE id = ?`)
      .run(amount, id)

    const inv = findById(id)
    if (!inv) throw new Error(`Invoice ${id} not found`)

    const status: InvoiceStatus =
      inv.amountPaid >= inv.amountDue ? 'paid'
      : inv.amountPaid > 0            ? 'partial'
      :                                  'pending'

    getDb()
      .prepare(`UPDATE invoices SET status = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, id)

    return { ...inv, status }
  })()
}
