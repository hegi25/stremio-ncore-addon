import { rmSync } from 'fs';
import { ok, type Result } from 'neverthrow';
import { globSync } from 'glob';
import type { Torrent } from 'webtorrent';
import WebTorrent from 'webtorrent';
import type { NcoreService } from '../ncore';
import type { TorrentResponse, TorrentStoreStats } from './types';
import { createTorrentServerError, type TorrentServerError } from '@/errors';
import { logger } from '@/logger';
import { env } from '@/env';
import { formatBytes } from '@/utils/bytes';

export class TorrentStoreService {
  private webtorrent: WebTorrent;
  constructor(private ncoreService: NcoreService) {
    this.webtorrent = new WebTorrent({
      torrentPort: env.TORRENT_PORT,
    });
  }

  public async startServer(): Promise<void> {}

  private mapToTorrentResponse(torrent: Torrent): TorrentResponse {
    return {
      infoHash: torrent.infoHash,
      name: torrent.name,
      size: torrent.length,
      progress: torrent.progress,
      downloaded: torrent.downloaded,
      files: torrent.files.map((file) => ({
        name: file.name,
        path: file.path,
        size: file.length,
        progress: file.progress,
      })),
    };
  }

  public async addTorrent(
    torrentFilePath: string,
  ): Promise<Result<TorrentResponse, TorrentServerError>> {
    try {
      const torrent = await new Promise<Torrent>((resolve, reject) => {
        try {
          this.webtorrent.add(
            torrentFilePath,
            {
              path: env.DOWNLOADS_DIR,
              deselect: true,
              storeCacheSlots: 0,
            },
            (torrent: Torrent) => {
              resolve(torrent);
            },
          );
        } catch (error: unknown) {
          reject(error);
        }
      });
      return ok(this.mapToTorrentResponse(torrent));
    } catch (error: unknown) {
      return createTorrentServerError(
        `Failed to add torrent from file path: ${torrentFilePath}`,
        error,
      );
    }
  }

  public async getTorrent(
    infoHash: string,
  ): Promise<Result<TorrentResponse | null, TorrentServerError>> {
    try {
      const torrent = await this.webtorrent.get(infoHash);
      if (!torrent) {
        return ok(null);
      }
      return ok(this.mapToTorrentResponse(torrent));
    } catch (error: unknown) {
      return createTorrentServerError(
        `Failed to get torrent with info hash: ${infoHash}`,
        error,
      );
    }
  }

  public async getTorrents(): Promise<Result<TorrentResponse[], TorrentServerError>> {
    try {
      const torrents = this.webtorrent.torrents;
      return ok(torrents.map((torrent) => this.mapToTorrentResponse(torrent)));
    } catch (error: unknown) {
      return createTorrentServerError('Failed to get torrents', error);
    }
  }

  public async deleteTorrent(
    infoHash: string,
  ): Promise<Result<void, TorrentServerError>> {
    try {
      const torrent = await this.webtorrent.get(infoHash);
      if (!torrent) {
        return ok();
      }
      rmSync(torrent.path, { recursive: true });
      torrent.destroy();
      return ok();
    } catch (error: unknown) {
      return createTorrentServerError(
        `Failed to delete torrent with info hash: ${infoHash}`,
        error,
      );
    }
  }

  public async getStoreStats(): Promise<Result<TorrentStoreStats[], TorrentServerError>> {
    try {
      const stats: TorrentStoreStats[] = this.webtorrent.torrents.map((t) => ({
        hash: t.infoHash,
        name: t.name,
        size: formatBytes(t.length),
        downloaded: formatBytes(t.downloaded),
        progress: `${(t.progress * 100).toFixed(2)}%`,
        files: t.files.map((f) => ({
          name: f.name,
          size: formatBytes(f.length),
          downloaded: formatBytes(f.downloaded),
          progress: `${(f.progress * 100).toFixed(2)}%`,
        })),
      }));
      return ok(stats.sort((a, z) => a.name.localeCompare(z.name)));
    } catch (error: unknown) {
      return createTorrentServerError('Failed to get store stats', error);
    }
  }

