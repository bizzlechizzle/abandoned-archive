/**
 * Logging utilities for services
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: string;
  data?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  child(context: string): Logger;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let globalLogLevel: LogLevel = 'info';

/**
 * Set the global log level
 */
export function setLogLevel(level: LogLevel): void {
  globalLogLevel = level;
}

/**
 * Get the global log level
 */
export function getLogLevel(): LogLevel {
  return globalLogLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[globalLogLevel];
}

function formatMessage(entry: LogEntry): string {
  const timestamp = entry.timestamp.toISOString();
  const level = entry.level.toUpperCase().padEnd(5);
  const context = entry.context ? `[${entry.context}] ` : '';
  const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
  return `${timestamp} ${level} ${context}${entry.message}${data}`;
}

/**
 * Create a logger instance
 */
export function createLogger(context?: string): Logger {
  const log = (level: LogLevel, message: string, data?: Record<string, unknown>): void => {
    if (!shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
      data,
    };

    const formattedMessage = formatMessage(entry);

    switch (level) {
      case 'debug':
        console.debug(formattedMessage);
        break;
      case 'info':
        console.info(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        break;
    }
  };

  return {
    debug: (message, data) => log('debug', message, data),
    info: (message, data) => log('info', message, data),
    warn: (message, data) => log('warn', message, data),
    error: (message, data) => log('error', message, data),
    child: (childContext) => createLogger(context ? `${context}:${childContext}` : childContext),
  };
}

/**
 * Default logger instance
 */
export const logger = createLogger();
