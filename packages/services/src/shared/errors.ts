/**
 * Custom error types for services
 */

// ============================================================================
// Base Error
// ============================================================================

export class ServiceError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode = 500,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

// ============================================================================
// Not Found Errors
// ============================================================================

export class NotFoundError extends ServiceError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404, { resource, id });
    this.name = 'NotFoundError';
  }
}

export class LocationNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('Location', id);
    this.name = 'LocationNotFoundError';
  }
}

export class MediaNotFoundError extends NotFoundError {
  constructor(hash: string) {
    super('Media', hash);
    this.name = 'MediaNotFoundError';
  }
}

// ============================================================================
// Validation Errors
// ============================================================================

export class ValidationError extends ServiceError {
  public readonly field?: string;
  public readonly value?: unknown;

  constructor(message: string, field?: string, value?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, { field, value });
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

export class InvalidInputError extends ValidationError {
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'InvalidInputError';
  }
}

export class InvalidCoordinatesError extends ValidationError {
  constructor(lat?: number, lon?: number) {
    super(
      `Invalid coordinates: lat=${lat}, lon=${lon}`,
      'coordinates',
      { lat, lon },
    );
    this.name = 'InvalidCoordinatesError';
  }
}

// ============================================================================
// Conflict Errors
// ============================================================================

export class ConflictError extends ServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

export class DuplicateError extends ConflictError {
  constructor(resource: string, identifier: string) {
    super(`${resource} already exists: ${identifier}`, { resource, identifier });
    this.name = 'DuplicateError';
  }
}

// ============================================================================
// Database Errors
// ============================================================================

export class DatabaseError extends ServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

export class DatabaseConnectionError extends DatabaseError {
  constructor(path: string, cause?: Error) {
    super(`Failed to connect to database: ${path}`, { path, cause: cause?.message });
    this.name = 'DatabaseConnectionError';
  }
}

export class DatabaseQueryError extends DatabaseError {
  constructor(query: string, cause?: Error) {
    super(`Database query failed: ${cause?.message}`, { query, cause: cause?.message });
    this.name = 'DatabaseQueryError';
  }
}

// ============================================================================
// External Service Errors
// ============================================================================

export class ExternalServiceError extends ServiceError {
  constructor(service: string, message: string, details?: Record<string, unknown>) {
    super(`${service} error: ${message}`, 'EXTERNAL_SERVICE_ERROR', 502, {
      service,
      ...details,
    });
    this.name = 'ExternalServiceError';
  }
}

export class GeocodingError extends ExternalServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('Geocoding', message, details);
    this.name = 'GeocodingError';
  }
}

export class ExifToolError extends ExternalServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('ExifTool', message, details);
    this.name = 'ExifToolError';
  }
}

export class FFmpegError extends ExternalServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('FFmpeg', message, details);
    this.name = 'FFmpegError';
  }
}

// ============================================================================
// File System Errors
// ============================================================================

export class FileSystemError extends ServiceError {
  constructor(message: string, path: string, details?: Record<string, unknown>) {
    super(message, 'FILE_SYSTEM_ERROR', 500, { path, ...details });
    this.name = 'FileSystemError';
  }
}

export class FileNotFoundError extends FileSystemError {
  constructor(path: string) {
    super(`File not found: ${path}`, path);
    this.name = 'FileNotFoundError';
  }
}

export class FileAccessError extends FileSystemError {
  constructor(path: string, operation: string) {
    super(`Cannot ${operation} file: ${path}`, path, { operation });
    this.name = 'FileAccessError';
  }
}

// ============================================================================
// Import Errors
// ============================================================================

export class ImportError extends ServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'IMPORT_ERROR', 400, details);
    this.name = 'ImportError';
  }
}

export class ImportSessionNotFoundError extends NotFoundError {
  constructor(sessionId: string) {
    super('Import session', sessionId);
    this.name = 'ImportSessionNotFoundError';
  }
}

// ============================================================================
// Queue Errors
// ============================================================================

export class QueueError extends ServiceError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'QUEUE_ERROR', 500, details);
    this.name = 'QueueError';
  }
}

export class JobNotFoundError extends NotFoundError {
  constructor(jobId: string) {
    super('Job', jobId);
    this.name = 'JobNotFoundError';
  }
}

// ============================================================================
// Error Helpers
// ============================================================================

/**
 * Type guard for ServiceError
 */
export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}

/**
 * Wrap unknown error in ServiceError
 */
export function wrapError(error: unknown, defaultMessage = 'An error occurred'): ServiceError {
  if (isServiceError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return new ServiceError(error.message, 'UNKNOWN_ERROR', 500, {
      originalName: error.name,
      stack: error.stack,
    });
  }
  return new ServiceError(defaultMessage, 'UNKNOWN_ERROR', 500, { error });
}
