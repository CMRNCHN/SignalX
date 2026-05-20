package cmd

import (
	"encoding/json"
	"fmt"
	"signalx/backend/services"

	"github.com/spf13/cobra"
)

var customerCmd = &cobra.Command{
	Use:   "customer",
	Short: "Manage customers",
}

var customerCreateCmd = &cobra.Command{
	Use:   "create [name] [email] [phone] [address]",
	Short: "Create customer",
	Args:  cobra.ExactArgs(4),
	RunE: func(cmd *cobra.Command, args []string) error {
		cs := services.NewCustomerService()
		customer, err := cs.CreateCustomer(args[0], args[1], args[2], args[3])
		if err != nil {
			return err
		}
		fmt.Printf("Customer created: %s\n", customer.ID)
		return nil
	},
}

var customerListCmd = &cobra.Command{
	Use:   "list",
	Short: "List customers",
	RunE: func(cmd *cobra.Command, args []string) error {
		cs := services.NewCustomerService()
		customers, err := cs.ListCustomers()
		if err != nil {
			return err
		}
		data, _ := json.MarshalIndent(customers, "", "  ")
		fmt.Println(string(data))
		return nil
	},
}

var customerGetCmd = &cobra.Command{
	Use:   "get [id]",
	Short: "Get customer",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		cs := services.NewCustomerService()
		customer, err := cs.GetCustomer(args[0])
		if err != nil {
			return err
		}
		data, _ := json.MarshalIndent(customer, "", "  ")
		fmt.Println(string(data))
		return nil
	},
}

func init() {
	customerCmd.AddCommand(customerCreateCmd, customerListCmd, customerGetCmd)
}
