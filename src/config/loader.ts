import * as fs from 'fs';
import { Config } from '../core/types';

const DEFAULT_CONFIG: Config = {
  app: {
    name: 'SignalX',
    version: '0.1.0',
    environment: 'development',
  },
  logging: {
    level: 'info',
    file: './logs/signalx.log',
    console: true,
  },
  modules: {
    messaging: {
      enabled: true,
      config: {},
    },
    routing: {
      enabled: true,
      config: {},
    },
    permissions: {
      enabled: true,
      config: {},
    },
  },
};

export class ConfigLoader {
  private config: Config;
  private configPath?: string;

  constructor(configPath?: string) {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    let config: Config = { ...DEFAULT_CONFIG };

    // Try to load from file if path is provided
    if (this.configPath && fs.existsSync(this.configPath)) {
      try {
        const fileContent = fs.readFileSync(this.configPath, 'utf-8');
        const fileConfig = JSON.parse(fileContent);
        config = this.mergeConfig(config, fileConfig);
      } catch (error) {
        console.error(`Failed to load config from ${this.configPath}:`, error);
      }
    }

    // Override with environment variables
    config = this.applyEnvironmentVariables(config);

    return config;
  }

  private mergeConfig(base: Config, override: Partial<Config>): Config {
    return {
      app: { ...base.app, ...override.app },
      logging: { ...base.logging, ...override.logging },
      modules: {
        messaging: { ...base.modules.messaging, ...override.modules?.messaging },
        routing: { ...base.modules.routing, ...override.modules?.routing },
        permissions: { ...base.modules.permissions, ...override.modules?.permissions },
      },
    };
  }

  private applyEnvironmentVariables(config: Config): Config {
    const result = { ...config };

    if (process.env.SIGNALX_ENV) {
      result.app.environment = process.env.SIGNALX_ENV as 'development' | 'production' | 'test';
    }

    if (process.env.SIGNALX_LOG_LEVEL) {
      result.logging.level = process.env.SIGNALX_LOG_LEVEL as
        | 'debug'
        | 'info'
        | 'warn'
        | 'error';
    }

    if (process.env.SIGNALX_LOG_FILE) {
      result.logging.file = process.env.SIGNALX_LOG_FILE;
    }

    return result;
  }

  public getConfig(): Config {
    return this.config;
  }

  public reload(): void {
    this.config = this.loadConfig();
  }

  public static getDefaultConfig(): Config {
    return { ...DEFAULT_CONFIG };
  }
}

export function loadConfig(configPath?: string): Config {
  const loader = new ConfigLoader(configPath);
  return loader.getConfig();
}
