import { ok, type Result } from 'neverthrow';
import parseRange from 'range-parser';
import type { RangeHeaderError } from '@/errors';
import { createRangeHeaderError } from '@/errors';

export const parseRangeHeader = (
  rangeHeader: string | undefined,
  fileSize: number,
  maxChunkSize?: number,
): Result<{ start: number; end: number }, RangeHeaderError> => {
  if (!rangeHeader) {
    rangeHeader = 'bytes=0-';
    // return createRangeHeaderError('Range header is missing', rangeHeader, fileSize);
  }
  const firstRangeString = rangeHeader.split('=')[1].split(',')[0].trim();

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

  const { start } = ranges[0];
  let { end } = ranges[0];

  if (maxChunkSize && end - start > maxChunkSize) {
    // If the range is open-ended, adjust the end to fit within maxChunkSize
    if (/^\d+-$/.test(firstRangeString)) {
      end = start + maxChunkSize;
    }
    // Otherwise, if the range is open-started (== `-500`, last 500 bytes),
    // then we don't adjust the start
  }

  return ok({ start, end });
};
