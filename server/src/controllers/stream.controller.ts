import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import mime from 'mime';
import type { StreamQuery } from '@/schemas/stream.schema';
import type { TorrentService } from '@/services/torrent';
import type { StreamService } from '@/services/stream';
import type { UserService } from '@/services/user';
import type { TorrentStoreService } from '@/services/torrent-store';
import type { PlaySchema } from '@/schemas/play.schema';
import { HttpStatusCode } from '@/types/http';
import type { NcoreService } from '@/services/ncore';
import type { HonoEnv } from '@/types/hono-env';
import { logger } from '@/logger';
import { parseRangeHeader } from '@/utils/parse-range-header';

export class StreamController {
  constructor(
    private ncoreService: NcoreService,
    private torrentService: TorrentService,
    private streamService: StreamService,
    private userService: UserService,
    private torrentStoreService: TorrentStoreService,
  ) {}

  public async getStreamsForMedia(
    c: Context<HonoEnv, string, { out: { param: StreamQuery } }>,
  ) {
    const { imdbId, type, episode, season, deviceToken } = c.req.valid('param');

    const user = await this.userService.getUserByDeviceToken(deviceToken);
    if (!user) {
      throw new HTTPException(HttpStatusCode.UNAUTHORIZED);
    }

    const torrentResults = await this.ncoreService.getTorrentsForImdbId({
      imdbId,
      type,
      season,
      episode,
    });
    if (torrentResults.isErr()) {
      logger.error(
        { error: torrentResults.error, imdbId, type },
        'Error getting torrents for IMDB id. Returning status 500',
      );
      throw new HTTPException(HttpStatusCode.INTERNAL_SERVER_ERROR);
    }
    const torrents = torrentResults.value;

    const orderedTorrents = await this.streamService.orderTorrents({
      torrents,
      season,
      episode,
      user,
    });

    const { preferredLanguage } = user;

    const streamResults = orderedTorrents.map((torrent, i) =>
      this.streamService.convertTorrentToStream({
        torrent,
        isRecommended: i === 0,
        deviceToken,
        season,
        episode,
        preferredLanguage,
      }),
    );
    const failedStreams = streamResults.filter((result) => result.isErr());
    const streams = streamResults
      .filter((result) => result.isOk())
      .map((result) => result.value);
    if (failedStreams.length > 0 && streams.length > 0) {
      logger.error(
        { errors: failedStreams.map((result) => result.error) },
        'Error converting torrents to streams. Not returning error, because some streams were constructed successfully',
      );
    } else if (failedStreams.length > 0) {
      logger.error(
        { errors: failedStreams.map((result) => result.error) },
        'Error converting torrents to streams. Returning status 500',
      );
      throw new HTTPException(HttpStatusCode.INTERNAL_SERVER_ERROR);
    }

    return c.json({ streams });
  }

  public async play(c: Context<HonoEnv, string, { out: { param: PlaySchema } }>) {
    const { ncoreId, infoHash, filePath } = c.req.valid('param');

    const torrentResult = await this.torrentStoreService.getTorrent(infoHash);
    if (torrentResult.isErr()) {
      // This is not a "not found" case, but rather a case where the torrent store threw an error
      logger.error(
        { error: torrentResult.error },
        'Error while getting torrent from torrent server. Returning status 500',
      );
      throw new HTTPException(HttpStatusCode.INTERNAL_SERVER_ERROR);
    }
    let torrent = torrentResult.value;

    if (!torrent) {
      const torrentUrlResult = await this.ncoreService.getTorrentUrlByNcoreId(ncoreId);
      if (torrentUrlResult.isErr()) {
        logger.error(
          { error: torrentUrlResult.error },
          "Error while getting torrent's download URL. Returning status 500",
        );
        throw new HTTPException(HttpStatusCode.INTERNAL_SERVER_ERROR);
      }
      const torrentUrl = torrentUrlResult.value;
      if (!torrentUrl) {
        return c.json(
          { message: 'Torrent not found' },
          { status: HttpStatusCode.NOT_FOUND },
        );
      }
      const torrentFilePathResult =
        await this.torrentService.downloadTorrentFile(torrentUrl);
      if (torrentFilePathResult.isErr()) {
        logger.error(
          { error: torrentFilePathResult.error },
          'Error while downloading torrent file. Returning status 500',
        );
        throw new HTTPException(HttpStatusCode.INTERNAL_SERVER_ERROR);
      }
      const torrentFilePath = torrentFilePathResult.value;
      const torrentResult = await this.torrentStoreService.addTorrent(torrentFilePath);
      if (torrentResult.isErr()) {
        logger.error(
          { error: torrentResult.error },
          'Error while adding torrent to torrent server. Returning status 500',
        );
        throw new HTTPException(HttpStatusCode.INTERNAL_SERVER_ERROR);
      }
      torrent = torrentResult.value;
    }
    const file = torrent.files.find((f) => f.path === filePath);
    if (!file) {
      logger.error(
        `File with path "${filePath}" not found in torrent "${torrent.name}" with info hash "${torrent.infoHash}"`,
      );
      return c.body(null, HttpStatusCode.NOT_FOUND);
    }
    const fileType = mime.getType(file.path) || 'application/octet-stream';

    if (c.req.method === 'HEAD') {
      return c.body(null, 200, {
        'Content-Length': `${file.size}`,
        'Content-Type': fileType,
      });
    }

    const rangeResult = parseRangeHeader(c.req.header('range'), file.size);
    if (rangeResult.isErr()) {
      logger.error(
        { details: rangeResult.error },
        'Error while parsing range header. Returning status 416',
      );
      return c.body(null, HttpStatusCode.RANGE_NOT_SATISFIABLE, {
        'Content-Range': `bytes */${file.size}`,
      });
    }
    const range = rangeResult.value;
    const responseResult = await this.torrentStoreService.getFileStreamResponse({
      infoHash: torrent.infoHash,
      filePath: file.path,
      range,
    });
    if (responseResult.isErr()) {
      logger.error(
        { error: responseResult.error },
        'Error while getting file stream response. Returning status 500',
      );
      throw new HTTPException(HttpStatusCode.INTERNAL_SERVER_ERROR);
    }
    return responseResult.value;
  }
}
