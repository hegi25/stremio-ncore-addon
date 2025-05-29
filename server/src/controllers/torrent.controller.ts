import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { TorrentStoreService } from '@/services/torrent-store';
import type { HonoEnv } from '@/types/hono-env';
import { HttpStatusCode } from '@/types/http';
import { logger } from '@/logger';

export class TorrentController {
  constructor(private torrentStoreService: TorrentStoreService) {}
  public async getTorrentStats(c: Context) {
    const statsResult = await this.torrentStoreService.getStoreStats();
    if (statsResult.isErr()) {
      logger.error(
        { error: statsResult.error },
        'Error while getting torrent stats. Returning status 500',
      );
      throw new HTTPException(HttpStatusCode.INTERNAL_SERVER_ERROR);
    }
    const stats = statsResult.value;
    return c.json(stats);
  }

  public async deleteTorrent(c: Context<HonoEnv, '/torrents/:infoHash'>) {
    const { infoHash } = c.req.param();
    try {
      await this.torrentStoreService.deleteTorrent(infoHash);
      return c.json({ success: true, error: undefined });
    } catch (error) {
      return c.json({ success: false, error });
    }
  }
}
