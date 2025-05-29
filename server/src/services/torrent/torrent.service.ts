import parseTorrent from 'parse-torrent';
import contentDisposition from 'content-disposition';
import { ok, type Result } from 'neverthrow';
import type { ParsedTorrentDetails } from './types';
import { writeFileWithCreateDir } from '@/utils/files';
import { env } from '@/env';
import { Cached, DEFAULT_TTL } from '@/utils/cache';
import { logger } from '@/logger';
import { createTorrentDownloadError, type TorrentDownloadError } from '@/errors';

export class TorrentService {
  @Cached({
    max: 1_000,
    ttl: DEFAULT_TTL,
    ttlAutopurge: true,
    generateKey: (torrentUrl) => torrentUrl,
  })
  public async downloadAndParseTorrent(
    torrentUrl: string,
  ): Promise<Result<ParsedTorrentDetails, TorrentDownloadError>> {
    try {
      logger.info(`Fetching and parsing torrent from URL ${torrentUrl}`);
      const torrentResponse = await fetch(torrentUrl, {
        signal: AbortSignal.timeout(5_000),
      });
      const buffer = await torrentResponse.arrayBuffer();
      const torrentData = await parseTorrent(new Uint8Array(buffer));
      return ok({
        infoHash: torrentData.infoHash,
        files:
          torrentData.files?.map((file) => ({
            name: file.name,
            length: file.length,
            offset: file.offset,
            path: file.path,
          })) ?? [],
      });
    } catch (e) {
      return createTorrentDownloadError('Failed to fetch and parse torrent', {
        details: { torrentUrl },
        error: e,
      });
    }
  }

  /**
   * @returns the path to the downloaded torrent file
   */
  public async downloadTorrentFile(
    torrentUrl: string,
  ): Promise<Result<string, TorrentDownloadError>> {
    logger.info(`Downloading torrent file from URL ${torrentUrl}`);
    try {
      const torrentReq = await fetch(torrentUrl, { signal: AbortSignal.timeout(5_000) });
      const torrentArrayBuffer = await torrentReq.arrayBuffer();
      const parsedTorrent = await parseTorrent(new Uint8Array(torrentArrayBuffer));
      // torrent file name without the .torrent extension
      const torrentFileName = contentDisposition
        .parse(torrentReq.headers.get('content-disposition') ?? '')
        .parameters.filename?.replace(/\.torrent$/i, '');

      const torrentFilePath = `${env.TORRENTS_DIR}/${torrentFileName}-${parsedTorrent.infoHash}.torrent`;

      writeFileWithCreateDir(torrentFilePath, Buffer.from(torrentArrayBuffer));
      logger.info(`Torrent file downloaded to ${torrentFilePath}`);
      return ok(torrentFilePath);
    } catch (e) {
      return createTorrentDownloadError('Failed to download torrent file', {
        details: { torrentUrl },
        error: e,
      });
    }
  }
}
