import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { getConfig } from './config.utils';
import type { ConfigurationResponse } from '@/db/schema/configuration';
import { HttpStatusCode } from '@/types/http';

type ConfigEnv = {
  Variables: {
    config: ConfigurationResponse;
  };
};

export const useIsConfigured = (
  statusCode: ContentfulStatusCode = HttpStatusCode.INTERNAL_SERVER_ERROR,
) =>
  createMiddleware<ConfigEnv>(async (c, next) => {
    const config = getConfig();
    if (config === null) {
      throw new HTTPException(statusCode, {
        message: 'Addon configuration is missing.',
      });
    }
    c.set('config', config);
    return next();
  });
