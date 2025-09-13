import { Hono } from 'hono';
import { deleteTorrent, getStoreStats } from './torrent.utils';

export const torrentRoutes = new Hono()
  .get('/torrents', async (c) => {
    const torrents = await getStoreStats();
    return c.json(torrents);
  })
  .delete('/torrents/:infoHash', async (c) => {
    const { infoHash } = c.req.param();
    await deleteTorrent(infoHash);
    return c.status(204);
  });
