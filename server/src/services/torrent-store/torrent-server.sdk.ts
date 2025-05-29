import { rm } from 'fs/promises';
import { ok, type Result } from 'neverthrow';
import type { AddTorrentRequest, InfoHash, TorrentResponse } from './types';
import { HttpStatusCode } from '@/types/http';
import { createTorrentServerError, type TorrentServerError } from '@/errors';

export class TorrentServerSdk {
  private torrentFilePaths = new Map<InfoHash, string>();
  constructor(private readonly url: string) {}

  public async getTorrent(
    infoHash: InfoHash,
  ): Promise<Result<TorrentResponse | null, TorrentServerError>> {
    try {
      const req = await fetch(`${this.url}/torrents/${infoHash}`);
      if (!req.ok) {
        if (req.status === HttpStatusCode.NOT_FOUND) {
          return ok(null);
        }
        const responseText = await req.text();
        return createTorrentServerError(
          `Failed to get torrent. Bad response from server.`,
          { status: req.status, responseText },
        );
      }
      return ok((await req.json()) as TorrentResponse);
    } catch (e) {
      return createTorrentServerError('Failed to get torrent - ${infoHash}', e);
    }
  }

  public async getAllTorrents(): Promise<Result<TorrentResponse[], TorrentServerError>> {
    try {
      const req = await fetch(`${this.url}/torrents`);
      if (!req.ok) {
        const responseText = await req.text();
        return createTorrentServerError(
          `Failed to get torrents. Bad response from server.`,
          { status: req.status, responseText },
        );
      }
      return ok((await req.json()) as TorrentResponse[]);
    } catch (e) {
      return createTorrentServerError('Failed to get all torrents', e);
    }
  }

  public async addTorrent(
    torrentFilePath: string,
  ): Promise<Result<TorrentResponse, TorrentServerError>> {
    try {
      const req = await fetch(`${this.url}/torrents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: torrentFilePath } satisfies AddTorrentRequest),
      });
      if (!req.ok) {
        const responseText = await req.text();
        return createTorrentServerError(
          `Failed to add torrent. Bad response from server.`,
          { status: req.status, responseText },
        );
      }
      const torrent = (await req.json()) as TorrentResponse;
      this.torrentFilePaths.set(torrent.infoHash, torrentFilePath);
      return ok(torrent);
    } catch (e) {
      return createTorrentServerError(`Failed to add torrent - ${torrentFilePath}`, e);
    }
  }

  public async deleteTorrent(
    infoHash: InfoHash,
  ): Promise<Result<void, TorrentServerError>> {
    try {
      const req = await fetch(`${this.url}/torrents/${infoHash}`, { method: 'DELETE' });
      if (!req.ok) {
        const responseText = await req.text();
        return createTorrentServerError(
          `Could not delete torrent. Bad response from server.`,
          { status: req.status, responseText },
        );
      }
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
    } catch (e) {
      return createTorrentServerError(
        `Failed to delete torrent file at path: "${this.torrentFilePaths.get(infoHash)}".`,
        e,
      );
    }
  }

  public getFileStreamingUrl(infoHash: InfoHash, filePath: string): string {
    return `${this.url}/torrents/${infoHash}/files/${filePath}`;
  }

  public getHealthCheckUrl(): string {
    return `${this.url}/health-check`;
  }
}
