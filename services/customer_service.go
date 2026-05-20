package services

import (
	"database/sql"
	"signalx/backend/database"
	"signalx/backend/models"
	"time"

	"github.com/google/uuid"
)

type CustomerService struct {
	db *sql.DB
}

func NewCustomerService() *CustomerService {
	return &CustomerService{db: database.Get()}
}

func (cs *CustomerService) CreateCustomer(name, email, phone, address string) (*models.Customer, error) {
	customerID := uuid.New().String()
	customer := &models.Customer{
		ID:        customerID,
		Name:      name,
		Email:     email,
		Phone:     phone,
		Address:   address,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	_, err := cs.db.Exec(
		`INSERT INTO customers (id, name, email, phone, address) VALUES (?, ?, ?, ?, ?)`,
		customer.ID, customer.Name, customer.Email, customer.Phone, customer.Address,
	)
	if err != nil {
		return nil, err
	}

	return customer, nil
}

func (cs *CustomerService) GetCustomer(customerID string) (*models.Customer, error) {
	customer := &models.Customer{}
	err := cs.db.QueryRow(
		`SELECT id, name, email, phone, address, created_at, updated_at FROM customers WHERE id = ?`,
		customerID,
	).Scan(&customer.ID, &customer.Name, &customer.Email, &customer.Phone, &customer.Address, &customer.CreatedAt, &customer.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return customer, nil
}

func (cs *CustomerService) ListCustomers() ([]models.Customer, error) {
	rows, err := cs.db.Query(`SELECT id, name, email, phone, address, created_at, updated_at FROM customers ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var customers []models.Customer
	for rows.Next() {
		customer := models.Customer{}
		if err := rows.Scan(&customer.ID, &customer.Name, &customer.Email, &customer.Phone, &customer.Address, &customer.CreatedAt, &customer.UpdatedAt); err != nil {
			return nil, err
		}
		customers = append(customers, customer)
	}

	return customers, nil
}

func (cs *CustomerService) UpdateCustomer(customer *models.Customer) error {
	_, err := cs.db.Exec(
		`UPDATE customers SET name = ?, email = ?, phone = ?, address = ?, updated_at = ? WHERE id = ?`,
		customer.Name, customer.Email, customer.Phone, customer.Address, time.Now(), customer.ID,
	)
	return err
}
