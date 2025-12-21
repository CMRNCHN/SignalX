/**
 * Core type definitions for SignalX
 */

export interface Config {
  app: AppConfig;
  logging: LoggingConfig;
  modules: ModulesConfig;
}

export interface AppConfig {
  name: string;
  version: string;
  environment: 'development' | 'production' | 'test';
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  file: string;
  console: boolean;
}

export interface ModulesConfig {
  messaging: ModuleConfig;
  routing: ModuleConfig;
  permissions: ModuleConfig;
}

export interface ModuleConfig {
  enabled: boolean;
  config?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export interface Module {
  name: string;
  initialize(config: ModuleConfig, logger: Logger): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
