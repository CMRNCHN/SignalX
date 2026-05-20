package cmd

import (
	"encoding/json"
	"fmt"
	"signalx/backend/services"
	"strconv"

	"github.com/spf13/cobra"
)

var orderCmd = &cobra.Command{
	Use:   "order",
	Short: "Manage orders",
}

var orderCreateCmd = &cobra.Command{
	Use:   "create [customer_id] [amount]",
	Short: "Create order",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		amount, _ := strconv.ParseFloat(args[1], 64)
		os := services.NewOrderService()
		order, err := os.CreateOrder(args[0], amount)
		if err != nil {
			return err
		}
		fmt.Printf("Order created: %s\n", order.ID)
		return nil
	},
}

var orderListCmd = &cobra.Command{
	Use:   "list",
	Short: "List orders",
	RunE: func(cmd *cobra.Command, args []string) error {
		os := services.NewOrderService()
		orders, err := os.ListOrders()
		if err != nil {
			return err
		}
		data, _ := json.MarshalIndent(orders, "", "  ")
		fmt.Println(string(data))
		return nil
	},
}

var orderGetCmd = &cobra.Command{
	Use:   "get [id]",
	Short: "Get order",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		os := services.NewOrderService()
		order, err := os.GetOrder(args[0])
		if err != nil {
			return err
		}
		data, _ := json.MarshalIndent(order, "", "  ")
		fmt.Println(string(data))
		return nil
	},
}

var orderStatusCmd = &cobra.Command{
	Use:   "status [id] [status]",
	Short: "Update order status",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		os := services.NewOrderService()
		if err := os.UpdateOrderStatus(args[0], args[1]); err != nil {
			return err
		}
		fmt.Printf("Order %s status: %s\n", args[0], args[1])
		return nil
	},
}

func init() {
	orderCmd.AddCommand(orderCreateCmd, orderListCmd, orderGetCmd, orderStatusCmd)
}
