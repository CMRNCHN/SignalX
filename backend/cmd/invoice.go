package cmd

import (
	"encoding/json"
	"fmt"
	"signalx/backend/services"
	"strconv"

	"github.com/spf13/cobra"
)

var invoiceCmd = &cobra.Command{
	Use:   "invoice",
	Short: "Manage invoices",
}

var invoiceCreateCmd = &cobra.Command{
	Use:   "create [order_id]",
	Short: "Create invoice",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		is := services.NewInvoiceService()
		invoice, err := is.CreateInvoice(args[0])
		if err != nil {
			return err
		}
		fmt.Printf("Invoice created: %s\n", invoice.ID)
		return nil
	},
}

var invoiceListCmd = &cobra.Command{
	Use:   "list",
	Short: "List invoices",
	RunE: func(cmd *cobra.Command, args []string) error {
		is := services.NewInvoiceService()
		invoices, err := is.ListInvoices()
		if err != nil {
			return err
		}
		data, _ := json.MarshalIndent(invoices, "", "  ")
		fmt.Println(string(data))
		return nil
	},
}

var invoiceGetCmd = &cobra.Command{
	Use:   "get [id]",
	Short: "Get invoice",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		is := services.NewInvoiceService()
		invoice, err := is.GetInvoice(args[0])
		if err != nil {
			return err
		}
		data, _ := json.MarshalIndent(invoice, "", "  ")
		fmt.Println(string(data))
		return nil
	},
}

var invoicePayCmd = &cobra.Command{
	Use:   "pay [id] [amount]",
	Short: "Record payment",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		amount, _ := strconv.ParseFloat(args[1], 64)
		is := services.NewInvoiceService()
		if err := is.RecordPayment(args[0], amount); err != nil {
			return err
		}
		fmt.Printf("Payment recorded: $%.2f\n", amount)
		return nil
	},
}

func init() {
	invoiceCmd.AddCommand(invoiceCreateCmd, invoiceListCmd, invoiceGetCmd, invoicePayCmd)
}
