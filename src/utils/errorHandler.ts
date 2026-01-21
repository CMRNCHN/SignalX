/**
 * Centralized error handling utilities
 * Provides user-friendly error messages and logging
 */

export interface AppError {
  message: string;
  code?: string;
  details?: any;
}

export function formatError(error: unknown): AppError {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: (error as any).code,
      details: (error as any).details,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return {
      message: String((error as any).message),
      code: (error as any).code,
      details: (error as any).details,
    };
  }

  return { message: 'An unknown error occurred' };
}

export function getUserFriendlyMessage(error: unknown): string {
  const appError = formatError(error);
  const msg = appError.message.toLowerCase();

  // Network errors
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('connection')) {
    return 'Connection error. Please check your internet connection.';
  }

  // Signal CLI errors
  if (msg.includes('signal-cli') || msg.includes('signal cli')) {
    return 'Signal CLI error. Please ensure Signal CLI is properly configured.';
  }

  // Permission errors
  if (msg.includes('permission') || msg.includes('unauthorized')) {
    return 'Permission denied. Please check your account settings.';
  }

  // Not found errors
  if (msg.includes('not found') || msg.includes('missing')) {
    return 'The requested item was not found.';
  }

  // Validation errors
  if (msg.includes('invalid') || msg.includes('validation')) {
    return 'Invalid input. Please check your entry and try again.';
  }

  // Return original message if no pattern matches
  return appError.message;
}

export function logError(error: unknown, context?: string): void {
  const appError = formatError(error);
  const contextStr = context ? `[${context}] ` : '';
  console.error(`${contextStr}Error:`, appError.message, appError.details || '');
}
