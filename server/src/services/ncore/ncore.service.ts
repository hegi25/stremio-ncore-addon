import cookieParser from 'set-cookie-parser';
import { JSDOM } from 'jsdom';
import { err, ok, type Result } from 'neverthrow';
import {
  NcoreOrderBy,
  NcoreSearchBy,
  type NcorePageResponseJson,
  type NcoreQueryParams,
} from './ncore-types';
import {
  BATCH_DELAY,
  BATCH_SIZE,
  MOVIE_CATEGORY_FILTERS,
  SERIES_CATEGORY_FILTERS,
} from './constants';
import { NcoreTorrentDetails } from './ncore-torrent-details';
import type { ParsedTorrentDetails, TorrentService } from '@/services/torrent';
import type { StreamQuery } from '@/schemas/stream.schema';
import { StreamType } from '@/schemas/stream.schema';
import { processInBatches } from '@/utils/process-in-batches';
import type { CinemeatService } from '@/services/cinemeta';
import { isSupportedMedia } from '@/utils/media-file-extensions';
import { Cached, DEFAULT_MAX, DEFAULT_TTL } from '@/utils/cache';
import { logger } from '@/logger';
import type { AppError } from '@/errors';
import { createNcoreError, type NcoreError } from '@/errors';
import type { ConfigIssue } from '@/types/issues';

export class NcoreService {
  public name = 'ncore';
  public displayName = 'nCore';

  constructor(
    private torrentService: TorrentService,
    private cinemetaService: CinemeatService,
    private ncoreUrl: string,
    private ncoreUsername: string,
    private ncorePassword: string,
  ) {}
  private cookiesCache = {
    pass: null as string | null,
    cookieExpirationDate: 0,
  };

  public async getCookies(
    username: string,
    password: string,
  ): Promise<Result<string, NcoreError>> {
    try {
      logger.info(`Getting cookies for nCore user "${username}"`);
      if (
        this.cookiesCache.pass &&
        this.cookiesCache.cookieExpirationDate > Date.now() + 1000
      ) {
        logger.info(`Using cached cookies for nCore user "${username}"`);
        return ok(this.cookiesCache.pass);
      }
      logger.info(`Fetching cookies for nCore user "${username}"`);
      const form = new FormData();
      form.append('set_lang', 'hu');
      form.append('submitted', '1');
      form.append('nev', username);
      form.append('pass', password);
      form.append('ne_leptessen_ki', '1');
      const resp = await fetch(`${this.ncoreUrl}/login.php`, {
        method: 'POST',
        body: form,
        redirect: 'manual',
      });

      logger.info(`Successful login attempt for nCore user "${username}"`);
      const allCookies = cookieParser.parse(resp.headers.getSetCookie());
      const passCookie = allCookies.find(({ name }) => name === 'pass');

      if (!passCookie || passCookie.value === 'deleted') {
        logger.error(
          {
            status: resp.status,
            headers: resp.headers,
          },
          `Failed to log in to nCore for user "${username}"`,
        );
        return createNcoreError('Failed to log in to nCore. No pass cookie found', {
          passCookie,
          status: resp.status,
          headers: resp.headers,
          username,
        });
      }
      const fullCookieString = allCookies
        .map(({ name, value }) => `${name}=${value}`)
        .join('; ');
      this.cookiesCache.pass = fullCookieString;
      if (passCookie.expires) {
        this.cookiesCache.cookieExpirationDate = passCookie.expires.getTime();
      }
      logger.info(`Successfully fetched cookies for nCore user "${username}"`);
      return ok(fullCookieString);
    } catch (error) {
      logger.error({ error }, 'Failed to get cookies from nCore');
      return createNcoreError('Failed to get cookies from nCore', { error });
    }
  }

  public async getConfigIssues(): Promise<ConfigIssue[]> {
    const issues: ConfigIssue[] = [];

    const loginResult = await this.getCookies(this.ncoreUsername, this.ncorePassword);
    if (loginResult.isErr()) {
      logger.error(
        { error: loginResult.error },
        'Failed to log in to nCore while checking nCore config',
      );
      issues.push({
        id: 'ncore-login',
        title: 'nCore login',
        description:
          'Failed to log in to nCore. Check your credentials in the environment variables.',
      });
    }
    return issues;
  }

  private async fetchTorrents(
    query: URLSearchParams,
  ): Promise<Result<NcorePageResponseJson, NcoreError>> {
    const cookieResult = await this.getCookies(this.ncoreUsername, this.ncorePassword);
    if (cookieResult.isErr()) {
      return err(cookieResult.error);
    }
    const { value: cookies } = cookieResult;
    try {
      const request = await fetch(`${this.ncoreUrl}/torrents.php?${query.toString()}`, {
        headers: {
          cookie: cookies,
        },
      });
      if (request.headers.get('content-type')?.includes('application/json')) {
        return ok((await request.json()) as NcorePageResponseJson);
      }
      // the API returns HTML if there are no results
      return ok({
        results: [],
        total_results: '0',
        onpage: 0,
        perpage: '0',
      } satisfies NcorePageResponseJson);
    } catch (error) {
      return createNcoreError('Failed to fetch torrents from nCore', { error });
    }
  }

