import nodeCron, { type ScheduledTask } from 'node-cron';
import type { InferSelectModel } from 'drizzle-orm';
import { db } from 'src/db';
import {
  configurationTable,
  type ConfigurationResponse,
} from 'src/db/schema/configuration';
import { env } from 'src/env';
import type { UpdateConfigRequest } from 'src/schemas/config.schema';
import { getLocalIpUrl } from 'src/utils/https';

export function getAddonUrl(addonLocation: string, localOnly: boolean): string {
  if (localOnly) {
    return getLocalIpUrl(addonLocation, env.HTTPS_PORT);
  }
  return addonLocation;
}

export function getConfig(): ConfigurationResponse | null {
  const config = db.select().from(configurationTable).limit(1).get();
  if (!config) {
    return null;
  }
  return {
    ...config,
    addonUrl: getAddonUrl(config.addonLocation, config.localOnly),
  };
}

export function configRequestToInsertStatement(
  data: UpdateConfigRequest,
): typeof configurationTable.$inferInsert {
  return {
    addonLocation: data.addonLocation.location,
    deleteAfterHitnrun: data.deleteAfterHitnrun.enabled,
    deleteAfterHitnrunCron: data.deleteAfterHitnrun.cron,
    localOnly: data.addonLocation.local,
  };
}

export let _deleteAfterHitnrunCronTask: ScheduledTask | null = null;

export function scheduleHitnRunCron() {
  const config = getConfig();
  if (!config) {
    return null;
  }
  if (_deleteAfterHitnrunCronTask) {
    _deleteAfterHitnrunCronTask.destroy();
  }
  const cronExpression = config.deleteAfterHitnrunCron;
  if (config.deleteAfterHitnrun && cronExpression && nodeCron.validate(cronExpression)) {
    _deleteAfterHitnrunCronTask = nodeCron.schedule(cronExpression, () => {
      // TODO: Implement the task to be executed
    });
    _deleteAfterHitnrunCronTask.start();
  }
  return null;
}

export function getConfigResponse(
  config: InferSelectModel<typeof configurationTable>,
): ConfigurationResponse {
  return {
    localOnly: config.localOnly,
    addonLocation: config.addonLocation,
    deleteAfterHitnrun: config.deleteAfterHitnrun,
    deleteAfterHitnrunCron: config.deleteAfterHitnrunCron,
    addonUrl: getAddonUrl(config.addonLocation, config.localOnly),
  };
}
