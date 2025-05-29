import type { Result } from 'neverthrow';
import { globSync } from 'glob';
import type { NcoreService } from '../ncore';
import type { TorrentResponse, TorrentStoreStats } from './types';
import type { TorrentServerError } from '@/errors';
import { logger } from '@/logger';
import { env } from '@/env';

export abstract class TorrentStoreService {
  constructor(private ncoreService: NcoreService) {}

  public abstract startServer(): Promise<void>;

  public abstract addTorrent(
    torrentFilePath: string,
  ): Promise<Result<TorrentResponse, TorrentServerError>>;

  public abstract getTorrent(
    infoHash: string,
  ): Promise<Result<TorrentResponse | null, TorrentServerError>>;

  public abstract deleteTorrent(
    infoHash: string,
  ): Promise<Result<void, TorrentServerError>>;

  public abstract getStoreStats(): Promise<
    Result<TorrentStoreStats[], TorrentServerError>
  >;

  public abstract getFileStreamResponse(options: {
    infoHash: string;
    filePath: string;
    range: { start: number; end: number };
  }): Promise<Result<Response, TorrentServerError>>;

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

export enum TorrentAdapters {
  WEBTORRENT = 'webtorrent',
  TORRENT_SERVER = 'torrent-server',
}