  @Cached({
    max: DEFAULT_MAX,
    ttl: DEFAULT_TTL,
    ttlAutopurge: true,
    generateKey: (queryParams) => new URLSearchParams(queryParams).toString(),
  })
  private async getTorrentsForQuery(
    queryParams: NcoreQueryParams,
  ): Promise<Result<NcoreTorrentDetails[], NcoreError>> {
    const baseParams = {
      ...queryParams,
      tipus: 'kivalasztottak_kozott',
      jsons: 'true',
    };

    // fetching the first page to get the last page number
    const firstPageQuery = new URLSearchParams({ ...baseParams, oldal: `1` });
    const firstPageResult = await this.fetchTorrents(firstPageQuery);
    if (firstPageResult.isErr()) {
      return err(firstPageResult.error);
    }
    const { value: firstPage } = firstPageResult;

    const lastPage = Math.ceil(
      Number(firstPage.total_results) / Number(firstPage.perpage),
    );

    // fetching the rest of the pages
    const restPagePromises: Promise<Result<NcorePageResponseJson, AppError>>[] = [];
    for (let page = 2; page <= lastPage; page++) {
      const query = new URLSearchParams({ ...baseParams, oldal: `${page}` });
      restPagePromises.push(this.fetchTorrents(query));
    }
    const pageResults = [firstPageResult, ...(await Promise.all(restPagePromises))];
    const errors = pageResults
      .filter((result) => result.isErr())
      .map(({ error }) => error);
    const pages = pageResults.filter((result) => result.isOk()).map(({ value }) => value);
    errors.forEach((error) =>
      logger.warn({ error, queryParams }, 'Failed to fetch one of the pages from nCore'),
    );

    const allNcoreTorrents = pages.flatMap((page) => page.results);

    const torrentsWithParsedData = await processInBatches(
      allNcoreTorrents,
      BATCH_SIZE,
      BATCH_DELAY,
      async (torrent): Promise<Result<NcoreTorrentDetails, AppError>> => {
        const parsedResults = await this.torrentService.downloadAndParseTorrent(
          torrent.download_url,
        );
        if (parsedResults.isErr()) {
          return err(parsedResults.error);
        }
        const { value: parsedData } = parsedResults;
        return ok(new NcoreTorrentDetails(torrent, parsedData));
      },
    );
    const torrentParseErrors = torrentsWithParsedData.filter((result) => result.isErr());
    torrentParseErrors.forEach((error) => {
      logger.warn({ error }, 'Failed to download and parse torrent from nCore');
    });
    const results = torrentsWithParsedData
      .filter((result) => result.isOk())
      .map(({ value }) => value);

    return ok(results);
  }

  private filterTorrentsBySeasonAndEpisode(
    torrents: NcoreTorrentDetails[],
    { season, episode }: { season?: number; episode?: number },
  ) {
    return torrents.filter((torrent) => {
      const file = torrent.getSearchedFile({ season, episode });
      return file !== null && isSupportedMedia(file.path);
    });
  }

  public async getTorrentsForImdbId(
    searchCriteria: Pick<StreamQuery, 'imdbId' | 'type' | 'season' | 'episode'>,
  ): Promise<Result<NcoreTorrentDetails[], AppError>> {
    const { imdbId, type, season, episode } = searchCriteria;
    logger.info({ searchCriteria }, `Looking for torrents on nCore`);
    let torrentResults = await this.getTorrentsForQuery({
      mire: imdbId,
      miben: NcoreSearchBy.IMDB,
      miszerint: NcoreOrderBy.SEEDERS,
      kivalasztott_tipus:
        type === StreamType.MOVIE ? MOVIE_CATEGORY_FILTERS : SERIES_CATEGORY_FILTERS,
    });
    if (torrentResults.isErr()) {
      return err(torrentResults.error);
    }
    let torrents = torrentResults.value;

    torrents = this.filterTorrentsBySeasonAndEpisode(torrents, { season, episode });

    if (torrents.length > 0) {
      logger.info({ searchCriteria }, `Found ${torrents.length} torrents`);
      return ok(torrents);
    }
    logger.info(
      { searchCriteria },
      `No torrents found for ${imdbId} on nCore. Now fetching name from Cinemeta to search by title`,
    );
    const cinemetaResult = await this.cinemetaService.getMetadataByImdbId(type, imdbId);
    if (cinemetaResult.isErr()) {
      logger.error(
        {
          error: cinemetaResult.error.error,
          reason: cinemetaResult.error.message,
          searchCriteria,
          errorType: cinemetaResult.error.type,
        },
        'Failed to get metadata from Cinemeta',
      );
      return ok([]);
    }
    const name = cinemetaResult.value.meta.name;
    torrentResults = await this.getTorrentsForQuery({
      mire: name,
      miben: NcoreSearchBy.NAME,
      miszerint: NcoreOrderBy.SEEDERS,
      kivalasztott_tipus:
        type === StreamType.MOVIE ? MOVIE_CATEGORY_FILTERS : SERIES_CATEGORY_FILTERS,
    });
    if (torrentResults.isErr()) {
      return err(torrentResults.error);
    }
    torrents = torrentResults.value;

    torrents.forEach((torrent) => {
      torrent.isSpeculated = true;
    });
    torrents = this.filterTorrentsBySeasonAndEpisode(torrents, { season, episode });

    logger.info(
      {
        searchCriteria,
      },
      `Returning ${torrents.length} torrents based on title from Cinemeta`,
    );
    return ok(torrents);
  }

