import { ok, type Result } from 'neverthrow';
import { z } from 'zod';
import { StreamType } from '@/schemas/stream.schema';
import { env } from '@/env';
import type { CinemetaError } from '@/errors';
import { createCinemetaError } from '@/errors';

const cinemetaResponseSchema = z.object({
  meta: z.object({
    imdb_id: z.string(),
    name: z.string(),
    type: z.nativeEnum(StreamType),
  }),
});

type CinemetaResponse = z.infer<typeof cinemetaResponseSchema>;

export class CinemetaService {
  public async getMetadataByImdbId(
    type: StreamType,
    imdbId: string,
  ): Promise<Result<CinemetaResponse, CinemetaError>> {
    try {
      const cinemetaUrl = `${env.CINEMETA_URL}/meta/${type}/${imdbId}.json`;
      const response = await fetch(cinemetaUrl);
      if (!response.ok) {
        return createCinemetaError('Failed to fetch metadata from Cinemeta.', {
          status: response.status,
          url: cinemetaUrl,
        });
      }
      const respionseData = await response.json();
      const parseResult = cinemetaResponseSchema.safeParse(respionseData);
      if (parseResult.success) {
        return ok(parseResult.data);
      }
      return createCinemetaError('Invalid response from Cinemeta', parseResult.error);
    } catch (error) {
      return createCinemetaError('Error fetching metadata from Cinemeta', error);
    }
  }
}
