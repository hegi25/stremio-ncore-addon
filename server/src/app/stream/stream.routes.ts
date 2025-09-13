import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { HTTPException } from 'hono/http-exception';
import mime from 'mime';
import { useUrlTokenAuth } from '../auth/auth.middleware';
import {
  getTorrentsByImdbId,
  getTorrentsByTitle,
  getTorrentUrlByNcoreId,
} from '../ncore';
import {
  addTorrent,
  getTorrent,
  type TorrentDetails,
  type TorrentFileDetails,
} from '../torrent';
import { useIsConfigured } from '../config/config.middleware';
import { downloadTorrentFile } from '../torrent/torrent-file.utils';
import { convertTorrentToStream, getCinemetaData, orderTorrents } from './stream.utils';
import { streamParamsSchema, type CinemetaResponse } from './stream.constants';
import { logger } from '@/logger';
import { HttpStatusCode } from '@/types/http';
import { parseRangeHeader } from '@/utils/parse-range-header';

export const streamRoutes = new Hono()
  .basePath('/api')
  .get(
    '/auth/:token/stream/:type/:imdbId',
    useUrlTokenAuth(),
    useIsConfigured(),
    zValidator('param', streamParamsSchema),
    async (c) => {
      const { type, imdbId: imdbIdWithEpisodeDetails, token } = c.req.valid('param');
      const [imdbId, season, episode] = imdbIdWithEpisodeDetails.split(':');

      let torrentDetails: TorrentDetails[] = await getTorrentsByImdbId({
        type,
        imdbId,
      });
      torrentDetails = torrentDetails.filter(
        (torrent) => torrent.getSearchedFile({ type, season, episode }) !== null,
      );
      if (torrentDetails.length === 0) {
        let cinemetaData: CinemetaResponse | null = null;
        try {
          cinemetaData = await getCinemetaData(type, imdbId);
        } catch (error) {
          logger.warn({ error }, 'Failed to fetch metadata from Cinemeta');
        }
        if (cinemetaData) {
          try {
            const torrentsByTitle = await getTorrentsByTitle({
              type,
              title: cinemetaData.meta.name,
            });
            torrentDetails = torrentsByTitle.filter(
              (torrent) => torrent.getSearchedFile({ type, season, episode }) !== null,
            );
          } catch (error) {
            logger.warn({ error }, 'Failed to fetch torrents by title');
          }
        }
      }

      torrentDetails = orderTorrents({
        torrents: torrentDetails,
        preferences: c.var.user,
        season,
        episode,
        type,
      });

      const { addonUrl } = c.var.config;

      const streams = torrentDetails.map((torrent, i) =>
        convertTorrentToStream({
          torrent,
          token,
          file: torrent.getSearchedFile({ type, season, episode }) as TorrentFileDetails,
          isRecommended: i === 0,
          addonUrl,
          preferredLanguage: c.var.user.preferredLanguage,
        }),
      );

      return c.json({ streams });
    },
  )
  .get(
    '/auth/:token/stream/:torrentSourceId/:infoHash/:filePath',
    useIsConfigured(),
    useUrlTokenAuth(),
    async (c) => {
      const { torrentSourceId, infoHash, filePath } = c.req.param();

      let torrent = await getTorrent(infoHash);
      if (!torrent) {
        const ncoreUrl = await getTorrentUrlByNcoreId(torrentSourceId);
        const torrentFilePath = await downloadTorrentFile(ncoreUrl);
        torrent = await addTorrent(torrentFilePath);
      }

      const file = torrent.files.find((f) => f.path === filePath);

      if (!file) {
        logger.error(
          { infoHash, torrentName: torrent.name, filePath },
          `File not found in torrent when trying to play`,
        );
        throw new HTTPException(HttpStatusCode.NOT_FOUND);
      }
      const fileType = mime.getType(file.path) || 'application/octet-stream';

      if (c.req.method === 'HEAD') {
        return c.body(null, 200, {
          'Content-Length': `${file.size}`,
          'Content-Type': fileType,
        });
      }

      const range = parseRangeHeader(c.req.header('range'), file.size);
      const stream = file.getStream(range);
      return new Response(stream, {
        status: HttpStatusCode.PARTIAL_CONTENT,
        headers: {
          'Content-Range': `bytes ${range.start}-${range.end}/${file.size}`,
          'Content-Length': `${range.end - range.start + 1}`,
          'Content-Type': fileType,
          'Accept-Ranges': 'bytes',
        },
      });
    },
  );
