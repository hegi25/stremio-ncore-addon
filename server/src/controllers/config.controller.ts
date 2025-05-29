import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { UserRole } from '@/db/schema/users';
import { logger } from '@/logger';
import type { CreateConfigRequest, UpdateConfigRequest } from '@/schemas/config.schema';
import type { ConfigService } from '@/services/config';
import type { NcoreService } from '@/services/ncore';
import type { HonoEnv } from '@/types/hono-env';
import { HttpStatusCode } from '@/types/http';
import type { ConfigIssue } from '@/types/issues';

export class ConfigController {
  constructor(
    private configService: ConfigService,
    private ncoreService: NcoreService,
  ) {}

  public async getIsConfigured(c: Context<HonoEnv>) {
    const configuration = this.configService.getConfig();
    return c.json({ isConfigured: !!configuration });
  }

  public async getLocalUrl(c: Context<HonoEnv>) {
    const localUrl = this.configService.getAddonUrl('', true);
    return c.json({ localUrl });
  }

  public async getConfig(c: Context<HonoEnv>) {
    const configuration = this.configService.getConfig();
    const { user } = c.var;
    if (!configuration) {
      throw new HTTPException(HttpStatusCode.NOT_FOUND);
    }
    if (!user) {
      throw new HTTPException(HttpStatusCode.UNAUTHORIZED);
    }
    return c.json(configuration);
  }

  public async createConfig(
    c: Context<HonoEnv, string, { out: { json: CreateConfigRequest } }>,
  ) {
    const data = c.req.valid('json');

    const existingConfig = this.configService.getConfig();
    if (existingConfig) {
      throw new HTTPException(HttpStatusCode.CONFLICT);
    }

    const result = await this.configService.createConfig(data);
    if (result.isErr()) {
      logger.error('Error creating configuration:', result.error);
      return c.json(
        {
          message: 'Unknown error occurred while creating configuration.',
          error: result.error,
        },
        HttpStatusCode.INTERNAL_SERVER_ERROR,
      );
    }
    logger.info('Configuration created successfully.');
    return c.json({ message: 'Configuration created successfully.' });
  }

  public async updateConfig(
    c: Context<HonoEnv, '/config', { out: { json: UpdateConfigRequest } }>,
  ) {
    const { user } = c.var;
    if (!user || user.role !== UserRole.ADMIN) {
      throw new HTTPException(HttpStatusCode.UNAUTHORIZED);
    }
    const existingConfig = this.configService.getConfig();
    if (!existingConfig) {
      throw new HTTPException(HttpStatusCode.NOT_FOUND);
    }

    const updatedConfigResult = await this.configService.updateConfig(
      c.req.valid('json'),
    );
    if (updatedConfigResult.isErr()) {
      logger.error(
        { error: updatedConfigResult.error },
        'Error updating configuration. Returning status 500',
      );
      throw new HTTPException(HttpStatusCode.INTERNAL_SERVER_ERROR);
    }
    const updatedConfig = updatedConfigResult.value;
    return c.json(updatedConfig);
  }

  public async getConfigIssues(c: Context<HonoEnv>) {
    const issues: ConfigIssue[] = await this.ncoreService.getConfigIssues();
    return c.json(issues);
  }
}
