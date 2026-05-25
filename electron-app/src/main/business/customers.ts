import { v4 as uuid } from 'uuid'
import * as db from '../db/customers'
import type { Customer } from '@shared/types'

export function createCustomer(args: {
  name: string
  email: string
  phone: string
  address: string
}): Customer {
  if (!args.name.trim()) throw new Error('Customer name is required')
  if (!args.phone.trim()) throw new Error('Customer phone is required')

  return db.insert({
    id: uuid(),
    name: args.name.trim(),
    email: args.email.trim(),
    phone: args.phone.trim(),
    address: args.address.trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
}

export function listCustomers(): Customer[] {
  return db.findAll()
}

export function getCustomer(id: string): Customer {
  const c = db.findById(id)
  if (!c) throw new Error(`Customer ${id} not found`)
  return c
}
