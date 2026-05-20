package services

import (
	"database/sql"
	"fmt"
	"os"
	"os/exec"
	"signalx/backend/database"
	"signalx/backend/models"
	"time"

	"github.com/google/uuid"
)

type SignalService struct {
	db *sql.DB
}

func NewSignalService() *SignalService {
	return &SignalService{db: database.Get()}
}

func (ss *SignalService) SendSignalMessage(phoneNumber, message string) error {
	cmd := exec.Command("signal-cli", "-u", os.Getenv("SIGNAL_PHONE"), "send", "-m", message, phoneNumber)
	return cmd.Run()
}

func (ss *SignalService) SendOrderConfirmation(customerID, orderID string) error {
	customer, err := NewCustomerService().GetCustomer(customerID)
	if err != nil {
		return err
	}

	order, err := NewOrderService().GetOrder(orderID)
	if err != nil {
		return err
	}

	message := fmt.Sprintf("Order %s confirmed. Amount: $%.2f", orderID[:8], order.TotalAmount)
	if err := ss.SendSignalMessage(customer.Phone, message); err != nil {
		return err
	}

	return ss.logSignalMessage(customerID, orderID, "order_confirmation", message)
}

func (ss *SignalService) SendInvoiceNotification(customerID, invoiceID string) error {
	customer, err := NewCustomerService().GetCustomer(customerID)
	if err != nil {
		return err
	}

	invoice, err := NewInvoiceService().GetInvoice(invoiceID)
	if err != nil {
		return err
	}

	message := fmt.Sprintf("Invoice %s issued. Amount due: $%.2f", invoice.InvoiceNumber, invoice.AmountDue)
	if err := ss.SendSignalMessage(customer.Phone, message); err != nil {
		return err
	}

	return ss.logSignalMessage(customerID, invoice.OrderID, "invoice_notification", message)
}

func (ss *SignalService) SendPaymentReminder(invoiceID, customerID string) error {
	customer, err := NewCustomerService().GetCustomer(customerID)
	if err != nil {
		return err
	}

	invoice, err := NewInvoiceService().GetInvoice(invoiceID)
	if err != nil {
		return err
	}

	remaining := invoice.AmountDue - invoice.AmountPaid
	message := fmt.Sprintf("Payment reminder for invoice %s. Amount due: $%.2f", invoice.InvoiceNumber, remaining)
	if err := ss.SendSignalMessage(customer.Phone, message); err != nil {
		return err
	}

	return ss.logSignalMessage(customerID, invoice.OrderID, "payment_reminder", message)
}

func (ss *SignalService) SendDeliveryNotification(orderID, customerID string) error {
	customer, err := NewCustomerService().GetCustomer(customerID)
	if err != nil {
		return err
	}

	message := fmt.Sprintf("Your order %s has been delivered. Thank you!", orderID[:8])
	if err := ss.SendSignalMessage(customer.Phone, message); err != nil {
		return err
	}

	return ss.logSignalMessage(customerID, orderID, "delivery_notification", message)
}

func (ss *SignalService) logSignalMessage(customerID, orderID, messageType, content string) error {
	messageID := uuid.New().String()
	_, err := ss.db.Exec(
		`INSERT INTO messages (id, customer_id, order_id, message_type, content, is_automated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		messageID, customerID, orderID, messageType, content, true, time.Now(),
	)
	return err
}

func (ss *SignalService) GetCustomerConversation(customerID string) ([]models.Message, error) {
	rows, err := ss.db.Query(
		`SELECT id, customer_id, order_id, message_type, content, is_automated, created_at FROM messages WHERE customer_id = ? ORDER BY created_at DESC`,
		customerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var messages []models.Message
	for rows.Next() {
		msg := models.Message{}
		if err := rows.Scan(&msg.ID, &msg.CustomerID, &msg.OrderID, &msg.MessageType, &msg.Content, &msg.IsAutomated, &msg.CreatedAt); err != nil {
			return nil, err
		}
		messages = append(messages, msg)
	}

	return messages, nil
}

func (ss *SignalService) ListConversations() (map[string][]models.Message, error) {
	rows, err := ss.db.Query(`SELECT DISTINCT customer_id FROM messages`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	conversations := make(map[string][]models.Message)
	for rows.Next() {
		var customerID string
		if err := rows.Scan(&customerID); err != nil {
			return nil, err
		}

		messages, err := ss.GetCustomerConversation(customerID)
		if err != nil {
			return nil, err
		}
		conversations[customerID] = messages
	}

	return conversations, nil
}