  public async getFileStream({
    infoHash,
    filePath,
    range,
  }: {
    infoHash: string;
    filePath: string;
    range: { start: number; end: number };
  }): Promise<Result<ReadableStream, TorrentServerError>> {
    const torrent = await this.webtorrent.get(infoHash);
    if (!torrent) {
      return createTorrentServerError(
        `Torrent with info hash ${infoHash} not found`,
        undefined,
      );
    }
    const file = torrent.files.find((f) => f.path === filePath);
    if (!file) {
      return createTorrentServerError(
        `File ${filePath} not found in torrent ${infoHash}`,
        undefined,
      );
    }

    if (file.progress > env.PRELOAD_TORRENT_FILE_THRESHOLD) {
      file.select();
    }
    if (torrent.progress > env.PRELOAD_TORRENT_THRESHOLD) {
      torrent.select(0, torrent.files.length - 1);
    }

    return ok(file.stream(range));
  }

  public async loadExistingTorrents(): Promise<void> {
    logger.info('Loading existing torrents into torrent client');
    const savedTorrentFilePaths = globSync(`${env.TORRENTS_DIR}/*.torrent`);
    logger.info(
      { torrentFiles: savedTorrentFilePaths },
      `Found ${savedTorrentFilePaths.length} torrent files.`,
    );
    const results = await Promise.all(
      savedTorrentFilePaths.map((filePath) => {
        return this.addTorrent(filePath);
      }),
    );
    results.forEach((result, i) => {
      if (result.isErr()) {
        logger.error(
          { error: result.error },
          `Failed to add torrent file ${savedTorrentFilePaths[i]}`,
        );
        return;
      }
      const torrent = result.value;
      logger.info(`Added torrent ${torrent.name} - ${torrent.infoHash}`);
    });
    logger.info('Torrent files loaded and verified.');
  }

  public deleteUnnecessaryTorrents = async () => {
    logger.info('Gathering unnecessary torrents');
    const deletableInfoHashResults = await this.ncoreService.getRemovableInfoHashes();
    if (deletableInfoHashResults.isErr()) {
      logger.error(
        { error: deletableInfoHashResults.error },
        'Failed to get removable info hashes from sources',
      );
      return;
    }
    const deletableInfoHashes = deletableInfoHashResults.value;
    if (deletableInfoHashes.length === 0) {
      logger.info('No unnecessary torrents to delete');
      return;
    }
    logger.info(
      { deletableInfoHashes },
      `Found ${deletableInfoHashes.length} deletable torrents.`,
    );

    const torrentResults = await Promise.all(
      deletableInfoHashes.map((infoHash) => this.getTorrent(infoHash)),
    );

    const deleteResults = await Promise.all(
      torrentResults.map(async (result, i): Promise<boolean> => {
        const infoHash = deletableInfoHashes[i];
        if (result.isErr()) {
          logger.error(
            result.error,
            `Failed to get torrent with infoHash "${infoHash}" while deleting`,
          );
          return false;
        } else if (result.value === null) {
          logger.error(
            `Torrent with info hash "${infoHash}" not found in torrent client while deleting unnecessary torrents`,
          );
          return false;
        } else {
          const deleteResult = await this.deleteTorrent(result.value.infoHash);
          if (deleteResult.isErr()) {
            logger.error(
              deleteResult.error,
              `Failed to delete torrent with info hash "${infoHash}"`,
            );
            return false;
          } else {
            logger.info(`Deleted torrent with info hash "${infoHash}"`);
            return true;
          }
        }
      }),
    );
    const deletedCount = deleteResults.filter((result) => result).length;
    const failedCount = deleteResults.filter((result) => !result).length;
    if (failedCount > 0) {
      logger.error(`Failed to delete ${failedCount} torrents`);
    }
    if (deletedCount > 0) {
      logger.info(`Deleted ${deletedCount} unnecessary torrents`);
    }
  };
}
