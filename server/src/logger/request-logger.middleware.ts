import type { MiddlewareHandler } from 'hono';
import type { HonoEnv } from 'src/types/hono-env';
import { logger } from './logger';

export const requestLogger: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const start = Date.now();
  const { method, path } = c.req;
  await next();
  const end = Date.now();
  const duration = end - start;
  const status = c.res.status;
  const user = c.get('user');

  logger.info(
    {
      method,
      path,
      userId: user?.id ?? 'Unknown',
      duration,
      status,
    },
    'Request completed',
  );
};
