import type { Stream } from 'stremio-addon-sdk';
import type { Result } from 'neverthrow';
import { ok } from 'neverthrow';
import type { TorrentDetails, TorrentFileDetails } from '../torrent';
import type { ConfigService } from '../config';
import type { UserService } from '../user';
import { languageEmojiMap } from './constants';
import { rateList } from '@/utils/rate-list';
import { formatBytes } from '@/utils/bytes';
import type { User } from '@/types/user';
import { Language } from '@/db/schema/users';
import type { AppError } from '@/errors';
import { createMissingConfigError, createUnknownError } from '@/errors';

export class StreamService {
  constructor(
    private configService: ConfigService,
    private userService: UserService,
  ) {}

  public convertTorrentToStream({
    torrent,
    isRecommended,
    deviceToken,
    season,
    episode,
    preferredLanguage,
  }: {
    torrent: TorrentDetails;
    isRecommended: boolean;
    deviceToken: string;
    season: number | undefined;
    episode: number | undefined;
    preferredLanguage: Language;
  }): Result<Stream, AppError> {
    const config = this.configService.getConfig();
    if (!config) {
      return createMissingConfigError(
        "Couldn't get config while converting torrent objects to stream objects",
      );
    }
    const torrentFile = torrent.getSearchedFile({ season, episode });
    if (!torrentFile) {
      return createUnknownError(
        `No torrent file found for torrent: ${torrent.getName()} with season: ${season} and episode: ${episode}`,
      );
    }

    const sourceId = encodeURIComponent(torrent.sourceId);
    const infoHash = encodeURIComponent(torrent.infoHash);
    const filePath = encodeURIComponent(torrentFile.path);

    const description = this.getStreamDescription(
      torrent,
      isRecommended,
      {
        season,
        episode,
      },
      preferredLanguage,
    );
    return ok({
      url: `${config.addonUrl}/api/auth/${deviceToken}/stream/play/${sourceId}/${infoHash}/${filePath}`,
      description,
      behaviorHints: {
        notWebReady: true,
        bingeGroup: torrent.infoHash,
      },
    });
  }

  private getStreamDescription(
    torrent: TorrentDetails,
    isRecommended: boolean,
    { season, episode }: { season: number | undefined; episode: number | undefined },
    preferredLanguage: Language,
  ): string {
    const languageEmoji = languageEmojiMap[torrent.getLanguage()];
    // By this point, we have filtered out torrents where the searched file is not found
    const file = torrent.getSearchedFile({ season, episode }) as TorrentFileDetails;
    const fileSizeString = formatBytes(file.length);

    const isShow = season && episode;
    let mediaType = '';
    switch (preferredLanguage) {
      case Language.HU:
        mediaType = isShow ? 'sorozat' : 'film';
        break;
      default:
        mediaType = isShow ? 'show' : 'movie';
    }

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
          warningLine = `⚠️ Bizonytalan forrás ⚠️\nEz lehet egy másik ${mediaType}!\n`;
          break;
        default:
          warningLine = `⚠️ Speculated source ⚠️\nThis might be a different ${mediaType}!\n`;
      }
    }

    const typeLine = `${languageEmoji} | ${torrent.displayResolution(torrent.getResolution(file.name))} | ${fileSizeString}\n`;
    const title = isShow ? `${file.name}\n` : `${torrent.getName()}\n`;
    const seeders = `⬆️ ${torrent.getSeeders()}\n`;
    return warningLine + recommendedLine + typeLine + title + seeders;
  }

  public async orderTorrents({
    torrents,
    user,
    season,
    episode,
  }: {
    torrents: TorrentDetails[];
    user: User;
    season: number | undefined;
    episode: number | undefined;
  }): Promise<TorrentDetails[]> {
    const { preferredLanguage, preferredResolutions } = user;

    return rateList(torrents, [
      (torrent) => (preferredLanguage === torrent.getLanguage() ? 3 : 0),
      (torrent) => {
        // By this point, we have filtered out torrents where the searched file is not found
        const file = torrent.getSearchedFile({ season, episode }) as TorrentFileDetails;
        const resolution = torrent.getResolution(file.name);
        return preferredResolutions.includes(resolution) ? 2 : 0;
      },
    ]);
  }
}
