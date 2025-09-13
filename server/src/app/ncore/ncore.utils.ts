import type { NcoreTorrent, NcorePageResponseJson } from './ncore.types';
import { getAllPromiseResults } from '@/utils/get-all-promise-results';
import { logger } from '@/logger';

export async function getAllPages(
  getNcoreResponse: (page: number) => Promise<NcorePageResponseJson>,
): Promise<NcoreTorrent[]> {
  const page = 1;
  const results: NcoreTorrent[] = [];

  const firstResult = await getNcoreResponse(page);
  results.concat(firstResult.results);
  const totalResults = parseInt(firstResult.total_results, 10);
  if (totalResults > firstResult.results.length) {
    const lastPageNumber = Math.ceil(totalResults / firstResult.results.length);
    const pageRequests = [];
    for (let i = 2; i <= lastPageNumber; i += 1) {
      pageRequests.push(getNcoreResponse(i));
    }
    const [pages, errors] = await getAllPromiseResults(pageRequests);
    if (errors.length) {
      logger.warn({ errors }, 'Some pages failed to fetch when getting all nCore pages');
    }
    results.concat(...pages.flatMap((p) => p.results));
  }
  return results;
}

export function getNcoreSearchResults(responseBody: string): NcorePageResponseJson {
  try {
    const body = JSON.parse(responseBody) as NcorePageResponseJson;
    return body;
  } catch {
    // Ncore returns html instead of json if there are no results
    return {
      results: [],
      total_results: '0',
      onpage: 0,
      perpage: '0',
    };
  }
}
