import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { HttpStatusCode } from 'src/types/http';
import { getUserByToken } from '../user/user.utils';
import { getConfig } from '../config/config.utils';
import { getManifest } from './manifest.utils';

export const manifestRoutes = new Hono()
  .get('/manifest.json', (c) => {
    const config = getConfig();
    if (!config) {
      throw new HTTPException(HttpStatusCode.INTERNAL_SERVER_ERROR, {
        message: 'Server configuration missing',
      });
    }
    const manifest = getManifest({ addonUrl: config.addonUrl });
    return c.json(manifest);
  })
  .get('/api/auth/:token/manifest.json', async (c) => {
    const { token } = c.req.param();
    const config = getConfig();
    if (!config) {
      throw new HTTPException(HttpStatusCode.INTERNAL_SERVER_ERROR, {
        message: 'Server configuration missing',
      });
    }
    const user = await getUserByToken(token);
    if (!user) {
      throw new HTTPException(HttpStatusCode.UNAUTHORIZED);
    }
    const manifest = getManifest({ addonUrl: config.addonUrl, user });
    return c.json(manifest);
  });
