import type { ScheduledTask } from 'node-cron';
import { schedule } from 'node-cron';
import { ok, type Result } from 'neverthrow';
import type { UserService } from '../user';
import type { TorrentStoreService } from '../torrent-store';
import type { Database } from '@/db';
import type { ConfigurationResponse } from '@/db/schema/configuration';
import { configurationTable } from '@/db/schema/configuration';
import type { CreateConfigRequest, UpdateConfigRequest } from '@/schemas/config.schema';
import { UserRole } from '@/db/schema/users';
import { env } from '@/env';
import { getLocalIpUrl } from '@/utils/https';
import { logger } from '@/logger';
import type { AppError, MissingConfigError } from '@/errors';
import { createMissingConfigError, createUnknownError } from '@/errors';

export class ConfigService {
  constructor(
    private db: Database,
    private userService: UserService,
  ) {}

  public torrentStoreService: TorrentStoreService | null = null;

  public deleteAfterHitnrunCronTask: ScheduledTask | null = null;

  public scheduleDeleteAfterHitnrunCron(): Result<void, MissingConfigError> {
    const config = this.getConfig();
    if (!config) {
      return createMissingConfigError(
        'Missing config in config service. Cannot schedule deleteAfterHitnrun cron.',
      );
    }
    this.deleteAfterHitnrunCronTask?.stop();
    this.deleteAfterHitnrunCronTask = null;
    if (!this.torrentStoreService) {
      logger.info('Missing torrent store service in config service.');
      return ok();
    }
    if (config.deleteAfterHitnrun) {
      this.deleteAfterHitnrunCronTask = schedule(
        config.deleteAfterHitnrunCron,
        this.torrentStoreService.deleteUnnecessaryTorrents,
      );
    }
    return ok();
  }

  public getAddonUrl(addonLocation: string, localOnly: boolean): string {
    if (localOnly) {
      return getLocalIpUrl(addonLocation, env.HTTPS_PORT);
    }
    return addonLocation;
  }

  public getConfig = (): ConfigurationResponse | null => {
    const config = this.db.select().from(configurationTable).limit(1).get();
    if (!config) {
      return null;
    }
    return {
      ...config,
      addonUrl: this.getAddonUrl(config.addonLocation, config.localOnly),
    };
  };

  public async createConfig(
    data: CreateConfigRequest,
  ): Promise<Result<ConfigurationResponse, AppError>> {
    try {
      const { addonLocation, deleteAfterHitnrun, admin, nonAdminUsers } = data;
      const config = await this.db.transaction(async (tx) => {
        const [config] = await tx
          .insert(configurationTable)
          .values({
            addonLocation: addonLocation.local ? '' : addonLocation.location,
            localOnly: addonLocation.local,
            deleteAfterHitnrun: deleteAfterHitnrun.enabled,
            deleteAfterHitnrunCron: deleteAfterHitnrun.cron || undefined,
          })
          .returning();

        logger.info('Creating admin user...');
        await this.userService.createUser(admin, tx, UserRole.ADMIN);
        logger.info('Creating non-admin users...');
        const nonAdminUsersPromises = nonAdminUsers.map((u) =>
          this.userService.createUser(u, tx, UserRole.USER),
        );
        await Promise.all(nonAdminUsersPromises);
        logger.info('finished creating users');
        return config;
      });
      this.scheduleDeleteAfterHitnrunCron();
      return ok({
        ...config,
        addonUrl: this.getAddonUrl(config.addonLocation, config.localOnly),
      });
    } catch (e) {
      logger.error({ error: e }, 'Error creating configuration:');
      throw createUnknownError('Error occurred while creating configuration.', e);
    }
  }

  public async updateConfig(
    data: UpdateConfigRequest,
  ): Promise<Result<ConfigurationResponse, AppError>> {
    const { addonLocation, deleteAfterHitnrun } = data;
    logger.info({ data }, 'Updating configuration:');
    try {
      const oldConfig = this.getConfig();
      if (oldConfig === null) {
        return createMissingConfigError(
          'Missing config in config service. Cannot update configuration.',
        );
      }

      const [newConfig] = await this.db
        .update(configurationTable)
        .set({
          addonLocation: addonLocation.location,
          localOnly: addonLocation.local,
          deleteAfterHitnrun: deleteAfterHitnrun.enabled,
          deleteAfterHitnrunCron: deleteAfterHitnrun.cron || undefined,
        })
        .returning();
      const deleteAfterHitnrunChanged =
        oldConfig.deleteAfterHitnrun !== newConfig.deleteAfterHitnrun ||
        oldConfig.deleteAfterHitnrunCron !== newConfig.deleteAfterHitnrunCron;
      if (deleteAfterHitnrunChanged) {
        this.scheduleDeleteAfterHitnrunCron();
      }
      return ok({
        ...newConfig,
        addonUrl: this.getAddonUrl(newConfig.addonLocation, newConfig.localOnly),
      });
    } catch (e) {
      return createUnknownError('Error occurred while updating configuration.', e);
    }
  }
}