  public async getTorrentUrlByNcoreId(
    ncoreId: string,
  ): Promise<Result<string, NcoreError>> {
    logger.info(`Getting torrent URL for nCore ID ${ncoreId}`);
    const cookieResult = await this.getCookies(this.ncoreUsername, this.ncorePassword);
    if (cookieResult.isErr()) {
      return err(cookieResult.error);
    }
    const { value: cookies } = cookieResult;
    try {
      const response = await fetch(
        `${this.ncoreUrl}/torrents.php?action=details&id=${ncoreId}`,
        {
          headers: {
            cookie: cookies,
          },
          signal: AbortSignal.timeout(5_000),
        },
      );
      if (!response.ok) {
        logger.error(
          {
            status: response.status,
            ncoreId,
          },
          `Failed to fetch torrent details page`,
        );
        return createNcoreError(`Failed to fetch torrent URL`, {
          status: response.status,
          ncoreId,
        });
      }
      const html = await response.text();
      logger.info({ ncoreId }, `Successfully fetched torrent details page`);
      const { document } = new JSDOM(html).window;
      const downloadLink = `${this.ncoreUrl}/${document
        .querySelector('.download > a')
        ?.getAttribute('href')}`;
      logger.info(
        {
          ncoreId,
          downloadLink,
        },
        `Successfully extracted torrent download URL`,
      );
      return ok(downloadLink);
    } catch (error) {
      logger.error({ error, ncoreId }, `Failed to get torrent URL from nCore`);
      return createNcoreError('Failed to get torrent URL from nCore', { ncoreId, error });
    }
  }

  public async getRemovableInfoHashes(): Promise<Result<string[], AppError>> {
    logger.info(`Getting removable torrents from nCore`);
    const cookieResult = await this.getCookies(this.ncoreUsername, this.ncorePassword);
    if (cookieResult.isErr()) {
      return err(cookieResult.error);
    }
    const { value: cookie } = cookieResult;
    try {
      const request = await fetch(`${this.ncoreUrl}/hitnrun.php?showall=true`, {
        headers: { cookie },
      });
      const html = await request.text();
      const { document } = new JSDOM(html).window;

      const rows = Array.from(document.querySelectorAll('.hnr_all, .hnr_all2'));
      const deletableRows = rows.filter(
        (row) => row.querySelector('.hnr_ttimespent')?.textContent === '-',
      );

      const deletableNcoreIds = deletableRows.map((row) => {
        const detailsUrl = row.querySelector('.hnr_tname a')?.getAttribute('href') ?? '';
        const searchParams = new URLSearchParams(detailsUrl.split('?')[1] ?? '');
        const ncoreId = searchParams.get('id') ?? '';
        return ncoreId;
      });

      const deletableTorrentResults = await Promise.all(
        deletableNcoreIds.map(
          async (ncoreId): Promise<Result<ParsedTorrentDetails, AppError>> => {
            const downloadUrlResult = await this.getTorrentUrlByNcoreId(ncoreId);
            if (downloadUrlResult.isErr()) {
              return err(downloadUrlResult.error);
            }
            const torrentResult = await this.torrentService.downloadAndParseTorrent(
              downloadUrlResult.value,
            );
            return torrentResult;
          },
        ),
      );
      const deletableInfoHashes = deletableTorrentResults
        .filter((result) => result.isOk())
        .map((result) => result.value.infoHash);

      logger.warn(
        {
          errors: deletableTorrentResults
            .filter((result) => result.isErr())
            .map((result) => result.error),
        },
        'Encountered errors while fetching torrent URLs for deletable torrents',
      );

      return ok(deletableInfoHashes);
    } catch (error) {
      logger.error({ error }, 'Failed to get removable torrents from nCore');
      return createNcoreError('Failed to get removable torrents from nCore', { error });
    }
  }
}
