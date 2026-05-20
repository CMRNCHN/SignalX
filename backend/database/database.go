package database

import (
	"database/sql"
	"fmt"
	"signalx/backend/config"

	_ "github.com/mattn/go-sqlite3"
)

var db *sql.DB

func Initialize() error {
	var err error
	db, err = sql.Open("sqlite3", config.GetDBPath())
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	if err := createSchema(); err != nil {
		return fmt.Errorf("failed to create schema: %w", err)
	}

	return nil
}

func Get() *sql.DB {
	return db
}

func Close() error {
	if db != nil {
		return db.Close()
	}
	return nil
}

func createSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS customers (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		email TEXT UNIQUE,
		phone TEXT,
		address TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS products (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		description TEXT,
		sku TEXT UNIQUE,
		price REAL NOT NULL,
		quantity_in_stock INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS orders (
		id TEXT PRIMARY KEY,
		customer_id TEXT NOT NULL,
		status TEXT DEFAULT 'pending',
		total_amount REAL NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (customer_id) REFERENCES customers(id)
	);

	CREATE TABLE IF NOT EXISTS invoices (
		id TEXT PRIMARY KEY,
		order_id TEXT NOT NULL UNIQUE,
		invoice_number TEXT UNIQUE,
		amount_due REAL NOT NULL,
		amount_paid REAL DEFAULT 0,
		status TEXT DEFAULT 'pending',
		due_date DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (order_id) REFERENCES orders(id)
	);

	CREATE TABLE IF NOT EXISTS feedback (
		id TEXT PRIMARY KEY,
		customer_id TEXT NOT NULL,
		order_id TEXT,
		rating INTEGER,
		message TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (customer_id) REFERENCES customers(id),
		FOREIGN KEY (order_id) REFERENCES orders(id)
	);

	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		customer_id TEXT NOT NULL,
		order_id TEXT,
		message_type TEXT,
		content TEXT,
		is_automated BOOLEAN DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (customer_id) REFERENCES customers(id),
		FOREIGN KEY (order_id) REFERENCES orders(id)
	);
	`

	_, err := db.Exec(schema)
	return err
}
