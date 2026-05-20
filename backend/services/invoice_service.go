package services

import (
	"database/sql"
	"fmt"
	"signalx/backend/database"
	"signalx/backend/models"
	"time"

	"github.com/google/uuid"
)

type InvoiceService struct {
	db *sql.DB
}

func NewInvoiceService() *InvoiceService {
	return &InvoiceService{db: database.Get()}
}

func (is *InvoiceService) CreateInvoice(orderID string) (*models.Invoice, error) {
	invoiceID := uuid.New().String()
	invoiceNumber := fmt.Sprintf("INV-%d", time.Now().Unix())

	var amountDue float64
	err := is.db.QueryRow(`SELECT total_amount FROM orders WHERE id = ?`, orderID).Scan(&amountDue)
	if err != nil {
		return nil, err
	}

	invoice := &models.Invoice{
		ID:            invoiceID,
		OrderID:       orderID,
		InvoiceNumber: invoiceNumber,
		AmountDue:     amountDue,
		AmountPaid:    0,
		Status:        "pending",
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	_, err = is.db.Exec(
		`INSERT INTO invoices (id, order_id, invoice_number, amount_due, status) VALUES (?, ?, ?, ?, ?)`,
		invoice.ID, invoice.OrderID, invoice.InvoiceNumber, invoice.AmountDue, invoice.Status,
	)
	if err != nil {
		return nil, err
	}

	return invoice, nil
}

func (is *InvoiceService) GetInvoice(invoiceID string) (*models.Invoice, error) {
	invoice := &models.Invoice{}
	err := is.db.QueryRow(
		`SELECT id, order_id, invoice_number, amount_due, amount_paid, status, due_date, created_at, updated_at FROM invoices WHERE id = ?`,
		invoiceID,
	).Scan(&invoice.ID, &invoice.OrderID, &invoice.InvoiceNumber, &invoice.AmountDue, &invoice.AmountPaid, &invoice.Status, &invoice.DueDate, &invoice.CreatedAt, &invoice.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return invoice, nil
}

func (is *InvoiceService) ListInvoices() ([]models.Invoice, error) {
	rows, err := is.db.Query(`SELECT id, order_id, invoice_number, amount_due, amount_paid, status, due_date, created_at, updated_at FROM invoices ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invoices []models.Invoice
	for rows.Next() {
		invoice := models.Invoice{}
		if err := rows.Scan(&invoice.ID, &invoice.OrderID, &invoice.InvoiceNumber, &invoice.AmountDue, &invoice.AmountPaid, &invoice.Status, &invoice.DueDate, &invoice.CreatedAt, &invoice.UpdatedAt); err != nil {
			return nil, err
		}
		invoices = append(invoices, invoice)
	}

	return invoices, nil
}

func (is *InvoiceService) RecordPayment(invoiceID string, amount float64) error {
	_, err := is.db.Exec(
		`UPDATE invoices SET amount_paid = amount_paid + ?, updated_at = ? WHERE id = ?`,
		amount, time.Now(), invoiceID,
	)
	if err != nil {
		return err
	}

	var amountDue, amountPaid float64
	err = is.db.QueryRow(`SELECT amount_due, amount_paid FROM invoices WHERE id = ?`, invoiceID).Scan(&amountDue, &amountPaid)
	if err != nil {
		return err
	}

	status := "pending"
	if amountPaid >= amountDue {
		status = "paid"
	}

	_, err = is.db.Exec(`UPDATE invoices SET status = ? WHERE id = ?`, status, invoiceID)
	return err
}
