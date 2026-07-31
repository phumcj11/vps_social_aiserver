/**
 * Structured application errors. Handlers throw these; a single error handler
 * translates them into consistent JSON responses. Messages are safe to return
 * to clients (no secrets, no internal detail).
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errors = {
  validation: (message = 'Invalid request') => new AppError(400, 'validation_error', message),
  unauthorized: (message = 'Authentication required') => new AppError(401, 'unauthorized', message),
  // Generic, non-enumerating credentials error (never reveals which field failed).
  invalidCredentials: () => new AppError(401, 'invalid_credentials', 'Invalid email or password'),
  forbidden: (message = 'Forbidden') => new AppError(403, 'forbidden', message),
  notFound: (code: string, message: string) => new AppError(404, code, message),
  conflict: (code: string, message: string) => new AppError(409, code, message),
  csrf: () => new AppError(403, 'csrf_check_failed', 'Cross-origin request rejected'),
} as const;
