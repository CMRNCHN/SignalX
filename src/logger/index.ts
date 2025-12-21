import * as fs from 'fs';
import { Logger, LoggingConfig } from '../core/types';
import { formatTimestamp } from '../core/utils';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class SimpleLogger implements Logger {
  private config: LoggingConfig;
  private moduleName: string;
  private writeStream?: fs.WriteStream;

  constructor(config: LoggingConfig, moduleName = 'app') {
    this.config = config;
    this.moduleName = moduleName;
    this.ensureLogDirectory();
    this.initializeWriteStream();
  }

  private ensureLogDirectory(): void {
    const logDir = this.config.file.substring(0, this.config.file.lastIndexOf('/'));
    if (logDir && !fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private initializeWriteStream(): void {
    try {
      this.writeStream = fs.createWriteStream(this.config.file, { flags: 'a' });
    } catch (error) {
      console.error('Failed to initialize log file stream:', error);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.level];
  }

  private formatMessage(level: LogLevel, message: string, args: unknown[]): string {
    const timestamp = formatTimestamp();
    const argsStr = args.length > 0 ? ' ' + args.map((a) => JSON.stringify(a)).join(' ') : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.moduleName}] ${message}${argsStr}`;
  }

  private writeLog(level: LogLevel, message: string, args: unknown[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, args);

    if (this.config.console) {
      const logFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      logFn(formattedMessage);
    }

    // Use async write stream for better performance
    if (this.writeStream) {
      this.writeStream.write(formattedMessage + '\n', (err) => {
        if (err) {
          console.error('Failed to write to log file:', err);
        }
      });
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.writeLog('debug', message, args);
  }

  info(message: string, ...args: unknown[]): void {
    this.writeLog('info', message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.writeLog('warn', message, args);
  }

  error(message: string, ...args: unknown[]): void {
    this.writeLog('error', message, args);
  }

  close(): void {
    if (this.writeStream) {
      this.writeStream.end();
    }
  }
}

export function createLogger(config: LoggingConfig, moduleName?: string): Logger {
  return new SimpleLogger(config, moduleName);
}
