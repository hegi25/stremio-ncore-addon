import { rmSync } from 'fs';
import { ok, type Result } from 'neverthrow';
import type { Torrent } from 'webtorrent';
import WebTorrent from 'webtorrent';
import type { NcoreService } from '../ncore';
import type { TorrentResponse, TorrentStoreStats } from './types';
import { TorrentStoreService } from './torrent-store.service';
import { env } from '@/env';
import { formatBytes } from '@/utils/bytes';
import { createTorrentServerError, type TorrentServerError } from '@/errors';
import { HttpStatusCode } from '@/types/http';

export class WebtorrentAdapter extends TorrentStoreService {
  private webtorrent: WebTorrent;
  constructor(private ncore: NcoreService) {
    super(ncore);
    this.webtorrent = new WebTorrent({});
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
      const torrent = await new Promise<Torrent>((resolve) => {
        this.webtorrent.add(
          torrentFilePath,
          {
            path: env.DOWNLOADS_DIR,
            deselect: true,
          },
          (torrent: Torrent) => {
            resolve(torrent);
          },
        );
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
      }));
      return ok(stats.sort((a, z) => a.name.localeCompare(z.name)));
    } catch (error: unknown) {
      return createTorrentServerError('Failed to get store stats', error);
    }
  }

  public async getFileStreamResponse({
    infoHash,
    filePath,
    range,
  }: {
    infoHash: string;
    filePath: string;
    range: { start: number; end: number };
  }): Promise<Result<Response, TorrentServerError>> {
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
    return ok(
      new Response(file.stream(range), {
        status: HttpStatusCode.PARTIAL_CONTENT,
        headers: {
          'Content-Range': `bytes ${range.start}-${range.end}/${file.length}`,
          'Content-Length': `${range.end - range.start + 1}`,
          'Content-Type': file.type || 'application/octet-stream',
          'Accept-Ranges': 'bytes',
        },
      }),
    );
  }
}
