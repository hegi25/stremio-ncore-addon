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
  UserServiceError = 'UserServiceError',
  RangeHeaderError = 'RangeHeaderError',
}

export interface CinemetaError extends ErrorDetails {
  type: ErrorType.CinemetaError;
  error: unknown;
}

export interface MissingConfigError extends ErrorDetails {
  type: ErrorType.MissingConfigError;
}

export interface UnknownError extends ErrorDetails {
  type: ErrorType.UnknownError;
  error: unknown;
}

export interface UnauthenticatedError extends ErrorDetails {
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

export interface UserServiceError extends ErrorDetails {
  type: ErrorType.UserServiceError;
  error: unknown;
}

export interface RangeHeaderError {
  type: ErrorType.RangeHeaderError;
  message: string;
  rangeHeader: string | undefined;
  fileSize: number;
  maxChunkSize?: number;
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
  | UserServiceError;

export function createCinemetaError(
  message: string,
  error: unknown,
): Result<never, CinemetaError> {
  return err({
    type: ErrorType.CinemetaError,
    message,
    error,
  });
}

export function createMissingConfigError(
  message: string,
): Result<never, MissingConfigError> {
  return err({
    type: ErrorType.MissingConfigError,
    message,
  });
}

export function createUnauthenticatedError(
  message: string,
): Result<never, UnauthenticatedError> {
  return err({
    type: ErrorType.UnauthenticatedError,
    message,
  });
}

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

export function createUserServiceError(
  message: string,
  error: unknown,
): Result<never, UserServiceError> {
  return err({
    type: ErrorType.UserServiceError,
    message,
    error,
  });
}

export function createRangeHeaderError(
  message: string,
  rangeHeader: string | undefined,
  fileSize: number,
  maxChunkSize?: number,
): Result<never, RangeHeaderError> {
  return err({
    type: ErrorType.RangeHeaderError,
    message,
    rangeHeader,
    fileSize,
    maxChunkSize,
  });
}
