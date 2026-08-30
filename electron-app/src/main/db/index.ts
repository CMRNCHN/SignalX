import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'

let db: Database.Database

export function initDb(): void {
  const dbPath = path.join(app.getPath('userData'), 'signalx.db')
  db = new Database(dbPath)

  // WAL mode: readers don't block writers, writers don't block readers
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // Return enough time for any write to complete before giving up
  db.pragma('busy_timeout = 5000')

  runMigrations()
}

export function getDb(): Database.Database {
  if (!db) throw new Error('DB not initialized — call initDb() first')
  return db
}

// ---------------------------------------------------------------------------
// Migration runner
// Each entry is [name, sql]. Names must be stable — they're the idempotency key.
// ---------------------------------------------------------------------------

function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id   INTEGER PRIMARY KEY,
      name TEXT    NOT NULL UNIQUE,
      ran_at TEXT  NOT NULL DEFAULT (datetime('now'))
    )
  `)

  const applied = new Set(
    (db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map((r) => r.name)
  )

  for (const [name, sql] of MIGRATIONS) {
    if (applied.has(name)) continue
    db.transaction(() => {
      db.exec(sql)
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name)
    })()
  }
}

const MIGRATIONS: [string, string][] = [
  [
    '001_initial',
    `
    CREATE TABLE customers (
      id         TEXT NOT NULL PRIMARY KEY,
      name       TEXT NOT NULL,
      email      TEXT UNIQUE,
      phone      TEXT NOT NULL,
      address    TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE orders (
      id           TEXT NOT NULL PRIMARY KEY,
      customer_id  TEXT NOT NULL REFERENCES customers(id),
      status       TEXT NOT NULL DEFAULT 'pending',
      total_amount REAL NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX orders_customer_idx ON orders(customer_id);
    CREATE INDEX orders_created_idx  ON orders(created_at);

    CREATE TABLE invoices (
      id             TEXT NOT NULL PRIMARY KEY,
      order_id       TEXT NOT NULL UNIQUE REFERENCES orders(id),
      invoice_number TEXT NOT NULL UNIQUE,
      amount_due     REAL NOT NULL,
      amount_paid    REAL NOT NULL DEFAULT 0,
      status         TEXT NOT NULL DEFAULT 'pending',
      due_date       TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE messages (
      id           TEXT    NOT NULL PRIMARY KEY,
      customer_id  TEXT    NOT NULL REFERENCES customers(id),
      order_id     TEXT    REFERENCES orders(id),
      message_type TEXT    NOT NULL,
      content      TEXT    NOT NULL,
      is_automated INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX messages_customer_idx ON messages(customer_id);
    CREATE INDEX messages_created_idx  ON messages(created_at);
    `
  ]
]
