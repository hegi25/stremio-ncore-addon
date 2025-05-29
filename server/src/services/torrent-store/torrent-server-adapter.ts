import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { err, ok, type Result } from 'neverthrow';
import { proxy } from 'hono/proxy';
import type { NcoreService } from '../ncore';
import type { TorrentResponse, TorrentStoreStats } from './types';
import { TorrentServerSdk } from './torrent-server.sdk';
import { TorrentStoreService } from './torrent-store.service';
import { env } from '@/env';
import { formatBytes } from '@/utils/bytes';
import { logger } from '@/logger';
import { type TorrentServerError } from '@/errors';

export class TorrentServerAdapter extends TorrentStoreService {
  private torrentServerUrl: string = `http://localhost:${env.TORRENT_SERVER_PORT}`;
  private torrentServerInstance: ChildProcessWithoutNullStreams | null = null;
  private torrentServerSdk: TorrentServerSdk = new TorrentServerSdk(
    this.torrentServerUrl,
  );

  constructor(private ncore: NcoreService) {
    super(ncore);
  }

  public async startServer() {
    logger.info('Starting torrent server child process');
    const executablePath = resolve(
      import.meta.dirname,
      env.NODE_ENV === 'production'
        ? '../../../torrent-server/torrent-server'
        : '../../../../dist/torrent-server/torrent-server',
    );
    this.torrentServerInstance = spawn(executablePath, [
      '-p',
      `${env.TORRENT_SERVER_PORT}`,
      '-d',
      env.DOWNLOADS_DIR,
    ]);
    this.torrentServerInstance.on('exit', (code) => {
      logger.fatal(
        `Torrent server child process exited with code ${code}. Shutting down server.`,
      );
      process.exit(1);
    });
    const torrentServerLogger = logger.child({
      source: 'torrent-server',
    });
    this.torrentServerInstance.stdout.on('data', (data) => {
      torrentServerLogger.info(String(data));
    });
    this.torrentServerInstance.stderr.on('data', (data) => {
      torrentServerLogger.error(String(data));
    });
  }

  public async addTorrent(
    torrentFilePath: string,
  ): Promise<Result<TorrentResponse, TorrentServerError>> {
    logger.info(`Adding torrent file to torrent client: ${torrentFilePath}`);
    const torrent = await this.torrentServerSdk.addTorrent(torrentFilePath);
    return torrent;
  }

  public async getTorrent(
    infoHash: string,
  ): Promise<Result<TorrentResponse | null, TorrentServerError>> {
    logger.info(`Getting torrent info from torrent client for info hash "${infoHash}"`);
    const torrent = await this.torrentServerSdk.getTorrent(infoHash);
    if (!torrent) {
      logger.info(`Torrent with info hash "${infoHash}" not found.`);
    } else {
      logger.info(`Torrent with info hash "${infoHash}" found.`);
    }
    return torrent;
  }

  public async deleteTorrent(
    infoHash: string,
  ): Promise<Result<void, TorrentServerError>> {
    logger.info(`Deleting torrent from torrent client with info hash "${infoHash}"`);
    return await this.torrentServerSdk.deleteTorrent(infoHash);
  }

  public async getStoreStats(): Promise<Result<TorrentStoreStats[], TorrentServerError>> {
    logger.info('Getting torrent client statistics');
    const torrentResults = await this.torrentServerSdk.getAllTorrents();
    if (torrentResults.isErr()) {
      return err(torrentResults.error);
    }
    const torrents = torrentResults.value;

    const stats = torrents
      .map(
        (t) =>
          ({
            hash: t.infoHash,
            name: t.name,
            size: formatBytes(t.size),
            downloaded: formatBytes(t.downloaded),
            progress: `${(t.progress * 100).toFixed(2)}%`,
          }) satisfies TorrentStoreStats,
      )
      .sort((a, z) => a.name.localeCompare(z.name));
    return ok(stats);
  }

  public async getFileStreamResponse({
    infoHash,
    filePath,
    range: { start, end },
  }: {
    infoHash: string;
    filePath: string;
    range: { start: number; end: number };
  }): Promise<Result<Response, TorrentServerError>> {
    return ok(
      await proxy(this.torrentServerSdk.getFileStreamingUrl(infoHash, filePath), {
        headers: { Range: `${start}-${end}` },
      }),
    );
  }
}
