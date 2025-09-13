import { err, type Result } from 'neverthrow';

interface ErrorDetails {
  type: string;
  message: string;
  details?: Record<string, unknown>;
}

export enum ErrorType {
  CinemetaError = 'CinemetaError',
  MissingConfigError = 'MissingConfigError',
  UnknownError = 'UnknownError',
  UnauthenticatedError = 'UnauthenticatedError',
  UnauthorizedError = 'UnauthorizedError',
  TorrentDownloadError = 'TorrentDownloadError',
  NcoreError = 'NcoreError',
  TorrentServerError = 'TorrentServerError',

  /** When an error occurs during torrent deletion */
  TorrentDeleteError = 'TorrentDeleteError',

  RangeHeaderError = 'RangeHeaderError',
}

export interface CinemetaError {
  type: ErrorType.CinemetaError;
  message: string;
  originalError?: unknown;
  response?: Response;
}

export interface MissingConfigError extends ErrorDetails {
  type: ErrorType.MissingConfigError;
}

export interface UnknownError extends ErrorDetails {
  type: ErrorType.UnknownError;
  error: unknown;
}

export interface UnauthenticatedError {
  type: ErrorType.UnauthenticatedError;
}

export interface UnauthorizedError extends ErrorDetails {
  type: ErrorType.UnauthorizedError;
}

export interface TorrentDownloadError extends ErrorDetails {
  type: ErrorType.TorrentDownloadError;
  details: Record<string, string>;
}

export interface NcoreError extends ErrorDetails {
  type: ErrorType.NcoreError;
  details: Record<string, unknown>;
}

export interface TorrentServerError extends ErrorDetails {
  type: ErrorType.TorrentServerError;
  error: unknown;
}

export interface TorrentDeleteError {
  type: ErrorType.TorrentDeleteError;
  infoHash: string;
  path: string;
  originalError?: unknown;
}

export interface RangeHeaderError {
  type: ErrorType.RangeHeaderError;
  message: string;
  rangeHeader: string | undefined;
  fileSize: number;
}

export type AppError =
  | CinemetaError
  | MissingConfigError
  | UnknownError
  | UnauthenticatedError
  | UnauthorizedError
  | TorrentDownloadError
  | NcoreError
  | TorrentServerError
  | TorrentDeleteError;

function createErrorGenerator<T extends AppError>(type: T['type']) {
  return (data: Omit<T, 'type'>): Result<never, T> => {
    return err({
      type,
      ...data,
    } as T);
  };
}

export const createCinemetaError = createErrorGenerator<CinemetaError>(
  ErrorType.CinemetaError,
);
export const createMissingConfigError = createErrorGenerator<MissingConfigError>(
  ErrorType.MissingConfigError,
);
export const createUnauthenticatedError = createErrorGenerator<UnauthenticatedError>(
  ErrorType.UnauthenticatedError,
);

export function createUnauthorizedError(
  message: string,
): Result<never, UnauthorizedError> {
  return err({
    type: ErrorType.UnauthorizedError,
    message,
  });
}

export function createUnknownError(
  message: string,
  error?: unknown,
): Result<never, UnknownError> {
  return err({
    type: ErrorType.UnknownError,
    message,
    error,
  });
}

export function createTorrentDownloadError(
  message: string,
  {
    details,
    error,
  }: {
    error: unknown;
    details: Record<string, string>;
  },
): Result<never, TorrentDownloadError> {
  return err({
    type: ErrorType.TorrentDownloadError,
    message,
    details,
    error,
  });
}

export function createNcoreError(
  message: string,
  details: Record<string, unknown>,
): Result<never, NcoreError> {
  return err({
    type: ErrorType.NcoreError,
    message,
    details,
  });
}

export function createTorrentServerError(
  message: string,
  error: unknown,
): Result<never, TorrentServerError> {
  return err({
    type: ErrorType.TorrentServerError,
    message,
    error,
  });
}

export function createRangeHeaderError(
  message: string,
  rangeHeader: string | undefined,
  fileSize: number,
): Result<never, RangeHeaderError> {
  return err({
    type: ErrorType.RangeHeaderError,
    message,
    rangeHeader,
    fileSize,
  });
}

export const createTorrentDeleteError = createErrorGenerator<TorrentDeleteError>(
  ErrorType.TorrentDeleteError,
);
