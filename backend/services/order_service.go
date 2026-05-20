package services

import (
	"database/sql"
	"signalx/backend/database"
	"signalx/backend/models"
	"time"

	"github.com/google/uuid"
)

type OrderService struct {
	db *sql.DB
}

func NewOrderService() *OrderService {
	return &OrderService{db: database.Get()}
}

func (os *OrderService) CreateOrder(customerID string, totalAmount float64) (*models.Order, error) {
	orderID := uuid.New().String()
	order := &models.Order{
		ID:          orderID,
		CustomerID:  customerID,
		Status:      "pending",
		TotalAmount: totalAmount,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	_, err := os.db.Exec(
		`INSERT INTO orders (id, customer_id, status, total_amount) VALUES (?, ?, ?, ?)`,
		order.ID, order.CustomerID, order.Status, order.TotalAmount,
	)
	if err != nil {
		return nil, err
	}

	return order, nil
}

func (os *OrderService) GetOrder(orderID string) (*models.Order, error) {
	order := &models.Order{}
	err := os.db.QueryRow(
		`SELECT id, customer_id, status, total_amount, created_at, updated_at FROM orders WHERE id = ?`,
		orderID,
	).Scan(&order.ID, &order.CustomerID, &order.Status, &order.TotalAmount, &order.CreatedAt, &order.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return order, nil
}

func (os *OrderService) ListOrders() ([]models.Order, error) {
	rows, err := os.db.Query(`SELECT id, customer_id, status, total_amount, created_at, updated_at FROM orders ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var orders []models.Order
	for rows.Next() {
		order := models.Order{}
		if err := rows.Scan(&order.ID, &order.CustomerID, &order.Status, &order.TotalAmount, &order.CreatedAt, &order.UpdatedAt); err != nil {
			return nil, err
		}
		orders = append(orders, order)
	}

	return orders, nil
}

func (os *OrderService) UpdateOrderStatus(orderID, status string) error {
	_, err := os.db.Exec(
		`UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`,
		status, time.Now(), orderID,
	)
	return err
}
