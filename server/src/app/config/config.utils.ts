import nodeCron, { type ScheduledTask } from 'node-cron';
import { db } from '@/db';
import type { ConfigurationResponse } from '@/db/schema/configuration';
import { configurationTable } from '@/db/schema/configuration';
import { env } from '@/env';
import type { UpdateConfigRequest } from '@/schemas/config.schema';
import { getLocalIpUrl } from '@/utils/https';

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
    addonLocation: data.addonLocation.local ? '' : data.addonLocation.location,
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
