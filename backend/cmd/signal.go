package cmd

import (
	"encoding/json"
	"fmt"
	"signalx/backend/services"

	"github.com/spf13/cobra"
)

var signalCmd = &cobra.Command{
	Use:   "signal",
	Short: "Manage Signal messaging",
}

var signalConversationCmd = &cobra.Command{
	Use:   "conversation [customer_id]",
	Short: "Get customer conversation",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		ss := services.NewSignalService()
		messages, err := ss.GetCustomerConversation(args[0])
		if err != nil {
			return err
		}
		data, _ := json.MarshalIndent(messages, "", "  ")
		fmt.Println(string(data))
		return nil
	},
}

var signalListCmd = &cobra.Command{
	Use:   "list",
	Short: "List all conversations",
	RunE: func(cmd *cobra.Command, args []string) error {
		ss := services.NewSignalService()
		conversations, err := ss.ListConversations()
		if err != nil {
			return err
		}
		data, _ := json.MarshalIndent(conversations, "", "  ")
		fmt.Println(string(data))
		return nil
	},
}

var signalSendCmd = &cobra.Command{
	Use:   "send [phone] [message]",
	Short: "Send Signal message",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		ss := services.NewSignalService()
		if err := ss.SendSignalMessage(args[0], args[1]); err != nil {
			return err
		}
		fmt.Println("Message sent")
		return nil
	},
}

func init() {
	signalCmd.AddCommand(signalConversationCmd, signalListCmd, signalSendCmd)
	rootCmd.AddCommand(signalCmd)
}
