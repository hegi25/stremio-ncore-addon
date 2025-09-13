import { rmSync } from 'node:fs';
import WebTorrent, { type Torrent as WebtorrentTorrent } from 'webtorrent';
import type { Torrent } from './torrent.types';
import { env } from '@/env';
import { logger } from '@/logger';

export const _webtorrent = new WebTorrent({
  torrentPort: env.TORRENT_PORT,
});

function _mapToTorrentResponse(torrent: WebtorrentTorrent): Torrent {
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
      getStream: file.stream.bind(file),
    })),
  };
}

export async function addTorrent(torrentFilePath: string): Promise<Torrent> {
  try {
    const torrent = await new Promise<WebtorrentTorrent>((resolve, reject) => {
      try {
        _webtorrent.add(
          torrentFilePath,
          {
            path: env.DOWNLOADS_DIR,
            deselect: true,
            storeCacheSlots: 0,
          },
          (torrent: WebtorrentTorrent) => {
            resolve(torrent);
          },
        );
      } catch (error: unknown) {
        reject(error);
      }
    });
    return _mapToTorrentResponse(torrent);
  } catch (error: unknown) {
    logger.error({ error }, `Failed to add torrent from file path "${torrentFilePath}"`);
    throw new Error(`Failed to add torrent from file path "${torrentFilePath}"`, {
      cause: error,
    });
  }
}

export async function getTorrent(infoHash: string): Promise<Torrent | null> {
  const torrent = await _webtorrent.get(infoHash);
  if (!torrent) {
    return null;
  }
  return _mapToTorrentResponse(torrent);
}

export async function deleteTorrent(infoHash: string): Promise<void> {
  try {
    const torrent = await _webtorrent.get(infoHash);
    if (!torrent) {
      logger.warn({ infoHash }, 'Torrent not found when trying to delete');
      return;
    }
    rmSync(torrent.path, { recursive: true });
    torrent.destroy();
    return;
  } catch (error: unknown) {
    logger.error({ error, infoHash }, 'Failed to delete torrent');
    throw new Error(`Failed to delete torrent with info hash: ${infoHash}`, {
      cause: error,
    });
  }
}

export async function getStoreStats(): Promise<Torrent[]> {
  try {
    const stats = _webtorrent.torrents.map(_mapToTorrentResponse);
    return stats.sort((a, z) => a.name.localeCompare(z.name));
  } catch (error: unknown) {
    logger.error({ error }, 'Failed to get store stats');
    throw new Error('Failed to get store stats', { cause: error });
  }
}
