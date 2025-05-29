import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ManifestService } from '@/services/manifest';
import type { HonoEnv } from '@/types/hono-env';
import { HttpStatusCode } from '@/types/http';
import { logger } from '@/logger';

export class ManifestController {
  constructor(private manifestService: ManifestService) {}
  public async getBaseManifest(c: Context) {
    return c.json(this.manifestService.getBaseManifest());
  }

  public async getAuthenticatedManifest(c: Context<HonoEnv, '/:deviceToken'>) {
    const deviceToken = c.req.param('deviceToken');
    const result = await this.manifestService.getAuthenticatedManifest(deviceToken);
    if (result.isErr()) {
      logger.error(
        { error: result.error },
        'Error while getting authenticated manifest. Returning status 500',
      );
      throw new HTTPException(HttpStatusCode.INTERNAL_SERVER_ERROR);
    }
    const manifest = result.value;
    return c.json(manifest);
  }
}
