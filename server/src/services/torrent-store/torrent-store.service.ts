import { rmSync } from 'fs';
import { rm } from 'fs/promises';
import { ok, type Result } from 'neverthrow';
import { globSync } from 'glob';
import type { Torrent } from 'webtorrent';
import WebTorrent from 'webtorrent';
import type { TorrentService } from '@/services/torrent';
import type { NcoreService } from '../ncore';
import type { TorrentResponse, InfoHash, TorrentStoreStats } from './types';
import { createTorrentServerError, type TorrentServerError } from '@/errors';
import { logger } from '@/logger';
import { env } from '@/env';
import { formatBytes } from '@/utils/bytes';
import path from 'node:path';

export class TorrentStoreService {
  private ongoingTorrents = new Map<string, Promise<TorrentResponse>>();
  private webtorrent: WebTorrent;
  private torrentFilePaths = new Map<InfoHash, string>();
  constructor(
    private ncoreService: NcoreService,
    private torrentService: TorrentService,
  ) {
    this.webtorrent = new WebTorrent({
      torrentPort: env.TORRENT_PORT,
      utp: false,
    });
  }

  public async startServer(): Promise<void> {}

  public async getOrAddTorrent(
    infoHash: string,
    ncoreId: string,
  ): Promise<TorrentResponse> {
    if (this.ongoingTorrents.has(infoHash)) {
      return this.ongoingTorrents.get(infoHash)!;
    }

    const promise = (async () => {
      const torrentResult = await this.getTorrent(infoHash);
      let torrent = torrentResult.isOk() ? torrentResult.value : null;

      if (!torrent) {
        const torrentUrlResult = await this.ncoreService.getTorrentUrlByNcoreId(ncoreId);
        if (torrentUrlResult.isErr() || !torrentUrlResult.value) {
          throw new Error(`Failed to get torrent URL for nCoreId ${ncoreId}`);
        }

        const torrentFilePathResult = await this.torrentService.downloadTorrentFile(
          torrentUrlResult.value,
        );
        if (torrentFilePathResult.isErr()) {
          throw new Error(`Failed to download torrent for nCoreId ${ncoreId}`);
        }

        const addResult = await this.addTorrent(torrentFilePathResult.value);
        if (addResult.isErr()) {
          throw new Error(`Failed to add torrent to store for nCoreId ${ncoreId}`);
        }
        torrent = addResult.value;
      }

      return torrent;
    })();

    this.ongoingTorrents.set(infoHash, promise);

    try {
      return await promise;
    } finally {
      this.ongoingTorrents.delete(infoHash);
    }
  }

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
              this.torrentFilePaths.set(torrent.infoHash, torrentFilePath);
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
    logger.info({ infoHash }, 'Deleting torrent');
    try {
      const torrent = await this.webtorrent.get(infoHash);
      if (!torrent) {
        logger.info({ infoHash }, 'Cannot find Deleting torrent');
        return ok();
      }
      torrent.destroy({ destroyStore: true }, (err) => {
        if (err) console.error('Failed to destroy torrent store', err);
      });
      logger.info(`delete path: ${path.join(torrent.path, torrent.name)}`);
      rmSync(path.join(torrent.path, torrent.name), { recursive: true });
      const torrentFilePath = this.torrentFilePaths.get(infoHash);
      if (!torrentFilePath) {
        return createTorrentServerError(
          `Failed to delete torrent file. File not found.`,
          { torrentFilePath },
        );
      }

      await rm(torrentFilePath);
      this.torrentFilePaths.delete(infoHash);

      return ok();
    } catch (error: unknown) {
      if (error instanceof Error) {
        logger.info(`delete error: ${error.message}`, { stack: error.stack });
      } else {
        logger.info(`delete error: ${JSON.stringify(error)}`);
      }
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
