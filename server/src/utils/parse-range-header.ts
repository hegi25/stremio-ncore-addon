import { ok, type Result } from 'neverthrow';
import parseRange from 'range-parser';
import type { RangeHeaderError } from '@/errors';
import { createRangeHeaderError } from '@/errors';

export const parseRangeHeader = (
  rangeHeader: string | undefined,
  fileSize: number,
): Result<{ start: number; end: number }, RangeHeaderError> => {
  if (!rangeHeader) {
    rangeHeader = 'bytes=0-';
  }
  const ranges = parseRange(fileSize, rangeHeader);
  if (ranges === -1) {
    return createRangeHeaderError('Malformed range header', rangeHeader, fileSize);
  }
  if (ranges === -2) {
    return createRangeHeaderError('Unsatisfiable range header', rangeHeader, fileSize);
  }
  if (ranges.length === 0) {
    return createRangeHeaderError(
      'No valid ranges found in range header',
      rangeHeader,
      fileSize,
    );
  }

  const { start, end } = ranges[0];

  return ok({ start, end });
};
