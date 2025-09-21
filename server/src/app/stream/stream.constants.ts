import { z } from 'zod';
import { StreamType } from 'src/schemas/stream.schema';
import { Language } from 'src/db/schema/users';

export const streamParamsSchema = z
  .object({
    token: z.string(),
    type: z.nativeEnum(StreamType),
  })
  .and(
    z
      .discriminatedUnion('type', [
        z.object({
          type: z.literal(StreamType.MOVIE),
          imdbId: z.string().startsWith('tt').endsWith('.json'),
        }),
        z.object({
          type: z.literal(StreamType.TV_SHOW),
          imdbId: z.string().regex(/tt\d+:\d+:\d+/),
        }),
      ])
      .transform((data) => ({ ...data, imdbId: data.imdbId.replace('.json', '') })),
  );

export const languageEmojiMap: Record<Language, string> = {
  [Language.HU]: '🇭🇺',
  [Language.EN]: '🇬🇧',
};

export const cinemetaResponseSchema = z.object({
  meta: z.object({
    imdb_id: z.string(),
    name: z.string(),
    type: z.nativeEnum(StreamType),
  }),
});

export type CinemetaResponse = z.infer<typeof cinemetaResponseSchema>;
