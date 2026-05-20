package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/viper"
)

var (
	DBPath string
	AppDir string
)

func Load() error {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	AppDir = filepath.Join(homeDir, ".signalx")
	if err := os.MkdirAll(AppDir, 0700); err != nil {
		return fmt.Errorf("failed to create app directory: %w", err)
	}

	DBPath = filepath.Join(AppDir, "signalx.db")

	viper.SetDefault("db_path", DBPath)
	viper.SetDefault("server_port", 8080)
	viper.SetDefault("server_host", "127.0.0.1")

	return nil
}

func GetDBPath() string {
	return DBPath
}

func GetAppDir() string {
	return AppDir
}
