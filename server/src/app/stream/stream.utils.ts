import type { Stream } from 'stremio-addon-sdk';
import type { TorrentDetails, TorrentFileDetails } from '../torrent/torrent.types';
import type { CinemetaResponse } from './stream.constants';
import { cinemetaResponseSchema, languageEmojiMap } from './stream.constants';
import type { StreamType } from '@/schemas/stream.schema';
import { env } from '@/env';
import type { Resolution } from '@/db/schema/users';
import { Language } from '@/db/schema/users';
import { rateList } from '@/utils/rate-list';
import { formatBytes } from '@/utils/bytes';

export async function getCinemetaData(
  type: StreamType,
  imdbId: string,
): Promise<CinemetaResponse> {
  try {
    const cinemetaUrl = `${env.CINEMETA_URL}/meta/${type}/${imdbId}.json`;
    const response = await fetch(cinemetaUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch metadata from Cinemeta.', { cause: response });
    }
    const respionseData = await response.json();
    const parseResult = cinemetaResponseSchema.safeParse(respionseData);
    if (parseResult.success) {
      return parseResult.data;
    }
    throw new Error('Invalid response from Cinemeta', { cause: parseResult.error });
  } catch (error) {
    throw new Error('Error fetching metadata from Cinemeta', { cause: error });
  }
}

export function orderTorrents<T extends TorrentDetails>({
  torrents,
  preferences: { preferredLanguage, preferredResolutions },
  type,
  season,
  episode,
}: {
  torrents: T[];
  preferences: {
    preferredLanguage: Language;
    preferredResolutions: Resolution[];
  };
  type: StreamType;
  season: string;
  episode: string;
}): T[] {
  return rateList(torrents, [
    (torrent) => (preferredLanguage === torrent.getLanguage() ? 3 : 0),
    (torrent) => {
      // By this point, we have filtered out torrents where the searched file is not found
      const file = torrent.getSearchedFile({
        season,
        episode,
        type,
      }) as TorrentFileDetails;
      const resolution = torrent.getFileResolution(file.name);
      return preferredResolutions.includes(resolution) ? 2 : 0;
    },
  ]);
}

export function convertTorrentToStream({
  torrent,
  token,
  file,
  isRecommended,
  addonUrl,
  preferredLanguage,
}: {
  torrent: TorrentDetails;
  token: string;
  file: TorrentFileDetails;
  isRecommended: boolean;
  preferredLanguage: Language;
  addonUrl: string;
}): Stream {
  const languageEmoji = languageEmojiMap[torrent.getLanguage()];
  const fileSizeString = formatBytes(file.length);

  let recommendedLine = '';
  if (isRecommended && !torrent.isSpeculated) {
    switch (preferredLanguage) {
      case Language.HU:
        recommendedLine = '⭐️ Ajánlott\n';
        break;
      default:
        recommendedLine = '⭐️ Recommended\n';
    }
  }

  let warningLine = '';
  if (torrent.isSpeculated) {
    switch (preferredLanguage) {
      case Language.HU:
        warningLine = `⚠️ Bizonytalan forrás ⚠️\nEz lehet egy másik torrent!\n`;
        break;
      default:
        warningLine = `⚠️ Speculated source ⚠️\nThis might be a different torrent!\n`;
    }
  }
  const typeLine = `${languageEmoji} | ${torrent.displayResolution(torrent.getFileResolution(file.name))} | ${fileSizeString}\n`;
  const title = `${file.name}\n`;
  const seeders = `⬆️ ${torrent.getSeeders()}\n`;
  const description = warningLine + recommendedLine + typeLine + title + seeders;

  return {
    infoHash: torrent.infoHash,
    url: `${addonUrl}/api/auth/${token}/stream/${torrent.sourceName}/${torrent.sourceId}/${torrent.infoHash}/${encodeURIComponent(file.path)}`,
    description,
    fileIdx: torrent.files.indexOf(file),
    name: 'stremio-ncore-addon',
    behaviorHints: {
      filename: file.name,
      bingeGroup: `stremio-ncore-addon/${torrent.sourceName}/${torrent.sourceId}`,
      videoSize: file.length,
      notWebReady: true,
    },
  };
}
