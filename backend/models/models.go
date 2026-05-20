package models

import "time"

type Customer struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	Phone     string    `json:"phone"`
	Address   string    `json:"address"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Order struct {
	ID          string    `json:"id"`
	CustomerID  string    `json:"customer_id"`
	Status      string    `json:"status"`
	TotalAmount float64   `json:"total_amount"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Invoice struct {
	ID            string     `json:"id"`
	OrderID       string     `json:"order_id"`
	InvoiceNumber string     `json:"invoice_number"`
	AmountDue     float64    `json:"amount_due"`
	AmountPaid    float64    `json:"amount_paid"`
	Status        string     `json:"status"`
	DueDate       *time.Time `json:"due_date,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type Feedback struct {
	ID         string    `json:"id"`
	CustomerID string    `json:"customer_id"`
	OrderID    *string   `json:"order_id,omitempty"`
	Rating     *int      `json:"rating,omitempty"`
	Message    string    `json:"message"`
	CreatedAt  time.Time `json:"created_at"`
}
